---
name: video-editing
description: >-
  Cloud agent workflow for editing a talking-head video into a tight, clean
  cut with the AgentCut MCP tools. Everything runs server-side —
  transcription, editorial screening, timeline compilation, rendering,
  verification, and QA visuals; there is no local CLI and no local job
  directory. The one optional local step is importing a source file with the
  bundled helper (ffmpeg ships with the asset-import skill, nothing to
  install). Use whenever the user drops a talking-head clip / reel / vlog /
  interview and wants it edited or tightened — "edit this reel", "cut the bad
  retakes", "clean up this recording", "tighten this", "add captions", or
  just a video path with an editing ask. Handles Hebrew/RTL.
---

# Video Editing (AgentCut cloud)

Turn a raw talking-head recording into a tight, clean cut. The cloud owns the
whole pipeline: transcription, screening, editorial prompts, timeline
compilation, rendering, verification, and QA visuals. You drive it with the
AgentCut MCP tools. **You** read the transcript + editorial brief and author
`timeline.json`; the server does the rest.

Before the first AgentCut tool call, make sure the host-basics skill for this
plugin has loaded (`agentcut-basics-claude` in Claude Code, `agentcut-basics`
in Codex) — it carries login recovery, the tool namespace, and delivery rules.

## The operating model (read first)

- **Every video-scoped tool takes `video_id`.** There is no job directory on
  this machine. The video's **VFS is the job dir**: `files_list` enumerates it,
  `files_get` reads one artifact, `files_put` writes one. `resolved/*` is
  compiler output that `timeline_compile` rewrites every run — never hand-edit
  it, and never write files under `resolved/` yourself.
- **Find work with `project_list` / `project_get`** instead of asking the user
  for ids. `project_delete` is a restorable soft delete and, like every
  destructive verb, requires an explicit `project_id`.
- **Results, not exit codes.** `timeline_compile` returning `ok: false` with
  `diagnostics.errors` is a normal answer — read the reported paths and fix. A
  tool *error* means the call itself failed (bad argument, auth, network).
- **Async work is a run.** `verify_start`, `ingest_start`, `transcribe_start`
  and `smooth_joins_start` return `{run_id}` immediately; poll `run_status`.
  Non-terminal responses carry `check_back_after_seconds` — sleep at least that
  long, at most one sleep-and-recheck cycle per turn, never busy-poll.
- **The sandbox is the escape hatch.** `bash` / `read_file` / `write_file` give
  you a real shell in the project's sandbox for anything the verbs don't
  cover. Everything you create there is EPHEMERAL until `files_push` copies it
  into the VFS.
- **Where the schema answers live:** `references/timeline-vocabulary.md` in
  this skill is the full field list, and a rejected field comes back from
  `timeline_compile` naming the keys that path accepts. If neither has what
  the user asked for, the gap is real — say so rather than working around it.
- **The deliverable is the editable timeline in the browser** (the token-free
  `web_url` returned by the verbs), not a file on disk.

## Timeline edit lease (mandatory for revisions)

Once the target video is known, `files_list {video_id}` may be used to determine
whether `timeline.json` already exists. When **revising an existing timeline**,
generate one UUID, then call `timeline_edit_start {video_id, edit_id}` before
the first edit-related `files_get` or authoring action. Reuse that exact
`edit_id` if the start request must be retried, and keep the returned matching
id. This is the browser editor's
signal that an agent owns the live timeline; the user sees the AI timeline
blocker instead of unknowingly editing concurrently. Every intervening
video-scoped AgentCut tool call renews the 10-minute lease.

Treat the remaining edit workflow as a `try/finally` even though tool calls are
not code: after the final timeline write, call
`timeline_edit_finish {video_id, edit_id, outcome:"success"}`. If authoring,
compilation, verification, a tool call, or the overall task fails or is
abandoned, call the same finish tool with `outcome:"failure"` before reporting
the failure. Both outcomes unlock the timeline. Never leave cleanup until a
later turn. Do not open this lease for read-only QA, transcription, ingest, or
render-only requests.

Initial timeline creation has no editable timeline to lock. Author and publish
the first valid `timeline.json` normally. If the workflow then continues into a
revision or fix cycle, start the lease before the next edit-related read or
authoring action. A premature start reports `no_timeline` to make this boundary
explicit.

## The workflow

