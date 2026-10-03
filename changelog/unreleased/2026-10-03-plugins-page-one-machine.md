# The Plugins page views one machine at a time

- **Date:** 2026-10-03
- **Type:** fix
- **Scope:** `web`
- **PR:** [Myriad-Dreamin/penguin-harness#213](https://github.com/Myriad-Dreamin/penguin-harness/pull/213)

[中文版](2026-10-03-plugins-page-one-machine.zh.md)

The Plugins page had opened on an "All machines" view that judged Installed and Available by the shared `[plugins]` table alone, and its machine picker appeared only when there was another machine. A plugin written into this machine's own `[plugins.<machineId>]` table — as the Sandbox card's install of a backend does — read "only on This server" under Installed and "not installed" under Available at once, and a single-machine deployment could not switch to its own view. The page now always views one machine, this server by default.

## Details

- The picker's "All machines" choice was removed; it lists this server first, then the machines the Project reaches and any a table names, and stays hidden when there is only one machine.
- Installed lists the viewed machine's own table together with the shared one. A shared row carries the tag **Shared by all machines** and cannot be removed from the page; its tooltip says it is managed in the Project config for every machine. A plugin in both tables shows as shared. The machine's own rows carry no tag and can be removed. Agents and the API still edit the shared table.
- Available lists the index's and the machine's shipped plugins that neither table runs there; a plugin listed only for another machine is offered as usual.
- Install and Remove on the page always write the viewed machine's own table, and stay unavailable until this server's machine id has been read.
- The "only on …" tag and the "not on this server" state were removed, with the strings `allMachines`, `onlyOn`, `notHere` and `sharedCannotRemove`; `sharedTag` and `sharedHint` were added.
