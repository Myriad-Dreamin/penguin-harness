# Company-mode pages a plugin contributes are mounted from the runtime table

- **Date:** 2026-10-21
- **Type:** fix
- **Scope:** `web`

[中文版](2026-10-21-org-proposals-route.zh.md)

The organization layout mounts the company-mode pages a plugin contributes (`nav: "org"`, the proposals queue among them) from the page table the server answers at runtime instead of the web build's own manifest, which carries none of them. The contributed route is added to the router when that table arrives, and the page receives the route's own parameter, so the queue, a proposal, the PR graph and the activity feed each open on their own address.

While the table is still on its way, the contributed route shows the page's loading placeholder rather than the overview, so an address opened cold is not thrown away before its page can arrive. Once the table has answered, a child path it does not hold is sent to `/org/<projectId>/<orgId>/overview` by an absolute path: the layout's catch-all used to redirect relatively, which appended `/overview` to the unmatched address on every render and left the content area empty.
