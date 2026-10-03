# DeepSeek Harness sandbox adaptor

Puts the **DSH** sandbox ecosystem behind this harness's own sandbox interface. This is the
portable floor: it works on Linux, macOS and Windows, and implements the `fs-write`
dimension.

## What it covers

`@deepseek-ai/dsh-sandbox-local` carries the platform chain and probes each rung
functionally:

| Host | Mechanism |
| --- | --- |
| Linux | dsh-bwrap → Landlock |
| macOS | Seatbelt |
| Windows | ACL restricted-token runner |

DSH's policy vocabulary governs **file-write effects only**, so this adaptor declares
exactly `fs-write`. The sandbox service therefore never routes a `network` or
`mask-paths` policy here, and the adaptor never has to silently drop a dimension it
cannot honor — for those, use the bubblewrap, Seatbelt or WSL backend for your platform.
Mounted beside one of those, it is used only where that backend is refused: the service
routes every policy to the backend implementing the most dimensions.

The chain picks its rung when the adaptor loads, so a host where no rung works fails the load
with DSH's reason rather than mounting a backend that refuses every command, and the settings
card names the rung that serves (`Landlock`, with `(partial)` on an older Landlock ABI).

On Linux this is the floor the Sandbox card installs beside bubblewrap. Ubuntu 23.10 and later
restrict unprivileged user namespaces to AppArmor-profiled programs, which refuses bubblewrap
on an install that could not add a profile; Landlock needs neither a namespace nor root, so file
writes stay confined there with no host step.

## Windows: run command sessions under PowerShell

The ACL restricted-token runner does not start bash, and bash is the harness's default
session shell on Windows (Git for Windows, or the MinGit the Windows package bundles). A bare
`bash` reaches System32's WSL launcher; an MSYS `bash.exe` or `sh.exe` aborts under the
restricted token. So with this backend confining commands on Windows, set the session shell
in the harness's environment and restart it:

| Shell | Under the ACL runner | Setting |
| --- | --- | --- |
| PowerShell 7 (`pwsh`) | runs confined | `PENGUIN_SHELL=pwsh` |
| Windows PowerShell 5.1 | runs confined | `PENGUIN_SHELL=powershell` — for hosts without PowerShell 7; it ships with Windows |
| bash / sh (Git for Windows, MinGit) | does not start | — |

Measured on GitHub's `windows-latest` (Windows Server 2025, pwsh 7.6.6, Windows PowerShell
5.1.26100): a write inside the Workspace lands and a write outside it is denied. `cmd` also
starts under the runner; it is not measured beyond that.

Until the shell is set, the backend's load fails with a reason naming these settings, so it is
not mounted: the Session view lists `dsh-local` among the unavailable backends with that
reason, and the composer marks the confining tier unavailable instead of offering a tier whose
every command would be refused. A harness whose core does not report its session shell (an
older runtime) loads the backend as before.

Each confined command is still checked on its own. A bash or sh program is refused before it
reaches the runner: when it is the session shell, the error names the same settings; when it is
something else — a stdio MCP Server launched through bash, which `PENGUIN_SHELL` does not
choose — the error says only that the runner cannot start bash or sh. Nothing here changes on
Linux or macOS, where bash runs confined as usual.

A shell named without a directory (`pwsh`, `powershell`) is handed to the runner as the file the
harness's `PATH` names. Left to itself, the runner looks in its current directory — the session's
working directory, inside the Workspace — and in System32 before `PATH`, so an `.exe` of the same
name written into the Workspace would start instead. A name no `PATH` directory holds is refused.
A bare name is looked up as `.exe` only, as Windows does: when `PATH` carries a `.cmd` or `.bat`
of that name instead — `npx` and `uvx` are batch files, a common stdio MCP Server command — the
refusal names that file; to hand the batch file over, name it with its extension (`npx.cmd`).

## Requirements

None beyond Node 24. The package carries the DSH chain it runs as `dist/node_modules`
(`@deepseek-ai/cordis`, `@deepseek-ai/dsh-sandbox-local` and what they depend on, at exactly the
versions the repository's `pnpm-lock.yaml` resolves), so it loads
wherever it is unpacked, with nothing installed beside it, and the harness itself does not
depend on DSH.

That includes the native parts, for every supported host: koffi's prebuilt module for Linux
x64/arm64, macOS x64/arm64 and Windows x64 (every platform loads it, since the chain imports
its Windows runner statically), and the Landlock launcher for Linux x64/arm64. The tarball is
about 3.5 MB.

The chain loads behind dynamic imports, so a package whose carried tree is damaged fails
*this* load — reported fail-closed by the service — instead of failing the whole platform
bundle's import.

## Install

It ships with the harness build. On the Plugins page, install it to the Project that should
run it: the App re-assembles itself, no restart. Written by hand, it is a row of the Project's
`.project_config.toml`:

```toml
[plugins]
"@penguinharness/sandbox-dsh" = "*"
```

Installing is an operator-side action: the harness resolves the package from the installation,
never from this listing.

## License

Apache-2.0.
