# A link opens a Claude Code session by its id, continued as an employee

- **Date:** 2026-10-04
- **Type:** feat
- **Scope:** `plugins`, `web`

[中文版](2026-10-04-claude-code-open-by-session.zh.md)

`GET /api/claude-code/open/<claudeSessionId>?org=<orgId>&agent=<agentId>` opens a Claude Code session from a link, for the people of the organization's Project. When a queue run already holds that session, the link goes to its Session (`/chat/<sessionId>`, with `?machine=` for an organization on another machine). Otherwise the claude-code queue gets a resume run: `claude --resume <claudeSessionId>` with no first prompt, in the working directory the session's record names, as a Session of the named employee. The link goes to that Session once it starts, or to the Claude Code console with the run picked out while it waits for a slot. `project=` names the Project when the organization id is in more than one.

One Claude Code session never gets two programs. When a program outside the queue holds the session (an entry under `~/.claude/sessions` with a live pid), the link answers with a page that names its process, terminal and tmux pane instead of starting another. An unknown session id, an unreadable record, or a working directory that is gone answers 404 with the reason.

Resume runs are kept while idle: the idle limit passes them by, and they still take a slot. The console shows a resume run's Claude Code session id, and its **Open** follows the same link, so an ended resume run is continued again.

A roadmap's session opens from the roadmap too. `GET /api/claude-code/open?org=<orgId>&roadmap=<n>` looks roadmap `<n>` up in the organization's `claude-sessions.json` (`{ "roadmaps": { "<n>": { "sessionId": "…", "agentId": "…" } } }`, in the organization's directory) and then opens that session as the employee the entry names, the same way the link by id does. A roadmap the file does not name answers 404 with the reason, and a file that is not that shape counts as none. The plugin only reads the file; whoever creates the sessions writes it. In the web app, a roadmap's column beside its room shows **Open session** next to the title when the file names that roadmap, from the new `GET /api/projects/<p>/organizations/<o>/claude-code/sessions`. Without the claude-code plugin the column shows no button.

Inside the web app the session opens in a dialog, and the page stays where it was. **Open session** and a link to either route in a channel message open a dialog on the Settings dialog's shell. The dialog holds the session's terminal, the same view the chat page draws for a Claude Code Session. While the run waits for a slot, the dialog shows its place in line and attaches once the run starts. A session held outside the queue is explained by process, terminal and tmux pane. Closing the dialog leaves the run running. The dialog reads the link's new JSON form: with `Accept: application/json` the route answers `{ "state": "running" | "queued" | "elsewhere", … }` instead of redirecting. A link opened outside the app, or with a modifier key, still lands on the page as before.
