# AgentCut agent plugin

One repo, two marketplaces: install AgentCut into **Claude Code** or
**Codex** and edit talking-head videos in the AgentCut cloud — import a
local clip (ffmpeg is bundled, nothing to install), then transcription,
authoritative timeline check/commit, rendering, verification and QA visuals
all run server-side. The browser shows rendered previews and review comments;
timeline authoring happens through the agent tools.

## Install — Claude Code

Paste this into any Claude Code chat:

> Read https://agentcut.io/claude to install and use the AgentCut plugin

Or by hand:

```bash
claude plugin marketplace add https://github.com/agentcuthq/agent-plugin.git#main
```

In `$CLAUDE_CONFIG_DIR/settings.json` (or `~/.claude/settings.json`), merge
`"autoUpdate": true` into the existing
`extraKnownMarketplaces.agentcut` object created by that command. Preserve all
other values; if the configured path is a symlink, edit its target without
replacing the link. Then install:

```bash
claude plugin install agentcut@agentcut
```

That field opts only the AgentCut marketplace into Claude Code's background
auto-updater. Claude checks after future sessions start and updates both the
marketplace and installed plugin on disk. If it reports an update, run
`/reload-plugins` or use the new version in the next session.

Then sign in (OAuth, needs a TTY — the bundled script wraps it):

```bash
sh "$HOME/.claude/plugins/cache/agentcut/agentcut/<version>/skills/agentcut-basics-claude/login-agentcut.sh"
```

Start a **new** session afterwards — the installing session cannot see the new
tools.

In that new session, ask:

> Edit this video with AgentCut: <path to a local video>. Open its rendered preview and comments in the built-in browser while you work.

## Install — Codex

Paste this into any Codex chat:

> Read https://agentcut.io/codex to install and use the AgentCut plugin

Or by hand (use the bundled Codex binary, not a stray `codex` from PATH):

```bash
codex plugin marketplace add https://github.com/agentcuthq/agent-plugin.git --ref main
codex plugin add agentcut@agentcut
codex mcp login agentcut
```

Then start a new task and ask:

> Edit this video with AgentCut: <path to a local video>. Open its rendered preview and comments in the built-in browser while you work.

## Update

Claude Code installations completed with the instructions above update
automatically after startup. Codex manages background refreshes for configured
Git marketplaces such as AgentCut without a publisher or user setting.

If you installed AgentCut before auto-updates were included in setup, perform
the one-time `autoUpdate` settings merge described in the Claude install block
above, then re-read the file to verify the value is `true`.

To force an immediate update:

```bash
# Claude Code
claude plugin marketplace update agentcut
claude plugin update agentcut@agentcut

# Codex
codex plugin marketplace upgrade agentcut
```

Use a new Codex thread or reload/restart Claude after updating: a running
session keeps the skill version it loaded. Tool schemas live server-side and
update with no plugin release; only skill/prompt changes need a version bump
here.

## Layout

```
.claude-plugin/marketplace.json     Claude Code marketplace
.agents/plugins/marketplace.json    Codex marketplace
claude/                             Claude Code plugin (remote MCP + skills)
codex/                              Codex plugin (remote MCP + skills)
docs/install.md                     the full agent-executable install runbook
```

Each host checkout is large (~330 MB): `asset-import` bundles gzipped
ffmpeg/ffprobe, while `video-render` bundles HyperFrames and Chrome, so imports
and local media import works with zero user install. Expect the marketplace add to
take a few minutes on slow networks.

This repo is a build artifact, synced from a private monorepo — issues and
PRs here are read, but the source of truth lives elsewhere.
