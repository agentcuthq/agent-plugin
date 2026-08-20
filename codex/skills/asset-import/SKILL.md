---
name: asset-import
description: >-
  How media gets INTO a AgentCut project — the client-side import helper
  bundled with this skill (probe + transcode + upload on this machine, with
  ffmpeg already included, nothing to install), the `import_session` tool it
  needs, the cloud-upload fallback (`upload_start` → `video_create` →
  `ingest_start`), and the project asset pool for b-roll (images, gifs,
  music beds, sound effects). Use whenever a user hands over a video to
  edit — a local path, several paths, a dropped clip, a folder of takes,
  "import these", "add this footage", "start a job from this file" — or
  hands over media to add — "add this logo", "use this b-roll", "put this
  music under it", a sticker, a gif — or when an import failed part-way and
  needs resuming, or when you must decide between importing locally and
  letting the cloud ingest it. Covers batching, retry/resume, what is usable
  when (`video_id` vs transcript vs bytes), and the transcode rules.
---

# Asset import (AgentCut)

Importing is the one step that touches the user's machine. Everything after it
— compile, render, verify, QA — is cloud work on bytes AgentCut already has.
Get the import right and the rest of the workflow in the `video-editing` skill
just runs.

Two routes exist. Pick one per source, up front.

## First fork: what KIND of media is this?

Everything below the next heading is for **source footage** — the talking-head
video the edit is about, which needs probe/transcode/transcription. Additional
media is a different, much shorter path:

- **Source video to edit** (a take, a reel, an interview) → pick a route in
  the next section.
- **Additional project media** (b-roll, logo, image, gif, music bed, sound
  effect, a short cutaway clip) → **the project asset pool**, below. No
  ffmpeg, no transcode, no transcription — three calls.
- **A font** → declared in `timeline.json` under `settings.fonts` with
  `source: "google"` (any fonts.google.com family). The pool rejects fonts —
  see the `video-editing` skill's `references/assets.md`.

Do NOT push additional project media through the video import pipeline: it
probes, transcodes, and transcribes — a logo.png fails its conformance gates,
and a music bed would be "edited" as if it were speech.

## Pick the route (source footage)

| The source is… | Route |
|---|---|
| A readable local file, on a machine with a shell and usable ffmpeg | **Helper import** (below) — the default |
| A readable local file, but no shell or no usable ffmpeg | **Cloud upload** (`upload_start` → `video_create` → `ingest_start`) |
| A cloud/remote agent with no access to the user's disk | **Cloud upload** |
| An `http(s)` URL | Download it if you can, else **cloud upload** of the fetched bytes |
| Already imported into this project | Neither — reuse the existing `video_id` |

The helper is preferred because it overlaps the slow parts: transcription
starts on a small WAV while the big video is still uploading, so the transcript
is often ready by the time the upload finishes. The cloud route does the same
work, just serially and on the server, after the whole file has crossed the
wire.

**You do not need to install anything for the helper.** ffmpeg and ffprobe are
bundled with this skill for the platforms that have them (Apple Silicon macOS,
x64 Windows) and unpacked on first use. Do not ask the user to install ffmpeg,
and do not install it yourself; if no usable binary can be resolved, that is
the signal to take the cloud route, not to go shopping.

## The project asset pool

The pool is project-scoped: add an asset once, reference it from any video's
timeline in that project. Three calls end to end.

**Search before you import.** When the user *references* media without
attaching it ("use the logo again", "the whoosh from before"), or hands you a
file that may already be there, run `assets_search {project_id, name: …}`
first and reuse the existing `asset_id`. Asking for a file the pool already
has wastes the user's time; re-uploading one wastes an upload (the `sha256`
dedupe below is the backstop, not the plan).

**Folders: pick a bounded subset.** For "here's my stickers folder", don't
blanket-import everything — look at the files locally, add the ones the task
actually needs, and ask only when the choice is genuinely editorial.

The three calls:

1. **`asset_add`** `{project_id, filename, content_type, sha256?}` → returns
   `{asset_id, upload_url}`. Pass `sha256` of the bytes: identical ready bytes
   already in this project come back as `{asset_id, deduped: true}` with no
   upload at all.
