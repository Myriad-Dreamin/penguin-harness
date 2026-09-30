# A sandbox check for every way of installing

- **Date:** 2026-09-29
- **Type:** process
- **Scope:** `ci`, `release`

[中文版](2026-09-29-sandbox-channel-matrix.zh.md)

Whether the sandbox actually starts is now measured per installation channel, on a fresh
install, rather than inferred from the unit suites.

- **`scripts/sandbox-matrix.mjs` checks one install.** It reads the `confinementSupported` and
  `noNetworkSupported` flags of a new Session at the strictest sandbox level, and runs one
  command that writes outside the workspace and one that writes inside it, through the real
  agent loop. No model credential is needed: the script serves a scripted model endpoint
  itself. It can start the installed program on a fresh home directory, or drive a server that
  is already running. Either way it writes only inside a Project it creates for the run and
  deletes afterwards, picks the sandbox level on its own Session rather than in the server's
  settings, and enables a backend only when told the target may be re-assembled
  (`--enable-backend`, implied when it starts the server). It writes one JSON result with a
  verdict and its reason; a cell whose preconditions do not hold (the server cannot reach the
  model endpoint, takes no sandbox level per Session, or runs no backend it may not enable) is
  reported as not run, with its own exit status.
- **A Sandbox matrix workflow covers the Linux column.** On x64 and arm64 runners it installs
  the CLI payload assembled the way the release assembles it, the same payload through the
  installer read from stdin (or, given a release tag, that Release's one-line installer), and
  the npm packages installed globally, and checks each one. It runs when dispatched and when
  the matrix itself changes.
- **The Docker image smoke checks the sandbox too.** The smoke build that already starts the
  container, signs in and waits for the healthcheck now also runs the matrix's Docker cell.
- A cell whose failure is already on record is reported as a known gap rather than a failure;
  today that is the npm global install and the Docker image, which carry no sandbox backend yet.
