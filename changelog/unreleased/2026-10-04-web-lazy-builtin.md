# The Web App loads a feature's code when it is first shown, not with the first page

- **Date:** 2026-10-04
- **Type:** perf
- **Scope:** `web`, `ui`

[中文版](2026-10-04-web-lazy-builtin.zh.md)

The script every page load fetches and evaluates before anything is drawn shrinks by about a third: the code of features the first screen does not show now loads when they are first opened.

## Details

- Every page except the conversation and the home redirect — Agents and an Agent's settings, Models, Plugins and a plugin's page, Machines and a machine's ports, the Cost Center, the Evaluation Center and a benchmark, the dashboard, the terminal, a workflow's app page, company mode's pages and the proposals page — loads its code on its first visit. Until its code has arrived the page shows the usual delayed loading status, whether it was reached by a navigation or opened by its address; the page being left is gone at once, so nothing it does can redirect the navigation in flight.
- The dock's panels, company mode's sidebar blocks (the organization switcher, channels, roadmaps and desks), the Settings dialog, the messaging binding dialog and the App info dialog's licence texts load when first shown. Company mode's switch, its nav rows and its unread badge stay with the first page, so the sidebar draws them at once.
- KaTeX and its stylesheet load the first time a text that may hold a formula is shown, once per page. Until they arrive the formula shows its TeX source, the way a streaming reply already does, and is typeset in place.
- Resting the pointer on a nav row, or moving focus onto it, starts loading the code of the page it leads to.
- A part whose code fails to load (a dropped connection, an update deployed under an open tab) shows a short notice with a Retry where it would have been, instead of a blank area; the rest of the app keeps working.
- The permission menu's More… opens the one Settings dialog the app keeps, on the Plugins page's Sandbox card, rather than a copy of its own.