2. **PUT the bytes** to `upload_url` (single PUT, `Content-Type` matching what
   you declared).
3. **`asset_commit`** `{asset_id, width?, height?, duration_s?}` → verifies the
   bytes actually landed (409 `upload_incomplete` otherwise) and flips the
   asset ready. Byte count is server-verified; dims/duration are recorded as
   your claim.

Then reference it: put the returned `asset_id` (the bare uuid) in an item's
`asset.assetId` in `timeline.json`. Browse with `assets_search {project_id}`,
look at one with `asset_inspect` (images and gifs come back inline), remove
with `asset_delete` — which is two-phase: the first call returns an impact
report of every timeline referencing the asset, and only `confirm: true`
deletes. After a confirmed delete the asset is hidden immediately; check
`bytes_removed` to learn whether storage confirmed removal.

**What renders today:** image items composite on cloud renders. Gif, video,
and audio pool refs resolve to media but the cloud compositor does not
composite those event kinds yet — a render whose refs resolve nowhere says so
in its `unresolved_refs` field instead of silently omitting the item.

Accepted content types: png/jpeg/webp/gif images, mp4/quicktime/webm video,
mpeg/mp4/wav/ogg audio. Fonts are rejected (see the fork above).

## Helper import

### 1. Mint a session

Call the **`import_session`** tool (`{project_id?}` to import into an existing
project; omit it to create one). It returns
`{token, endpoint, project_id, expires_at}`. The token is **project-scoped and
short-lived (~30 minutes)** — it authorizes exactly this import and nothing
else, over the connector's browser login; no credential is ever configured on
the machine.

Mint a **fresh session per batch**. Do not stash a token for later, do not
reuse one across batches, and never pass any other credential to the helper —
the session token is the only credential it takes.

### 2. Run the helper

```bash
node <skill-dir>/scripts/upload-media.mjs \
  --token <token> --endpoint <endpoint> \
  --job-root "<durable-dir>" \
  /path/to/take-1.mp4 /path/to/take-2.mov
```

`<skill-dir>` is the directory this SKILL.md lives in — resolve
`scripts/upload-media.mjs` relative to this file, do not go searching the
workspace for it. `--token` and `--endpoint` are both mandatory; they come from
the session you just minted. Durable jobs use `--job-root`, then
`AGENTCUT_JOB_ROOT`, then `~/agentcut-jobs` in that precedence order. Never
use a session scratchpad or another ephemeral directory as the job root.

- **Four files per run, maximum.** More than that → split into batches of four
  and mint a fresh session for each batch.
- Files in a run are processed **in parallel**, and each one becomes its **own
  video** in the session's project.
- Run it in the **foreground** and read its final JSON off stdout. Progress
  lines go to stderr prefixed `[agentcut-import] ` — relay those to the user
  rather than sitting silent through a multi-GB upload.

Success prints one pretty JSON object on stdout:

```json
{
  "schemaVersion": 1,
  "mode": "session-imported",
  "count": 2,
  "agentNext": "…",
  "imports": [
    {
      "sourcePath": "/path/to/take-1.mp4",
      "video_id": "vid_…",
      "project_id": "prj_…",
      "job_dir": "~/agentcut-jobs/job_take-1",
      "stem": "take-1",
      "duration_s": 412.5,
      "transcodeReason": "source accepted",
      "transcoded": false,
      "uploaded_bytes": 1843200000,
      "web_url": "https://…",
      "transcript": "complete",
      "transcribe_run_id": "run_…"
    }
  ]
}
```

The `~` above is shorthand for readability; the real JSON reports absolute
paths.

`stem` is the transcript stem — the same string that must be the **sources
key** in `timeline.json`. `web_url` is the page to hand the user. Read
`agentNext`: the helper says there what it thinks you should do next. The
local `job_dir` the helper writes is a convenience copy — over the connector,
the video's VFS is the canonical job dir; read artifacts with `files_get`.

### 3. Know what is usable when

