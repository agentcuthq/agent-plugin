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

1. Add the marketplace and install (the clone is ~100+ MB — bundled ffmpeg —
   and can take a few minutes; do not kill it early):

   ```bash
   claude plugin marketplace add https://github.com/agentcuthq/agent-plugin.git#main
   claude plugin install agentcut@agentcut
   ```

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

   The plugin details must list **4 skills** (`video-editing`,
   `asset-import`, `transcription`, `agentcut-basics-claude`); the
   inventory's "MCP servers" counter does not count remote servers, so the
   `claude mcp get` line is the server check.

5. **Mandatory handoff.** This session cannot see the newly installed tools.
   Tell the user to start a NEW Claude Code session and paste:

   > Edit this video with AgentCut: <path to a local video>

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

Verify with `codex plugin list` (expect 4 skills: `video-editing`,
`asset-import`, `transcription`, `agentcut-basics`), then hand off to a NEW
thread exactly as above.

## Updating

```bash
# Claude Code
claude plugin marketplace update agentcut
claude plugin update agentcut@agentcut

# Codex
codex plugin marketplace upgrade
```

Restart the session afterwards. Tool schemas update server-side with no
plugin release, so an update is only needed when the SKILLS changed.

## Failure report

If any step fails, report: the exact command, its full output, the host OS,
and whether the machine is behind a proxy. Do not improvise alternative
install channels (npm, manual skill copying) — they no longer exist.
