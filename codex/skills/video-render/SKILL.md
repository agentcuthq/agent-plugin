---
name: video-render
description: >-
  How AgentCut videos get RENDERED on this machine — the local render helper
  bundled with this skill (render-video.mjs: bake + HyperFrames + loudness on
  the user's own computer, with ffmpeg, the hyperframes renderer, and a
  headless Chromium already included, nothing to install), the
  `render_session` tool that admits a local render, and the cloud fallback
  (`render_start`) for machines that can't. Local renders upload their result
  back to the cloud, so render_status, verify, QA frames, posters, and share
  links behave exactly like cloud renders. Use whenever a render is needed —
  "render the preview", "export the final", step 5/8 of the video-editing
  workflow — and a shell is available. Covers the one-time preflight, the
  exit-code fallback contract, progress reporting, and crash recovery.
---

# Local video render (AgentCut)

Renders execute on THIS machine with the helper bundled in this skill, and the
finished mp4 is uploaded back to the cloud where it settles exactly like a
cloud render. The cloud (`render_start`) remains the fallback for data-only
plans on machines that can't render locally. Any plan containing `kind:"html"`
requires this helper's safe browser path; hosted rendering rejects it with
`MOTION_BACKEND_UNSUPPORTED`. Plans with behind-subject cutouts are likewise
local-only (`BEHIND_SUBJECT_BACKEND_UNSUPPORTED` on hosted executors).

## One-time preflight (once per conversation)

```bash
node <this skill dir>/scripts/render-video.mjs --preflight
```

- **exit 0** — this machine renders locally and advertises
  `hf-browser-sandbox@1`. Use the local path for previews AND finals for the
  rest of the conversation.
- **exit 2** — it can't (unsupported platform, bundled tools won't
  materialize, browser won't launch). Use `render_start` (cloud) instead and
  don't retry the helper.

First use materializes the bundled tools into `~/.cache/video-editing/`
(hash-verified); later runs are instant.

## Rendering

1. `render_session {video_id, mode: "preview"|"final", plan_sha256?}` →
   `{render_id, render_token, endpoint}`. Same admission guards and honesty
   diagnostics (`unresolved_refs`, `omitted_layers`) as `render_start`.
2. Run the helper, verbatim (blocks until the render settles; safe to run in
   the background and poll `render_status`, which shows the same live
   phases/frames a cloud render would):

```bash
node <this skill dir>/scripts/render-video.mjs \
  --token <render_token> --endpoint <endpoint> --render-id <render_id>
```

3. The helper prints ONE JSON result on stdout (progress goes to stderr).
   On success the run is already settled: previews land in the video's VFS as
   `preview.mp4` (verify/qa_frames work immediately), finals register the
   shareable asset and `render_status` carries the signed `video_url`.

## Exit codes = the fallback contract

| exit | meaning | what to do |
|------|---------|------------|
| 0 | rendered + settled | continue the workflow |
| 1 | render failed (run settled `failed`) | read `message`: plan problem → fix, new `render_session`; environment-looking → one cloud `render_start` attempt |
| 2 | this machine can't render | data-only plan: `render_start`; HTML plan: report `MOTION_BACKEND_UNSUPPORTED` |
| 3 | run went terminal underneath (superseded / timed out) | check `render_status`, then mint a new `render_session` |

## Subject mattes (behind-subject overlays)

`matte-subject.mjs` (bundled next to render-video.mjs) produces the
person-cutout matte that `behindSubject: true` overlays need — see the
video-editing skill's timeline vocabulary for the authoring side.

```bash
node <this skill dir>/scripts/matte-subject.mjs \
  --input <local source video> --from <srcStart> --to <srcEnd>
```

It extracts the source-time range (padded 0.5s each side), runs the bundled
engine's person segmentation locally (first run downloads a ~176 MB model;
inference peaks ~1.5 GB RAM; minutes per 10s of footage), and prints ONE JSON
result with the alpha-webm path and its `{srcStart, srcEnd}` descriptor. Then:
upload the file with `asset_add` (mime `video/webm`) + PUT + `asset_commit`,
and register the descriptor (with the returned assetId) under
`sources.<stem>.mattes` in timeline.json. Matte only the window you need —
segmentation is expensive and the matte is reusable across re-cuts of the
same source range.

## Crash recovery

- Ctrl-C / kill: the helper settles its run `failed` on the way down, freeing
  the one-render-per-(video, mode) slot immediately.
- Hard crash / lid closed too long: the server times the run out after ~15
  minutes of heartbeat silence. Until then `render_session` may 409
  `render_in_progress` naming the `activeRunId` — poll its `render_status` or
  wait, then retry.
- A restarted helper may simply be re-run with the same token/render-id while
  the run is alive — the manifest re-fetch re-signs every URL.

## Do not

- Do not call `render_start` when preflight passed — the local path is
  preferred (same output, no cloud render cost).
- Do not strip, rasterize, or silently omit an HTML/motion layer when safe
  local rendering is unavailable. Preserve the authored timeline and report
  the capability error.
- Do not edit files under `scripts/` — `render-video.mjs` and the archives are
  hash-locked build artifacts.
