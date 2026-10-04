# Page loads with a machine connected stop waiting on round trips they do not need

- **Date:** 2026-10-04
- **Type:** fix
- **Scope:** `server`, `web`

[中文版](2026-10-04-load-speed-fixes.zh.md)

Changes that cut requests, round trips and repeated work from opening the Web App and its company pages; several are felt mostly over a slow link.

## Details

- Requests forwarded to a machine under `/server/<id>/api/…` reuse their channel through the machine's ssh session instead of dialling a new one per request, which had cost an extra round trip on every call. A channel is kept only within the session it was dialled through: when the session is replaced, its channels are closed before the next request. A read whose kept channel the machine had just closed is sent once more on a fresh one; a write is not.
- The Session list's first load no longer waits for every list it asks for: not for connected machines, and not for each Agent's list (every organization employee's among them). The lists that have answered (with each machine's remembered Sessions standing in for it) are shown as they arrive, so a Session opens as soon as the list holding it has answered; the rest join when they land. The chat page waits for the whole list before deciding a linked Session is missing or picking the latest conversation.
- The terminal list answers over the API socket. It had answered 401 on every page load, because the terminal routes read a session cookie that socket calls do not carry; the page then spent a second `GET /api/me` checking whether it was still signed in.
- Several parts of the page that read the user's prefs or a Project's model list as they mount share one request while it is in flight, instead of each sending its own: a load sent `GET /api/me/prefs` five or six times and the model list twice. Nothing is kept once the request settles, and a read sent before a write is never handed to a caller who asked after that write.
- An organization page opened by URL reads that Project's organizations at once, instead of first waiting for the Project list.
- The kernel's manifest document type is built on first use instead of when the kernel is imported, which the web did on every load without ever using it.
- Message times are formatted with one reused formatter per UI language.
- The organization pages' reads no longer rewrite unchanged desk and ticket rows into SQLite, and a trace-index pass no longer rewrites shards whose size has not changed.
