# The Claude Code console's Open reaches the run, and a working run no longer reads as waiting

- **Date:** 2026-09-30
- **Type:** fix
- **Scope:** `plugins`, `web`
- **PR:** [Myriad-Dreamin/penguin-harness#107](https://github.com/Myriad-Dreamin/penguin-harness/pull/107)

[中文版](2026-09-30-claude-code-open-and-idle.zh.md)

**Open** on the Claude Code console now lands on the run's terminal when the organization runs on another machine. The link names that machine (`/chat/<session>?machine=<id>`), and the chat route records it before the page looks the Session up. Before this, the lookup went to the server the browser was on, found nothing, and fell back to the newest personal conversation, which also left company mode. The same `?machine=` works for any link to a Session the app has not listed; what the app learned from its own lists still wins.

A run is now read as working while Claude Code's footer says `esc to interrupt`, as well as while the spinner line is among the last rows. A two-row tip under the spinner used to push it out of those rows, so a run that was plainly working showed **Waiting for input**, and its idle clock started. After the idle limit (30 minutes by default) such a run was closed mid-work.
