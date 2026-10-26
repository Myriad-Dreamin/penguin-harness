# A conversation on an offline machine names the machine and offers its retry

- **Date:** 2026-10-25
- **Type:** fix
- **Scope:** `web`

[中文版](2026-10-25-offline-machine-session-names-machine.zh.md)

A conversation whose machine is out of reach now says which machine holds it, by its alias, shows the same reconnect status the Machines page shows — which attempt of how many, when the next one runs — and carries the Retry that starts one now. The conversation also opens on its own once the machine is back, without a reload.

## The cold deep link

Opening `/chat/<session>` for a conversation whose machine is down used to show one generic sentence: while the machine cannot answer, the sidebar's list carries no row for the conversation, so the page could not name the machine — although the server's 503 for the direct lookup names it, with its alias. The page now keeps that answer and builds the note from it: the machine's alias, its reconnect status, the server's own sentence one fold away, and a Retry that asks the server to try the machine now. When the machine comes back, the lookup runs again and the conversation opens in place.

## A conversation already open

A conversation whose transcript was already on screen kept saying nothing while its machine dropped and was being brought back: its history read had happened while the machine answered, and nothing failed again to say the machine had gone. A strip above the conversation now names the machine and carries the same retry line, and leaves on its own when the machine answers again.
