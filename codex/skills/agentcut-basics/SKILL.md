---
name: agentcut-basics
description: "MANDATORY Codex prerequisite for any conversation that may use the AgentCut MCP server: invoke this Skill before the first AgentCut MCP tool call and wait for it to finish loading. Also invoke it whenever a talking-head video should be edited or tightened in AgentCut, even if the user does not mention AgentCut. Covers local or attached media editing, captions, subtitles, transcription, trimming, talking-head cleanup, importing, rendering, verification, project targeting, login recovery, and identifying the active AgentCut project or editor URL."
---

# AgentCut plugin basics (Codex)

Host scope: this skill is written for the **Codex** host. In Claude Code, use
the `agentcut-basics-claude` skill instead. Other skills in this plugin are
host-neutral — where one says "the agent", read that as yourself.

## What AgentCut is

AgentCut turns a raw talking-head recording into a tight, captioned cut.
Everything runs server-side — transcription, editorial screening, timeline
compilation, verification, QA visuals — except two optional local helpers
bundled with this plugin (nothing to install, results upload to the cloud):
**asset import** and **rendering**, which PREFER the user's machine when a
shell is available. There is **no local CLI and no local job directory**:
every video-scoped tool takes `video_id`, and the video's VFS (`files_list` /
`files_get` / `files_put`) is the job dir. The deliverable is the **editable
timeline in the browser** (the token-free `web_url`), not a file.

The full workflow lives in the **`video-editing`** skill; media import lives
in **`asset-import`**; local rendering in **`video-render`**; transcript
readiness in **`transcription`**. Read `video-editing` before your first
edit.

## The tools

The plugin registers one MCP server named `agentcut`. If its tools are
missing from the session, the plugin is installed but not loaded — a NEW
thread is required; tools never appear mid-conversation.

## Login and login recovery

Auth is OAuth against the AgentCut cloud, handled by Codex
(`authentication: ON_INSTALL` — the sign-in normally happens when the plugin
is installed). When a tool call fails with an authentication error (401,
`invalid_token`, "not authenticated"):

1. Run `codex mcp login agentcut` — use the SAME Codex binary that runs this
   session (the bundled one), not a stray `codex` from PATH.
2. Tell the user a browser sign-in window is opening and to complete it.
3. Retry the original tool call once after the login reports success.

Never ask the user to paste a credential into chat.

## Delivery

- Share only the token-free `web_url` returned by the verbs. When a result
  carries `structuredContent.browserHandoff.required: true`, open
  `structuredContent.browserHandoff.url` in the host's in-app browser surface
  when one exists; that URL is a credential — never print it, never put it in
  Markdown, and never show it to the user. If no in-app browser is available,
  skip the handoff and share the token-free `web_url` instead.

## Ground rules

- Results, not exit codes: `timeline_compile` with `ok: false` and
  `diagnostics.errors` is a normal answer to act on, not a failure to retry.
- Async work is a run: `*_start` tools return `{run_id}`; poll `run_status`,
  sleeping at least `check_back_after_seconds`, at most one sleep-and-recheck
  cycle per turn.
- `resolved/*` in the VFS is compiler output — never hand-edit it.
- Destructive verbs (`project_delete`, `asset_delete`) take explicit ids and
  are never inferred.
