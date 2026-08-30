# AgentCut plugin — agent install runbook

This document is written for the AGENT performing the install. Execute it top
to bottom. The live copies are served at
`https://agentcut.io/claude` (Claude Code) and
`https://agentcut.io/codex` (Codex) — prefer those, they never
go stale.

## Host environment gate

Run the install ONLY on a desktop machine where `~/.claude` (Claude Code) or
the Codex home is writable. In a web/remote/sandboxed session, STOP and tell
the user to run the install from their local machine instead. Do not attempt
workarounds.

## Claude Code

1. Add the marketplace, enable auto-updates, and install (the host checkout is
   ~330 MB — bundled FFmpeg, HyperFrames, and Chrome — and can take a few
   minutes; do not kill it early):

   ```bash
   claude plugin marketplace add https://github.com/agentcuthq/agent-plugin.git#main
   ```

   Before continuing, use your built-in file read/edit tools—not Python, Node,
   `jq`, or another external runtime—to open
   `$CLAUDE_CONFIG_DIR/settings.json` (or `~/.claude/settings.json`). Resolve a
   symlink to its target, merge `"autoUpdate": true` into the existing
   `extraKnownMarketplaces.agentcut` object, preserve all unrelated values and
   the existing permissions, then re-read the file and verify the value is
   exactly `true`.

   ```bash
   claude plugin install agentcut@agentcut
   ```

   Tell the user AgentCut will update automatically after future Claude Code
   sessions start.

2. If a legacy standalone MCP entry exists, remove it — but never remove the
   plugin-managed one:

   ```bash
   claude mcp get agentcut && claude mcp remove agentcut
   # Do NOT remove plugin:agentcut:agentcut — that is the plugin's server.
   ```

3. Sign in. `claude mcp login` needs a TTY, so run the bundled PTY wrapper in
   the background and hand the user the browser step:

   ```bash
   sh "$(claude plugin details agentcut@agentcut 2>/dev/null | grep -o '/.*agentcut/[0-9.]*' | head -1)/skills/agentcut-basics-claude/login-agentcut.sh" \
     || python3 -c 'import pty,sys; pty.spawn(sys.argv[1:])' claude mcp login plugin:agentcut:agentcut > /tmp/agentcut-login.log 2>&1 &
   ```

   Tell the user: "A browser sign-in for AgentCut is opening — complete it
   there." The authoritative success signal is the line
   `Authenticated with "plugin:agentcut:agentcut"` in
   `/tmp/agentcut-login.log` — `Connected` alone is not success.

4. Verify:

   ```bash
   claude plugin details agentcut@agentcut
   claude mcp get plugin:agentcut:agentcut
   ```

   The plugin details must list **6 skills** (`video-editing`, `asset-import`,
   `transcription`, `video-render`, `video-review`,
   `agentcut-basics-claude`); the inventory's "MCP servers" counter does not
   count remote servers, so the `claude mcp get` line is the server check.
   Step 1 already verified the auto-update setting by re-reading it.

5. **Mandatory handoff.** This session cannot see the newly installed tools.
   Tell the user to start a NEW Claude Code session and paste:

   > Edit this video with AgentCut: <path to a local video>. Open its rendered preview and comments in the built-in browser while you work.

   Only after printing that handoff may you report the install as complete.

## Codex

Use the BUNDLED Codex binary that runs the current session — not a standalone
`codex` from npm, Homebrew, or PATH.

```bash
codex plugin marketplace add https://github.com/agentcuthq/agent-plugin.git --ref main
codex plugin marketplace list
codex plugin add agentcut@agentcut
codex mcp login agentcut
```

Verify with `codex plugin list` (expect 6 skills: `video-editing`,
`asset-import`, `transcription`, `video-render`, `video-review`,
`agentcut-basics`), then hand off to a NEW thread with the same prompt,
including the instruction to keep AgentCut's rendered preview and comments
visible in the built-in browser while working.

## Updating

Claude Code checks AgentCut in the background after startup and automatically
updates the marketplace plus installed plugin on disk. The check can be delayed
by up to ten minutes; the running session keeps the version it loaded. If an
update notification appears, run `/reload-plugins` or use the next session.

Codex also refreshes configured Git marketplace snapshots and installed plugin
caches automatically in the background. It does not expose a publisher
`autoUpdate` flag. The running thread keeps its loaded skills, so use a new
thread after an update.

If AgentCut was installed before these instructions enabled auto-updates,
repeat the consented settings edit and verification from Claude install step 1.

To force an immediate update:

```bash
# Claude Code
claude plugin marketplace update agentcut
claude plugin update agentcut@agentcut

# Codex
codex plugin marketplace upgrade agentcut
```

Reload or restart the session afterwards. Tool schemas update server-side with
no plugin release, so a plugin update is only needed when the SKILLS changed.

## Failure report

If any step fails, report: the exact command, its full output, the host OS,
and whether the machine is behind a proxy. Do not improvise alternative
install channels (npm, manual skill copying) — they no longer exist.
