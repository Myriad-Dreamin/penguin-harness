# The macOS CI jobs build the server again

- **Date:** 2026-09-29
- **Type:** fix
- **Scope:** `ci`

[中文版](2026-09-29-ci-macos-build-heap.zh.md)

The build step every CI job shares now runs Node with a 4 GB heap. On the 7 GB `macos-latest`
runner the default heap is about 2 GB, and the server's declaration build needs more than that, so
`test-macos (server)`, `test-macos (rest)` and `runtime (macos-latest, --mac)` failed at
`ERR_WORKER_OUT_OF_MEMORY` before any test ran. The ubuntu and windows runners already had a 4 GB
default, so their builds see the same limit as before.

## Details

- The build step prints the runner's memory and the heap limit, both the default and the one in
  effect, before it builds.
- Only the build step carries the setting; the test steps keep the runner's default.
