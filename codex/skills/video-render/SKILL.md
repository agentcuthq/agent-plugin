---
name: video-render
description: >-
  How AgentCut renders committed timelines through the configured GPU
  execution plane. Use whenever a preview or final render is needed.
---

# Rendering (AgentCut)

Rendering is a server-managed asynchronous operation. Executor selection,
worker tokens, and backend capabilities are internal concerns and are never
chosen by an agent.

## Workflow

1. Commit the candidate with `timeline_commit`. A check alone is insufficient.
2. Call `render_start {video_id, mode: "preview"}`. Preview is the normal
   editing/QC output.
3. Read the returned `run_id`. Poll that exact run with
   `run_status {run_id}` no sooner than `check_back_after_seconds`.
4. Start verification separately with `verify_start`; it is not triggered by
   commit or render.
5. After preview and verification are terminal, tell the user to watch the
   current preview at the returned `web_url` and ask whether they approve it
   or want changes. **Stop and wait for a later user reply.** Do not render a
   final in the same turn. Successful QC, your own judgment, silence, lack of
   comments, and the original request are not approval.
6. Only after a later user message explicitly approves that exact preview,
   call `render_start` with `mode: "final"`, its `render_id` as
   `approved_preview_run_id`, and its `plan_sha256`. Any intervening timeline
   change invalidates approval; render and present a new preview first.

`render_start` always renders the current committed plan. If local authoring
has not been committed, commit it first; never render an older publication and
present it as the current candidate.

## Rules

- Do not use a local render helper, request an executor, or handle worker
  credentials.
- A terminal `environment`/worker-command failure is infrastructure, not a cut
  diagnostic. Poll the returned run once for its final message. Retry only when
  that message explicitly says the condition is retryable, and never retry the
  same deterministic failure more than once. Report the run id and exact server
  message; do not switch endpoints, plugins, executors, or local-render paths.
- Do not expect commit to auto-render.
- Do not use a render-specific status tool. `run_status` is the single poller
  for render and verification runs.
- Capability rejection is an authoring diagnostic. Preserve the timeline and
  fix the candidate rather than silently dropping visual layers.