This is the part that goes wrong. Three different things become ready at three
different times, and the helper's exit does not mean all three.

- **`video_id` — immediately.** As soon as it appears in the JSON you can
  address the video with every video-scoped tool and show the user the
  `web_url`.
- **Transcript artifacts — when the transcribe run completes.** Poll it with
  `run_status {run_id: <transcribe_run_id>}` and WAIT for it before any
  transcript or editorial work. `transcripts/<stem>.json`, `word_dump.txt`,
  `takes_packed.md`, `flags.txt`, `coverage.json` and the editorial brief
  `prompts/*.md` appear in the VFS on completion — not before. Reading a
  half-written transcript, or authoring against a missing brief, is the
  classic failure. Status responses return immediately and non-terminal ones
  carry `check_back_after_seconds` — sleep at least that long, at most one
  sleep-and-recheck cycle per turn, never busy-poll. Details, stuck
  heuristics and the retry flow (`transcribe_start`): the `transcription`
  skill.
- **Byte-dependent work — when the video upload is finalized.** Render, verify
  and the `qa_*` visuals need the server to hold the whole file. **A
  successful helper exit already guarantees this** — the helper does not exit
  `0` until the upload is finalized. So after a clean run there is nothing
  extra to wait on for bytes; the only remaining wait is the transcribe run.

Say precisely what you are waiting on. "The video is imported (`vid_…`),
waiting on transcription" is true and useful; "waiting for the upload to get
the id" is neither.

Read the `transcript` field before you decide anything:

| `transcript` | What happened | What to do |
|---|---|---|
| `"complete"` | The run finished; the artifacts are in the VFS. | Nothing — start editing. |
| `"started"` | The run is still going; the helper stopped waiting on purpose so it would not hold you. `transcribe_run_id` and `transcript_error` say where it got to. | Poll `run_status`, then read the artifacts with `files_get`. Nothing is re-uploaded. |
| `"failed"` | The transcription leg genuinely errored. | `--transcription-only --video-id <id>` (helper), or `transcribe_start {video_id}`. |
| `"skipped"` | `--no-transcribe` was passed. | Nothing. |

`"started"` is not a failure and it is not a reason to re-import. The video is
uploaded and finalized either way.

## When the helper fails

On failure the helper prints JSON on **stderr** and exits `1`:

```json
{
  "ok": false,
  "message": "…",
  "videoId": "vid_…",
  "sourcePath": "/path/to/take-1.mp4",
  "retry": { "mode": "…", "hint": "…", "args": ["…"] }
}
```

To resume: **mint a fresh session** with `import_session` (the old token is
probably expired — that is often the failure) and re-run the helper with the
emitted `retry.args`. Those args already carry `--video-id <id>`, so the retry
continues the same video instead of creating a duplicate. They also preserve
the resolved `--job-root`, so a changed cwd or environment cannot send the
retry elsewhere. Do not hand-assemble a retry command when `retry.args` is
present, and do not re-import the file from scratch.

**A transcription failure degrades, it does not fail the import.** The video
is still there and still renderable; only the transcript leg is missing. Redo
just that leg with:

```bash
node <skill-dir>/scripts/upload-media.mjs --token <token> --endpoint <endpoint> \
  --transcription-only --video-id <video_id> /path/to/take-1.mp4
```

Nothing is re-uploaded, and the video keeps its id. If the local file is gone
by then, `transcribe_start {video_id}` is the other way back. Either way, poll
the new run before touching the transcript — see the `transcription` skill.

## What the helper does to the file

Facts, so you can explain the result — not knobs to fiddle with.

- **A conforming source uploads untouched.** H.264, long edge ≤ 1920, a sane
  bitrate, no rotation metadata, healthy audio channel layout → the original
  bytes go up as-is and `transcodeReason` reads `"source accepted"`. This is
  the fast path and it is common.
- **Anything else is transcoded locally**: H.264, long edge ≤ 1920, ≤ 8 Mbps.
  Hardware encoders are used when present — VideoToolbox on macOS,
  NVENC / QSV / AMF on Windows — with **libx264 as the fallback**, so the
  result is the same shape either way, just slower. `transcoded: true` and
  `transcodeReason` say which gate the source tripped (codec, size, bitrate,
  rotation, audio layout).
