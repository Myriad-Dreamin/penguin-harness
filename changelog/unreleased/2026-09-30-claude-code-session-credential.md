# A Claude Code Session's program carries the Session's own credential

- **Date:** 2026-09-30
- **Type:** feature
- **Scope:** `plugins`, `server`, `docs`
- **PR:** [Myriad-Dreamin/penguin-harness#128](https://github.com/Myriad-Dreamin/penguin-harness/pull/128)
- **Breaking:** yes — inside a Claude Code Session, `penguin` speaks as the Session's agent instead of the sign-in stored on the data root

[中文版](2026-09-30-claude-code-session-credential.zh.md)

The Claude Code plugin now starts `claude` with the environment a server-driven session gives every command it runs: `PENGUIN_API_URL`, the Session's own credential as `PENGUIN_API_TOKEN`, `PENGUIN_PROJECT_ID`, `PENGUIN_AGENT_ID` and `PENGUIN_SESSION_ID`, with the harness's own `penguin` first on `PATH`. A `penguin` command that Claude Code runs is signed as the Session's agent. For a run an employee queues in company mode, that agent is the employee, so its proposal, ticket and channel writes land under the employee's name.

## Details

- The credential reaches what a session credential reaches: the agent's own sessions, the Project's organizations, and the few other routes an agent's commands call. Everything else is refused with `403 session_scope`.
- A queued run's Session is not part of an organization's sessions, so its credential names no organization and reaches every organization in the Project.
- The program still runs outside the sandbox.
- `SessionEnv` joins the `@prismshadow/penguin-server/plugin` types, and the plugin requires it from `SessionRuntimeModule`.

## Compatibility

- A person who ran admin commands with `penguin` from inside a Claude Code Session now gets `403 session_scope` for them there. Run those commands in an ordinary terminal, where the CLI still uses the stored sign-in.
- A Claude Code Session opened before the upgrade keeps the environment it started with. Close it and open it again to get the credential.
