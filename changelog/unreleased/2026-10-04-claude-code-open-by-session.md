# A link opens a Claude Code session by its id, continued as an employee

- **Date:** 2026-10-04
- **Type:** feat
- **Scope:** `plugins`

[中文版](2026-10-04-claude-code-open-by-session.zh.md)

`GET /api/claude-code/open/<claudeSessionId>?org=<orgId>&agent=<agentId>` opens a Claude Code session from a link, for the people of the organization's Project. When a queue run already holds that session, the link goes to its Session (`/chat/<sessionId>`, with `?machine=` for an organization on another machine). Otherwise the claude-code queue gets a resume run: `claude --resume <claudeSessionId>` with no first prompt, in the working directory the session's record names, as a Session of the named employee. The link goes to that Session once it starts, or to the Claude Code console with the run picked out while it waits for a slot. `project=` names the Project when the organization id is in more than one.

One Claude Code session never gets two programs. When a program outside the queue holds the session (an entry under `~/.claude/sessions` with a live pid), the link answers with a page that names its process, terminal and tmux pane instead of starting another. An unknown session id, an unreadable record, or a working directory that is gone answers 404 with the reason.

Resume runs are kept while idle: the idle limit passes them by, and they still take a slot. The console shows a resume run's Claude Code session id, and its **Open** follows the same link, so an ended resume run is continued again.
