# The design RFCs move into the repository under rfcs/

- **Date:** 2026-10-18
- **Type:** process
- **Scope:** `docs`

[中文版](2026-10-18-design-rfcs-into-main-repo.zh.md)

Added an `rfcs/` directory holding the project's design RFCs, migrated from the design repository [penguin-harness-design](https://github.com/Prism-Shadow/penguin-harness-design): the ten documents landed on its default branch and the ten drafts still carried by its open or draft design pull requests, keeping their PRFC numbers and filenames.

## Details

- Each migrated document keeps its original title, metadata bullets and body unchanged, and gains two additions: a provenance marker under the title — the source file in the design repository and its state there (landed on the default branch, or the open or draft design PR carrying the draft), plus the current rev — and a `## Changes` section at the end, starting at `v1.0.0`.
- The directory's entry note (`rfcs/README.md` and `rfcs/README.zh.md`) states the four conventions this surface now carries: an RFC and the implementation changes it corresponds to never travel in the same pull request; a landed RFC is not modified frequently; a modification raises the rev (e.g. `v2.0.0`); and every revision lists its change items under `## Changes`.
- Numbering carries over unchanged. Two drafts share the number `0005` (`PRFC-0005-mechanisms-not-implementations.md` and `PRFC-0005-plugin-versioning.md`) — independent design lines kept distinguishable by filename; the number `0013` is retired (the HMR RFC was renumbered to `0002` before it landed).
- Where an open design PR carries an unmerged revision of a landed document (PRFC-0003's local-plugin linking revision in [penguin-harness-design #279](https://github.com/Prism-Shadow/penguin-harness-design/pull/279)), the migrated document keeps the landed text and its marker records the pending revision.
- Documentation only: no code, test, or configuration surface changed.
