# Hot pushes keep the old runtime answering through the swap window

- **Date:** 2026-10-20
- **Type:** fix
- **Scope:** `server`, `hmr`

[中文版](2026-10-20-hot-push-keeps-the-old-runtime-answering.zh.md)

The platform shell now captures the `http` its API sockets dispatch through once per generation, and a call that arrives while the tree behind it is disposed — the window between one generation's dispose and the next generation's first answer — is answered by the captured generation instead of erroring on every call. The capture is re-taken at every boot the shell runs, the designed 503 stays for a live tree with no `http` surface, and the successor still closes the sockets (1012) once it is up.

A terminal stream's handshake is answered the same way. The upgrade of `/api/terminals/<id>/stream` — the connection the API socket itself rides — authenticates its session cookie before it queues with the platform, and that request-time resolution now resolves the current App's auth service first and falls back to the generation it captured when the tree is disposed: a handshake landing in the window is authenticated by the old generation, and the process stays up. A generation with no auth face to offer (a bare kernel, or the moment before the first capture) is refused with the designed 503, and the whole auth step stays inside the upgrade listener.

A failed push's receipt now says what the receiver did about it: `recovered: true` — the previous platform was re-booted from its parked document and is serving again; `recovered: false` — the recovery failed too, and the receiver serves a half-stopped App until a successful push or a restart. `scripts/deploy.mjs` prints the verdict.

Before anything is sent, `scripts/deploy.mjs` runs a static compatibility gate (`scripts/check-push-compat.mjs`) that compares the pushed tree with the target's serving tree: the runtime interface needs the push claims, its platform member face, and its named migration ledger. A violation refuses the push (`--force` pushes anyway); the resource groups this swap will not integrate are listed up front; a target whose serving tree cannot be read from this checkout's git objects is announced as not checked, and a declaration that cannot be read fails the gate rather than passing it silently.
