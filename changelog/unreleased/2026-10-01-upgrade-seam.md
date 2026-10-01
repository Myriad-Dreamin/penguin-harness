# WebSocket upgrades go to the platform; the terminal handshake ships by push

- **Date:** 2026-10-01
- **Type:** refactor
- **Scope:** `server`, `docs`

[中文版](2026-10-01-upgrade-seam.zh.md)

- Every listener now forwards each WebSocket upgrade, unread, to the current platform generation through an upgrade seam, the counterpart of the HTTP seam. A path the platform does not take is answered 404, and an upgrade that arrives while no generation is current is answered 503.
- The terminal stream handshake moved into the platform. That covers the path, the Origin check, the session cookie and the owner check. A change to any of them now reaches an installation by hot push.
- A platform from before this change has no `upgrade`, so its terminal streams are refused with 404 under an entry that has this change. The platform keeps `terminals()` and `attachStream()` for entries that predate it.
