---
name: agentcut-basics-claude
description: "MANDATORY Claude Code prerequisite for any conversation that may use the AgentCut MCP server: invoke this Skill before the first AgentCut MCP tool call and wait for it to finish loading. Also invoke it whenever a talking-head video should be edited or tightened in AgentCut, even if the user does not mention AgentCut. Covers local or attached media editing, captions, subtitles, transcription, trimming, talking-head cleanup, importing, rendering, verification, project targeting, login recovery, and identifying the active AgentCut project or editor URL."
---

# AgentCut plugin basics (Claude Code)

Host scope: this skill is written for **Claude Code**. In Codex, use the
`agentcut-basics` skill instead.

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

The plugin's MCP server is `plugin:agentcut:agentcut`; its tools appear as
`mcp__plugin_agentcut_agentcut__<name>` (e.g.
`mcp__plugin_agentcut_agentcut__timeline_compile`). If those tools are
missing from the session, the plugin is installed but not loaded — a NEW
session is required; tools never appear mid-conversation.

## Login and login recovery

Auth is OAuth against the AgentCut cloud, handled by Claude Code. When a tool
call fails with an authentication error (401, `invalid_token`, "not
authenticated"):

1. Run the bundled login script (it PTY-wraps the CLI because
   `claude mcp login` needs a TTY):

   ```bash
   sh "<this-skill-dir>/login-agentcut.sh"
   ```

   Resolve `<this-skill-dir>` relative to this SKILL.md (or use
   `${CLAUDE_PLUGIN_ROOT}/skills/agentcut-basics-claude/login-agentcut.sh`
   when `CLAUDE_PLUGIN_ROOT` is set).
2. Tell the user a browser sign-in window is opening and to complete it.
3. The authoritative success signal is the `Authenticated with
   "plugin:agentcut:agentcut"` line in `/tmp/agentcut-login.log` — not
   "Connected" by itself. Poll the log briefly; do not loop more than ~90s.
4. Retry the original tool call once after success.

Never ask the user to paste a credential into chat, and never re-authenticate
merely because a skill failed to load.

## Delivery and browser handoff

- Share only the token-free `web_url` returned by the verbs. When a result
  carries `structuredContent.browserHandoff.required: true`, open
  `structuredContent.browserHandoff.url` in the host's **in-app Browser**;
  that URL is a credential — never print it or put it in Markdown.
- Reuse an existing AgentCut Browser tab (`navigate {url, tabId}`) instead of
  opening another one. The first navigation to the AgentCut origin may return
  `denied` while the host shows its per-origin approval card — that is pending
  user approval; stop and wait, never retry-loop.
- A cold project sync can stay loading for more than 20 seconds. If still
  stalled after 20 seconds, re-navigate to the same handoff URL **once** in
  the same tab, then stop rather than looping.

## Ground rules

- Results, not exit codes: `timeline_compile` with `ok: false` and
  `diagnostics.errors` is a normal answer to act on, not a failure to retry.
- Async work is a run: `*_start` tools return `{run_id}`; poll `run_status`,
  sleeping at least `check_back_after_seconds`, at most one sleep-and-recheck
  cycle per turn.
- `resolved/*` in the VFS is compiler output — never hand-edit it.
- Destructive verbs (`project_delete`, `asset_delete`) take explicit ids and
  are never inferred.
