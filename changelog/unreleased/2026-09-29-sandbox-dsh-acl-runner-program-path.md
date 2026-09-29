# sandbox-dsh on Windows starts the shell PATH names, not a same-named exe in the Workspace

- **Date:** 2026-09-29
- **Type:** fix
- **Scope:** `plugins`
- **PR:** [Myriad-Dreamin/penguin-harness#106](https://github.com/Myriad-Dreamin/penguin-harness/pull/106)

[中文版](2026-09-29-sandbox-dsh-acl-runner-program-path.zh.md)

On Windows, the DSH backend's ACL runner starts a confined command's program from a bare name.
Windows then searches the runner's own directory, its current directory (the session's working
directory, inside the Workspace) and System32 before `PATH`.

- The backend now hands the runner the file the harness's `PATH` names for a program given
  without a directory, such as `pwsh` or `powershell`. An `.exe` of the same name in the
  Workspace is no longer started in its place, and a name System32 also carries no longer
  shadows `PATH`.
- A name that no absolute `PATH` entry holds is refused before the runner is involved, with an
  error naming it. A program given with a directory is passed on unchanged.
- The runner's own spawn errors now name the absolute path it was given.
- Linux and macOS are unchanged.
