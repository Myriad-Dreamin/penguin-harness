# The command palette widens with its content

- **Date:** 2026-10-30
- **Type:** feat
- **Scope:** `ui`
- **PR:** TBD

[中文版](2026-10-30-command-palette-content-width.zh.md)

The command palette's panel keeps its full-width, overlay form and its
narrow default on phones, but its maximum width now steps up one tier above
the small breakpoint (`max-w-md` → `sm:max-w-lg`), the same seam the modal
family uses. Action rows carry long session ids and titles, and the fixed
28 rem cap was clipping them; the wider panel lets them stay readable
without changing any interaction — no horizontal scrolling, and the
keyboard model (arrow keys to move the selection, Enter to run, Escape to
close) is untouched.