1. **Import the source** — follow the **`asset-import`** skill; it owns this
   step end to end. In short:
   - **Readable local file + a shell (the default):** `import_session` mints a
     30-minute project-scoped token, then run the bundled helper —
     `node <asset-import-skill-dir>/scripts/upload-media.mjs --token <token>
     --endpoint <endpoint> "<path>" …` (≤ 4 files per run, fresh session per
     batch). It probes, conforms the file only if it must, and uploads a
     16 kHz WAV first so transcription runs **during** the video upload.
   - **No local file, no shell, or a URL source:** `upload_start` (you PUT the
     bytes) → `video_create` → `ingest_start`, then poll `run_status`.

   Either route ends with the same VFS artifacts: `transcripts/<stem>.json`,
   `word_dump.txt`, `takes_packed.md`, `flags.txt`, `coverage.json`,
   `probe.json`, `analysis.json` — **and `prompts/author-edl.prompt.md`, your
   editorial brief** — plus the video's `web_url`. **Wait for the transcribe
   run to complete before step 2** (`run_status`); the brief and transcripts
   do not exist until it does — see the `transcription` skill. Filenames with
   apostrophes, spaces, or unicode are safe — the internal stem is sanitized
   automatically; never rename the user's file.
2. **READ the pulled brief and follow it** — `files_get` every `prompts/*.md`.
   They are your editorial brief (what to cut, what to keep, the screening
   gate, the pad and boundary rules). They are authoritative and may change
   between runs; never substitute a remembered brief. Read all of `flags.txt`,
   `takes_packed.md`, `coverage.json`, and `word_dump.txt`, and adjudicate
   every flagged collapsed token, repeat, and sound-in-gap before authoring.
   Inventory retakes, false starts, pauses, hook, outro, and intentional
   repeats with exact source times.
3. **Author `timeline.json`** per the brief plus
   `references/timeline-vocabulary.md` (items on video/audio lanes, captions,
   zooms, overlays, b-roll, audio). The **sources KEY must equal the
   transcript stem** (the filename of `transcripts/<stem>.json`) — captions
   and resolve bind through it. Resolve phrase → seconds ONLY with
   `timeline_resolve {video_id, phrase, occurrence?, near?}` — never eyeball
   times from `word_dump.txt`. Author speech items in intended output order
   with placeholder starts, then `timeline_pack {video_id, track, start: 0}`.
   After packing, `timeline_desilence {video_id, ripple: true}` — pause
   tightening is an explicit authoring step; compile never does it. If the
   user wants a non-vertical output (or "same as the source"), set the canvas
   with `timeline_canvas {video_id, ratio}` — presets `16:9`/`9:16`/`1:1`/
   `4:3`/`3:4`/`original`; it refits placed items and captions (see
   `references/timeline-vocabulary.md` → Settings). Add
   deliberate gaps only afterward, with
   `gapBefore: {"intent":"intentional","reason":"…"}` on the right speech
   item; never pack a lane containing those markers. Anything that is not the
   source video — b-roll, a logo, a music bed, a font — is referenced through
   the project asset pool or `settings.fonts`; see `references/assets.md`.

   Write the document with `files_put {video_id, path: "timeline.json",
   content: <exact JSON>, content_type: "application/json"}` — the authored
   timeline updates in the editor immediately. The editor keeps the last good
   compiled preview while the new revision compiles, then refreshes itself when
   that revision is published; no page reload or scrub is required.
4. **Compile** — `timeline_compile {video_id}` compiles the stored
   `timeline.json` synchronously (or pass `timeline` inline to persist and
   compile in one call). It writes `resolved/plan.json` +
   `resolved/diagnostics.json` and returns the watch link — the user can
   already watch and comment on the compiled cut. Read `diagnostics` and fix
   until `ok: true`: validation failures name the offending paths; an
   ambiguous anchor is disambiguated with `timeline_resolve`.
