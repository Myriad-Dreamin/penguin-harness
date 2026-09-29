# Employees queue Claude Code runs, and a console in company mode lets a person step into them

- **Date:** 2026-09-29
- **Type:** feat
- **Scope:** `plugins`, `web`, `cli`

[中文版](2026-09-29-claude-code-queue-and-console.zh.md)

The claude-code plugin now has a queue. An employee of an organization asks for a Claude Code run with `penguin org claude-code run "<prompt>"`, or with `POST /api/projects/<p>/organizations/<o>/claude-code/runs`. The run starts by itself when one of the server's slots is free. It is a Claude Code Session of that employee's Agent, running in the employee's Workspace, with the prompt as its first argument. `ls`, `show <id> [--screen N]` and `release <id>` follow it from there.

A run keeps its slot until its program exits, until someone releases it, or until it has sat idle for the configured time. Then the program is closed and the next run in line starts. The *Claude Code queue* settings group sets the number of slots, shared by every organization on the server (default 4), and the idle limit in minutes (default 30; 0 turns it off).

Company mode has a new **Claude Code** page, which appears while the plugin is installed. It shows the slots in use and every run of the organization: waiting and its place in line, working, waiting for input, or ended and why. **Open** goes to a run's Session, where the person is inside the very Claude Code the employee started. **Release** lets go of a run.
