# Claude Code

Claude Code as a **session surface**: one more entry under "New chat" that opens the Claude Code TUI in the Session's Workspace, inside the chat page.

## What you get

- **A "Claude Code" entry under "New chat."** Pick an Agent and a Workspace on the draft page, optionally type a first prompt, and open. The Session lands in the sidebar like any conversation.
- **The TUI, in the conversation's place.** The chat page shows a terminal running `claude` in that Workspace instead of the message stream and composer. Close the tab, come back, reload — the program keeps running on the server and the page reattaches to it.
- **The same status glyphs.** The row spins while Claude Code is working and shows the unread dot when it has stopped since you last looked.

A Claude Code Session has no model of its own and takes no Tasks; it is Claude Code's conversation, with PenguinHarness around it.

## Requirements

- Claude Code installed on the server, as `claude` on the server's `PATH` — or name the executable with `PENGUIN_CLAUDE_BIN` in the server's environment.
- Sign-in to Claude Code is Claude Code's own: run `claude` once on the server, or let the first Session's terminal walk you through it.

## Install

The plugin ships with every PenguinHarness build but is not installed by default. On a Project's Plugins page, add it to that Project's plugins (it is tagged *built in* there — nothing is downloaded); it is loaded without a restart. Or list it by hand in that Project's `.project_config.toml`:

```toml
[plugins]
"@prismshadow/penguin-plugin-claude-code" = "*"
```

## The queue and the console (company mode)

In company mode an organization's employees can ask for Claude Code instead of opening it themselves, and a person watches and steps into what they asked for.

- **Queueing.** An employee queues a run: a prompt, and optionally a Workspace (inside the organization's workspace, or its own Session's, which is the default) and a title. From inside a Session it is one command, which the CLI sends with the Session's identity:

  ```sh
  penguin org claude-code run "Fix the flaky test in packages/web" --title "Flaky test"
  penguin org claude-code ls
  penguin org claude-code show 3 --screen 40   # the last 40 lines of its screen
  penguin org claude-code release 3
  ```

  The same routes answer over HTTP under `/api/projects/<p>/organizations/<o>/claude-code/runs` (`GET`/`POST`, `GET …/runs/<id>[?screen=N]`, `POST …/runs/<id>/release`). A person may queue for an employee by naming it (`agent`).
- **Automatic queueing.** Runs start by themselves, oldest first, whenever one of the server's slots is free. A run is a Claude Code Session of the employee's Agent, opened on this surface with the prompt as its first argument. It holds its slot until its program exits, until it is released (by the employee, by whoever queued it, or by a person), or until it has sat idle for the configured number of minutes. Then the program is closed and the slot passes to the next run in line. Nobody has to hand slots out by hand.
- **The console.** A **Claude Code** row in the organization's sidebar opens the console. It shows the slots in use on the server and every run of the organization: waiting (with its place in line), working, waiting for input, or ended and why. **Open** goes to a run's Session, where the terminal is the very program the employee started, and you can type into it. **Release** / **Cancel** lets go of a run.
- **Settings.** The *Claude Code queue* group on the Settings dialog's Plugins page has two fields. **Slots** is how many runs may be open at once on this server, across every organization (default 4). **Close when idle** is the number of minutes of waiting for input after which a run is closed (default 30; 0 never closes one).

Runs are kept in `claude-code-runs.json` in the organization's directory (the last 100 ended ones with them). A restart reads the file back; a run whose program did not survive the restart ends as `lost`.

The terminal belongs to the person whose request queued the run. For an employee, that is the user behind the Session's API token, normally the administrator. Another signed-in person sees the run on the console but cannot attach to its terminal.

## How the state is read

A terminal cannot say whether the program in it is thinking. This plugin reads output as activity: output within the last moment means *running*, silence past it means *idle*, exit means *idle*. Claude Code redraws continuously while it works and not at all while it waits, which is why the rule holds.

## Development

```sh
pnpm --filter @prismshadow/penguin-plugin-claude-code build   # dist/, the entry a [plugins] table resolves to
pnpm --filter @prismshadow/penguin-plugin-claude-code test    # the manifest pairing, and the integration test
```

The integration test starts a real server with this plugin through `@prismshadow/penguin-plugin-test`, with a fake `claude` (`test/fake-claude.mjs`) standing in through `PENGUIN_CLAUDE_BIN`. It needs the server and this package built first.