5. **Render the preview** — LOCAL FIRST. If you have a shell, run the
   video-render skill's preflight once per conversation:
   `node <video-render skill dir>/scripts/render-video.mjs --preflight`.
   Exit 0 → local is the render path for previews AND finals from here on:
   `render_session {video_id, mode: "preview", plan_sha256}` →
   `node <video-render skill dir>/scripts/render-video.mjs --token
   <render_token> --endpoint <endpoint> --render-id <render_id>` (blocks until
   the render settles and prints one JSON result; `render_status` shows the
   same live progress meanwhile, and the result uploads to the cloud exactly
   like a cloud render). Exit-code contract: 1 = real render failure (already
   settled failed — inspect, fix, new session), 2 = this machine can't render
   (fall back below), 3 = the run went terminal underneath (check
   `render_status`).
   No shell, or preflight exited 2? For a data-only plan, use the **cloud
   fallback**: `render_start {video_id, mode: "preview"}`, then poll
   `render_status` about every 10 s until terminal. A plan containing any
   `kind:"html"` layer requires the current local helper and its
   `hf-browser-sandbox@1` capability; hosted rendering rejects it with
   `MOTION_BACKEND_UNSUPPORTED` (behind-subject plans likewise with
   `BEHIND_SUBJECT_BACKEND_UNSUPPORTED`). Never replace motion with an image
   or remove the layer to force a render. To place an overlay BEHIND the
   person, see "Behind the subject" in references/timeline-vocabulary.md —
   matte first (video-render skill's matte-subject.mjs), then
   `"behindSubject": true` on the item. Either way, share the returned watch link with
   the user; when complete `render_status` carries a signed `video_url`.
6. **Verify** — `verify_start {video_id}` → poll `run_status` → `files_get
   verify.json`. Fully server-side verification of the rendered preview
   (catches retakes left in across a join and dead air a visual check
   misses). Fix `timeline.json`, re-compile, re-render, re-verify until
   clean; cap at ~3 fix passes and surface remaining findings rather than
   looping.
7. **QA looks** — spot-check any window with server-rendered visuals; the
   PNGs come back **inline as images**. THE close-look tool is
   `qa_inspect {video_id, start, end}`: filmstrip + waveform + word labels
   with the compiled plan's cut regions shaded red, one image. Same
   addressing modes everywhere: `start`/`end` in SOURCE seconds, `join: <i>`
   (1-based plan join), or `out_start`/`out_end` (OUTPUT seconds mapped
   through the plan). `qa_frames` is the filmstrip alone, `qa_waveform` the
   waveform + word timings, and `qa_framing` is THE reframe measuring tool —
   full uncropped frame, normalized grid, red box for the current crop,
   green box for a proposed `center_x`/`center_y`. Use it before authoring
   any reframe; add `end` for a contact sheet of a moving speaker.
8. **Release and render final** — if this workflow opened an edit lease, call
   `timeline_edit_finish {video_id, edit_id, outcome:"success"}` after the final
   clean timeline write. Then render the final the same way as step 5: local
   path when preflight passed (`render_session {video_id, mode:"final"}` + the
   helper), else `render_start {video_id, mode:"final"}` for data-only plans.
   HTML plans still require the safe local helper. If a leased revision exits
   earlier, the mandatory failure cleanup above still applies. A first
   publication that needed no follow-up revision has no lease to release.
   A crashed local render can 409 `render_in_progress` for up to ~15 minutes
   until the server notices the silence — poll `render_status` of the named
   `activeRunId`, then retry.

**Optional, any time after compile:** if joins sound clicky, chopped, or gappy,
`smooth_joins_start {video_id}` applies an equal-power audio crossfade to every
cut — poll `run_status`, then `files_get audio/joined.json` for the per-join
report. Renders consume the result only while it matches the current compile —
re-run it after each recompile you want it applied to. See
`references/audio-joins.md`.

## Your editorial brief arrives from the cloud

The deep editorial brief — retake/keep rules, pause tightening, cold-open,
screening and verification procedure — is **not in this skill**. It is
generated server-side during ingest and lands in the VFS as `prompts/*.md`.
If `prompts/author-edl.prompt.md` is missing from `files_list`, the transcribe
run has not completed — poll it; do not improvise a brief.

## Known caveats

- **Loudness and log colour are already handled.** Ingest measures every source
  into `analysis.json` and the render applies two automatic repairs: programme
  audio is loudness-normalized (-12 LUFS / -1 dBTP by default), and log-encoded
  footage (S-Log3, V-Log, C-Log, D-Log, F-Log, LogC) gets a levels + gamma +
  saturation recovery. Audio recorded onto a single channel is copied to both
  sides at ingest. When a customer asks for a different level or wants the flat
  log look kept, `settings.audio` / `settings.colorNormalize` (see
  `references/timeline-vocabulary.md`) is the knob — it survives a recompile,
  where a one-off filter or a re-authored item would not.
  **`analysis.json` is the first thing to read when a source looks or sounds
  wrong**: it records what was detected and the numbers behind the verdict. If
  it is missing, or it disagrees with what the user is seeing, that is a real
  finding about ingest — report it, don't paper over it.
- **Log detection can be overruled.** It is deliberately conservative, and its
  range criterion is defeated by a bright sky (`yMax` is a per-frame maximum).
  When `analysis.json` shows a lifted black floor and low saturation but
  `logSuspected: false`, set `settings.colorNormalize: "force"` — it applies
  the recovery from the measured statistics regardless of the verdict. Do not
  reach for `settings.grade` instead: that is a creative LOOK, and applying a
  tint to flat footage is not the same repair.
- **A flood of verify dup findings means the GATE is broken, not the cut.**
  A retake left in is rare, so real findings cluster at a few joins. Dozens of
  duplicated-phrase errors — or one at nearly every join — is a malfunctioning
  detector. Verify catches this itself and returns
  `verdict: "detector-error"`, suppressing the unusable findings. **Do not
  recut against them, and do not re-run hoping for a different answer** —
  report the tooling failure.
- **`detector-error` also covers the opposite failure: the check not running
  at all.** If the transcribed words reach the detector unusable, verify says
  so ("could not run") instead of reporting a cheerful clean for a cut it
  never examined. Treat that as **unverified, not approved**.
- **In default (quick) mode verify only flags repeats that straddle a join.**
  A repeated phrase with both copies on the same side of a cut (natural
  wording reuse) is ignored, and a dup event spanning two nearby joins is
  reported once. So a flagged join is usually a real doubled phrase; still
  adjudicate 2-word-repeat warnings (spelled acronym / number / emphasis)
  against `flags.txt` before recutting. **`mode: "full"` has NO straddle
  filter** — it reports every near-adjacent repeat in the preview,
  intentional ones included, so expect to adjudicate far more of them.
- **Verify join indices address compiled speech joins.** Use the finding's
  item ids to find the authored items. A join with more than 5 ms of marked
  intentional output gap is reported for timing context but is not
  smoothness-scored. The same gap without `gapBefore` intent is a
  verification error, not an implicit editorial decision.
- **Caption mistranscriptions** are fixed with a captions override in
  `timeline.json` (anchored on the MIS-transcribed text — see
  `references/timeline-vocabulary.md`), then recompile + re-render. Never
  with subtitle files or filters.

## In-app editor handoff

For a AgentCut MCP result with
`structuredContent.browserHandoff.required: true`, open
`structuredContent.browserHandoff.url` in the host's **in-app Browser**. That
URL is an authentication credential: never print it, put it in Markdown, or
otherwise show it to the user. The token-free `web_url` is the only link safe
to share. Host-specific handling (tab reuse, approval cards, stall handling)
lives in the basics skill for your host.

## Repeated server error troubleshooting

If the same server error repeats twice on `qa_*`/`render_start`, do not retry
a third time. Use the `bash` tool to inspect the project sandbox: check
symlink targets with `readlink -f`, tail `render.log`, and report findings.
For the LOCAL render helper the log is on this machine: the work dir it prints
(`~/.cache/video-editing/render/<video_id>/renders/<render_id>/render.log`,
kept on failure) — tail it before deciding between a local retry and the
cloud fallback.

## Hebrew / RTL

Hebrew/RTL sources are fully supported. Read the transcript word-by-word with
explicit timestamps to avoid visual-reorder confusion; anchor phrases via
`timeline_resolve` exactly as with LTR text. Sentence-ending punctuation for
caption grouping is the same characters in Hebrew.

## References

- **`asset-import` skill** — getting media into a project: `import_session`,
  the bundled upload helper, batching, retry/resume, transcode facts, the
  cloud-upload fallback, and the project asset pool. Read it before importing
  anything.
- **`transcription` skill** — transcript readiness and repair: which
  artifacts appear when, polling the transcribe run, server-side healing, and
  the transcription-only redo.
- `references/timeline-vocabulary.md` — the authored lanes/items vocabulary,
  absolute output timing, pack/desilence/shift, captions, overlays, audio,
  fonts, and editorial metadata.
- `references/assets.md` — the project asset pool, fonts, and how an item
  references registered media.
- `references/audio-joins.md` — smoothing speech joins with
  `smooth_joins_start`.
