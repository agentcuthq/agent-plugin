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
compilation, rendering, verification, and QA visuals — except the optional
asset-import helper bundled with this plugin. There is **no local CLI and no local job directory**:
every video-scoped tool takes `video_id`, and the video's VFS (`files_list` /
`files_get` / `files_put`) is the job dir. The browser is a rendered preview
and review surface, not a timeline editor.

The full workflow lives in the **`video-editing`** skill; media import lives
in **`asset-import`**; rendering in **`video-render`**; transcript
readiness in **`transcription`**. Read `video-editing` before your first
edit.

## The tools

The plugin's MCP server is `plugin:agentcut:agentcut`; its tools appear as
`mcp__plugin_agentcut_agentcut__<name>` (e.g.
`mcp__plugin_agentcut_agentcut__timeline_check`). If those tools are
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

## Editor handoff — mandatory and early

Opening AgentCut is part of starting the workflow, not a final delivery step.
Before transcription, generation, helper import, rendering, or any other long
work, establish the project and satisfy the first review handoff immediately:

- New local source: call `import_session` first and open its project handoff
  before running the helper.
- New empty project: call `project_create`, then open its handoff.
- Existing project: call `project_get`, then open its handoff.
- Existing or newly known video: call `get_video_url {video_id}` and navigate
  the existing AgentCut tab to that exact video.

For every result with
`structuredContent.browserHandoff.required: true`, preserve the complete
`structuredContent.browserHandoff.url`, including its query string, and use it
only to open or navigate the **in-app Browser**. Make the Browser pane visible
and reuse one existing AgentCut tab (`navigate {url, tabId}`) instead of
opening another. A successful open, navigation, or focus is the completion
signal: continue the edit immediately without waiting for the page to finish
rendering and without polling or inspecting the page.

The handoff URL contains a boot credential. Never print it, summarize it, put
it in Markdown, or expose it to the user. Only the clean, token-free `web_url`
is safe to share.

Browser controls can be deferred even when the Browser is installed. If they
are not visible, load/discover the installed Browser capability and initialize
the in-app Browser instead of giving up from the initial tool list. If the
first AgentCut-origin navigation returns `denied` while Claude Code shows its
per-origin approval card, treat that as pending user action and stop; never
retry-loop.

After the asset-import helper returns a `video_id`, call `get_video_url`
**before** polling transcription or doing further video work. Navigate the
project tab to the video with its `tabId`. For a multi-video project, keep that
one tab aligned to the video currently being edited and retarget it only when
the active target changes — do not refocus it on every conversational turn.

Only after Browser setup or navigation actually fails may you fall back to a
named Markdown link using the clean `web_url`; state which setup or navigation
step failed. Never put the credentialed handoff URL in the fallback.

## Ground rules

- Verdicts are domain results: `timeline_check` or `timeline_commit` with
  `ok: false` is a normal answer to act on, not an MCP transport failure.
- `timeline_check` never writes. Only `timeline_commit` advances the timeline
  and compiled plan, and it always reruns the authoritative compiler.
- Async work is a run: `*_start` tools return `{run_id}`; poll `run_status`,
  sleeping at least `check_back_after_seconds`, at most one sleep-and-recheck
  cycle per turn.
- `resolved/*` in the VFS is compiler output — never hand-edit it.
- Destructive verbs (`project_delete`, `asset_delete`) take explicit ids and
  are never inferred.