- **Transcription audio is a 16 kHz mono WAV**, extracted and uploaded FIRST
  so the cloud can transcribe while the video is still climbing the wire.
  This is why the transcript is often ready the moment the upload lands.
- **Bundled binaries**: gzipped ffmpeg/ffprobe for `darwin-arm64` and
  `win32-x64`, SHA-256-verified and unpacked to
  `~/.cache/video-editing/ffmpeg/` on first use. Elsewhere the helper uses
  `ffmpeg`/`ffprobe` from PATH; if neither resolves, take the cloud route.

The transcode exists to make the upload survivable and the cloud's job
predictable. It is **not** an editorial pre-render: never concatenate, trim,
burn captions, mix down, or otherwise "prepare" the user's footage locally
before importing. Import the originals and cut them in `timeline.json`.

## Flags and environment

| Flag | Effect |
|---|---|
| `--token <t>` / `--endpoint <url>` | From `import_session`. **Required.** |
| `--input <path>` | Another source; repeatable. Equivalent to a positional path. |
| `--video-id <id>` | Continue an existing video instead of creating one (retries, `--transcription-only`). |
| `--transcription-only` | Redo only the transcription leg for `--video-id`. |
| `--no-transcribe` | Import the video without the transcript leg. |
| `--transcribe-wait-ms <ms>` | Cap on waiting for the transcribe run. Default: 2× source duration, min 5 min, max 20 min. Past it the helper returns `transcript: "started"` rather than blocking you. |
| `--json-out <path>` | Also write the result JSON to a file. |
| `--job-root <dir>` | Durable job parent. Overrides `AGENTCUT_JOB_ROOT`; default `~/agentcut-jobs`. Never use session scratch. |
| `--work-dir <dir>` | Disposable transcode scratch only; default is the OS temp directory and it is removed on exit. |
| `--ffmpeg <path>` / `--ffprobe <path>` | Explicit binaries; also `FFMPEG_PATH` / `FFPROBE_PATH`. |

Environment:

- `AGENTCUT_JOB_ROOT` — durable job parent when `--job-root` is omitted.
- `AGENTCUT_IMPORT_HWACCEL=0` — disable hardware encoding, force libx264.
  Reach for this when a hardware encode produces a broken or blocky file.
- `AGENTCUT_IMPORT_HW_ENCODERS` — override the encoder preference order.

## Fallback: cloud upload + server ingest

When there is no shell, no usable ffmpeg, or no readable path to the file:

1. **`upload_start`** `{kind: "asset", size, content_type, filename?}` — YOU
   PUT the bytes. Normally you get `parts` (PUT each one, keep every ETag) and
   finish with **`upload_complete`** `{upload_id, parts}`; on deployments
   without chunked uploads you get a single-PUT `upload_url` instead and
   nothing further is needed. `upload_parts` re-signs expired part URLs;
   `upload_abort` abandons cleanly.
2. **`video_create`** `{asset_id, title?, project_id?}` binds the uploaded
   source to a new video (or pass `media: "external"` first to reserve a
   `video_id` before any byte is uploaded, and bind later via `ingest_start`).
3. **`ingest_start`** `{video_id}` runs the server-side pipeline — probe →
   vertical master → WAV → silence detection → transcription — pushing
   everything to the VFS. Returns `{run_id}`; poll `run_status` (this takes
   minutes), then read the artifacts with `files_list` / `files_get`.

Slower overall (nothing overlaps, and an unconformed source crosses the wire
at full size), but it needs nothing from the local machine beyond the network.
It is a legitimate route, not a defeat — say which route you took and why, and
don't fall back silently when the helper failed for a reason a retry would
fix.

## Repeated server error troubleshooting

If the same server error repeats twice on `qa_*`/`render_start`, do not retry
a third time. Use the `bash` tool to inspect the project sandbox: check
symlink targets with `readlink -f`, tail `render.log`, and report findings.
