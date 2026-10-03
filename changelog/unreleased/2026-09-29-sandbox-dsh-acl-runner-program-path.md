# sandbox-dsh on Windows starts the shell PATH names, not a same-named exe in the Workspace

- **Date:** 2026-09-29
- **Type:** fix
- **Scope:** `plugins`, `core`, `server`
- **PR:** [Myriad-Dreamin/penguin-harness#106](https://github.com/Myriad-Dreamin/penguin-harness/pull/106)

[中文版](2026-09-29-sandbox-dsh-acl-runner-program-path.zh.md)

On Windows, the DSH backend's ACL runner starts a confined command's program from a bare name.
Windows then searches the runner's own directory, its current directory (the session's working
directory, inside the Workspace) and System32 before `PATH`.

- The backend now hands the runner the file `PATH` names for a program given without a
  directory, such as `pwsh` or `powershell`. An `.exe` of the same name in the Workspace is no
  longer started in its place, and a name System32 also carries no longer shadows `PATH`.
- That `PATH` is the one the program is spawned with: a stdio MCP Server's own `env`, or a
  command's Agent vault. For this, core's sandbox contract hands the spawn's environment to
  the backend: `SpawnConfiner` options gain `env`, and `SandboxProvider.confine` takes an
  optional third argument, `SandboxSpawn`. A runtime that does not pass it leaves the harness's
  own `PATH`.
- An App Execution Alias on `PATH` (a Microsoft Store install of PowerShell 7) is found as the
  program, though `stat` cannot follow it.
- A name that no absolute `PATH` entry holds is refused before the runner is involved, with an
  error naming it. A program given with a directory is passed on unchanged.
- When `PATH` has no `.exe` for a bare name but carries a `.cmd` or `.bat` of it (`npx` and
  `uvx` are batch files on Windows), the refusal names that file and says a bare name is only
  looked up as `.exe`; to hand over the batch file, name it with its extension. The lookup
  itself is unchanged. The README notes that a batch file runs through `cmd.exe`, whose parsing
  the runner's quoting does not guard, still under the restricted token.
- The runner's own spawn errors now name the absolute path it was given.
- Linux and macOS are unchanged.
