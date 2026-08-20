# AgentCut agent plugin

One repo, two marketplaces: install AgentCut into **Claude Code** or
**Codex** and edit talking-head videos in the AgentCut cloud — import a
local clip (ffmpeg is bundled, nothing to install), then transcription,
editorial screening, timeline compilation, rendering, verification and QA
visuals all run server-side. The deliverable is an editable timeline in the
browser.

## Install — Claude Code

Paste this into any Claude Code chat:

> Read https://agentcut.io/claude to install and use the AgentCut plugin

Or by hand:

```bash
claude plugin marketplace add https://github.com/agentcuthq/agent-plugin.git#main
claude plugin install agentcut@agentcut
```

Then sign in (OAuth, needs a TTY — the bundled script wraps it):

```bash
sh "$HOME/.claude/plugins/cache/agentcut/agentcut/<version>/skills/agentcut-basics-claude/login-agentcut.sh"
```

Start a **new** session afterwards — the installing session cannot see the new
tools.

## Install — Codex

Paste this into any Codex chat:

> Read https://agentcut.io/codex to install and use the AgentCut plugin

Or by hand (use the bundled Codex binary, not a stray `codex` from PATH):

```bash
codex plugin marketplace add https://github.com/agentcuthq/agent-plugin.git --ref main
codex plugin add agentcut@agentcut
codex mcp login agentcut
```

## Update

```bash
# Claude Code
claude plugin marketplace update agentcut
claude plugin update agentcut@agentcut

# Codex
codex plugin marketplace upgrade
```

Restart the session after updating. Tool schemas live server-side and update
with no plugin release; only skill/prompt changes need a version bump here.

## Layout

```
.claude-plugin/marketplace.json     Claude Code marketplace
.agents/plugins/marketplace.json    Codex marketplace
claude/                             Claude Code plugin (remote MCP + skills)
codex/                              Codex plugin (remote MCP + skills)
docs/install.md                     the full agent-executable install runbook
```

The clone is large (~100+ MB): the `asset-import` skill bundles gzipped
ffmpeg/ffprobe for macOS Apple Silicon and Windows x64 so imports work with
zero user install. Expect the marketplace add to take a few minutes on slow
networks.

This repo is a build artifact, synced from a private monorepo — issues and
PRs here are read, but the source of truth lives elsewhere.
