---
name: video-editing
description: >-
  Author and publish AgentCut timelines through the authoritative MCP timeline
  check/commit contract, then render, verify, inspect QA, and handle reviews.
---

# AgentCut cloud editing

AgentCut has one authored document and one publication boundary. Read the
current `timeline.json` plus its `base_revision` and
`compile_context_sha256`, author a complete candidate, check it, and commit it.

There is no edit acquisition, lease, edit start/finish, explicit compile or
publish, batch-resolve tool, browser editor, local-render session, executor
choice, or render-specific status tool.

## Workflow

When an import creates a video, open its in-app review page immediately as the
preview-and-comments handoff: call `get_video_url` before polling transcription,
reuse the existing project tab, and retarget it only when the
active video changes, not on every conversational turn. The page is never an
authoring surface.

1. Read the transcript and screening artifacts with `files_list`/`files_get`.
2. Author a stable-ID TimelineDocument. Use `timeline_resolve` for one phrase
   or its `queries` field for a batch. `timeline_pack`, `timeline_desilence`,
   `timeline_shift`, and `timeline_canvas` are pure: pass the candidate and use
   the returned transformed document; they do not persist. If a transform
   rejects the document, repair the reported fields and call that transform
   again. Never reproduce packing, shifting, desilencing, or canvas refits with
   shell/Python code, and never delete valid metadata to make a transform pass.
3. Call `timeline_check` with exactly one of `timeline` or `operations`, plus
   the base revision and compiler-context hash. It performs the full compiler
   preflight without writes. Warnings do not block; structured invalid/conflict
   verdicts are normal tool results.
4. Call `timeline_commit` with the same candidate contract. It recompiles and
   atomically advances the canonical timeline, diagnostics, compiled plan, run
   artifacts, and VFS mirrors. It never starts a render.
5. Call `render_start` in preview mode, then poll its run id with
   `run_status`. Call `verify_start` (quick by default) and poll that run id with
   the same tool. Use `qa_inspect`, `qa_frames`, `qa_waveform`, and
   `qa_framing` for visual QA. `qa_waveform` reads a SOURCE-time window directly
   and needs only `video_id`, `start`, and `end`, so it works before the first
   timeline exists. Direct SOURCE-time `qa_frames` works the same way. For
   plan-backed QA (`qa_inspect`, `qa_framing`, or join/output-addressed frames),
   either omit every candidate field to inspect the committed timeline or pass
   the complete `{base_revision, compile_context_sha256, timeline|operations}`
   envelope to inspect an uncommitted candidate. Never pass only the two fence
   fields without a candidate form.
6. Iterate by authoring a fresh candidate and committing again. After the
   preview and verification are terminal, tell the user to watch the current
   preview at the returned `web_url` and ask whether they approve it or want
   changes. **Stop and wait for a later user reply.** Do not render a final in
   the same turn. The original edit request, successful QC, your own visual
   judgment, silence, or no review comments are not approval.
7. Only after the user explicitly approves that exact preview in a later
   message may you call `render_start` with `mode: "final"`, the approved
   preview's `render_id` as `approved_preview_run_id`, and its
   `plan_sha256`. If the timeline changes afterward, render a new preview and
   obtain approval again.

Generic VFS writes, pushes, and deletes cannot touch `timeline.json`,
`resolved/plan.json`, or `resolved/diagnostics.json`; reads include the
authoritative revision/context metadata. The browser is preview-and-comments
only.

For review feedback, use `review_inbox`, `review_pull`, edit through the same
check/commit flow, render and verify, then `review_resolve` with one outcome per
comment.
