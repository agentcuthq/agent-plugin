---
name: transcription
description: >-
  Transcript readiness and repair for AgentCut videos — which artifacts appear
  when (`transcripts/<stem>.json`, `word_dump.txt`, `takes_packed.md`,
  `flags.txt`, `coverage.json`, `prompts/*.md`), how to poll the transcribe run
  instead of guessing, what the server's automatic healing pass does, and how to
  redo only the transcription leg when it fails. Use when a transcript is
  missing, empty, truncated or stale, when captions read back wrong, when an
  import finished but the editorial brief has not appeared, when transcription
  looks stuck, or before any transcript-dependent work on a freshly imported
  video. Handles Hebrew/RTL.
---

# Transcription (AgentCut)

Transcription is the gate between "the video is imported" and "I can edit it".
It runs **in the cloud** on both import routes — the `asset-import` helper
uploads a 16 kHz mono WAV first so transcription can run *during* the video
upload; server-side ingest extracts and transcribes after the source lands.
Same artifacts either way.

## Wait for the run, don't guess

The transcribe run is a real run with a real id. Poll it with
`run_status {run_id}`.

Never infer readiness from "the import returned" — the helper's exit
guarantees the *video bytes* are finalized, not that the transcript is
written. `files_list {video_id}` shows which artifacts exist in the VFS, and
is the quick check before an editorial step.

Polling discipline: `run_status` returns immediately — nothing blocks. A
non-terminal response carries `check_back_after_seconds`; sleep at least that
long, then poll once more. **At most one sleep-and-recheck cycle per turn;
never busy-poll.** If your current task is not blocked on the transcript, say
the run is still going and move on. While waiting, say exactly what you are
waiting on ("transcription for video X, ~2 min in") — and never say you are
waiting for an upload "to get the video id" after registration already
returned one.

## What appears, and when

Nothing below exists until the transcribe run **completes**; then all of it
does, at once — in the video's VFS (`files_list` / `files_get`).

| Artifact | What it is |
|---|---|
| `transcripts/<stem>.json` | The canonical word-level transcript with timings. The thing everything else is derived from. |
| `word_dump.txt` | Flat word list for reading. **Never eyeball times off it** — resolve phrases with `timeline_resolve`. |
| `takes_packed.md` | Screened takes, packed for editorial reading. |
| `flags.txt` | Screening flags — repeats, stumbles, spelled acronyms, numbers. Adjudicate verify warnings against it. |
| `coverage.json` | Transcript coverage against the source duration. A low number means speech was missed, not that the cut is bad. |
| `prompts/*.md` | **Your editorial brief**, generated server-side. Authoritative; never substitute a remembered brief. |

`probe.json` and `analysis.json` come from ingest, not from transcription, and
may land earlier.

The VFS is the source of truth; reading again with `files_get` is always safe.

## Healing happens on its own

The ASR occasionally collapses a run of words into one token. The server
detects those windows and **re-transcribes just those slices of the WAV
automatically**, merging the result back before the transcript is written. You
will see `healing` progress events with the window bounds while the run is in
flight — that is the repair working, not a failure. Do not retry a run because
you saw healing events, and do not hand-patch a transcript to work around a
collapse.

What you get at the end is the healed transcript. If words are still visibly
wrong in the *output*, that is a caption fix (a captions override in
`timeline.json`, anchored on the mis-transcribed text), not a transcription
retry.

Healing never blocks the artifacts. A window the server cannot heal (after its
own retries) is **skipped and recorded** — you'll see a `healing_failed` event
for the window and a `healing_partial` event listing the unhealed spans, and
the run still completes with the full artifact set. Check `coverage.json` for
the gaps; only re-run transcription if a gap actually covers speech you need.

## Is it stuck?

One non-terminal poll is not evidence, and neither is a quiet stretch: the
transcription pipeline runs on a durable workflow engine that retries hung
calls and re-runs dead steps by itself. A `stale: true` flag on `run_status`
means "no event lately", not "dead" — keep polling on the check-back cadence
and cross-check `files_list` for artifacts that already landed. Judge against
the media length and the wall-clock time actually elapsed:

- Explicit `failed` / `errored` / `timed_out` terminal state → **retry
  immediately** (below) after confirming the WAV is uploaded and the source
  has audio.
- Still pending/running with no error → treat as stuck only after
  `max(5 minutes, min(60 minutes, 2× media duration))`. Wait at least 5
  minutes for a 30-second clip, about 20 minutes for a 10-minute source, and
  about an hour for anything over 30 minutes.
- Duration unknown → give it at least 10 minutes across more than one poll.

While waiting, tell the user what you are waiting on and roughly how long. Do
not spin silently, and do not start authoring against a transcript that is not
there.

## Repair: redo the transcription leg only

A transcription failure **degrades** — the video imported fine, has a
`video_id`, and can be compiled and rendered. Only the transcript is missing.

**Retry is cheap by design**: the server checkpoints the raw and healed ASR
output in the VFS, so a retry resumes from whatever already succeeded instead
of re-paying the full pass. Pick the retry that matches what you have:

**The WAV is already uploaded** (any route where ingest/import got that far) —
the force-retry verb, fire-and-forget:

```
transcribe_start {video_id}                # resumes from checkpoints
transcribe_start {video_id, force: true}   # genuinely fresh ASR run
```

**The local source file is still readable** (helper route) and the WAV never
uploaded — redo just the transcription leg. Nothing else is re-uploaded and
the video keeps its id:

```
import_session {project_id}      # fresh token + endpoint
node <asset-import-skill-dir>/scripts/upload-media.mjs \
  --token <token> --endpoint <endpoint> \
  --transcription-only --video-id <video_id> /path/to/source.mp4
```

See the `asset-import` skill for the session/helper mechanics.

**The WAV never made it and the local file is gone** — re-run the whole
server-side leg with `ingest_start {video_id}` (it re-derives the WAV from the
stored source), then poll `run_status`.

Either way, poll the new run to completion before touching the transcript
again. Do not chain a third retry hoping for a different answer — two clean
failures on the same source is a finding to report (bad audio, silent track,
unsupported language), not something to loop on. Reserve `force: true` for
when the *content* of the checkpoints is the problem (wrong language hint,
wrong speaker count) — a plain retry is otherwise always the better first
move.

## Empty or wrong-looking transcripts

- **Empty / near-empty transcript, healthy video** — check the audio first.
  `analysis.json` records the channel layout and per-channel levels; a source
  recorded onto one dead channel or with no programme audio at all transcribes
  to nothing, and no retry will change that.
- **Coverage far below the duration** — long music/silence stretches are
  normal; a talking-head recording with 40% coverage is a real finding.
- **Right words, wrong times** — you are almost certainly reading
  `word_dump.txt` by eye. Use `timeline_resolve {video_id, phrase, occurrence?}`;
  it is the only sanctioned phrase → seconds path.

## Hebrew / RTL

Hebrew and other RTL sources are fully supported end to end. Read the
transcript **word by word with explicit timestamps** rather than trusting how
a line renders — visual reordering makes eyeballing an RTL transcript actively
misleading. Anchor phrases with `timeline_resolve` exactly as in LTR text;
sentence-ending punctuation for caption grouping is the same set of
characters. Caption rendering of RTL text is the cloud renderer's job — do not
attempt local bidi fixes.
