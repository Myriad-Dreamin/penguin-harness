# Web App modules: every feature directory is one

- **Date:** 2026-09-29
- **Type:** refactor
- **Scope:** `web`, `skills`

[中文版](2026-09-29-web-modules-everywhere.zh.md)

The other 24 feature directories of the Web App became modules the way the terminal did in [2026-09-27-web-ui-modules](2026-09-27-web-ui-modules.md): a public entry, their own dictionary fragments, a test project of their own and a declared list of dependencies. No user-visible text or behaviour changed.

## Details

- Every import of a feature from outside its directory — app sources, the app stores and the app's tests — goes through that feature's `index.ts`; the entries export exactly what outside code used.
- 23 dictionary sections moved out of both app dictionaries into the owning module's `strings.ts` and are mounted by reference; components still read `S.<section>.*`. The module manifest names the section when it differs from the directory (`schedules` fills `schedule`, `agents` fills `agent`); the proposals module has no copy of its own. The English `chat.thinkingLevelMenuName` now takes the level argument its Chinese twin takes, and still ignores it.
- 121 unit tests moved from the app's `test/` into the module they exercise; each module with copy gained a test that its zh and en fragments have the same keys and function arity. Tests that read source files across the app stay in the app project.
- Each module declares the files outside it that it imports (`dependsOn`), and the boundary test holds it to that list. A new test loads every module's entry first in a fresh module graph, so an import cycle between modules that breaks at load time fails there.
- Three app tests that replace the endpoints module now keep the endpoints they do not replace.
