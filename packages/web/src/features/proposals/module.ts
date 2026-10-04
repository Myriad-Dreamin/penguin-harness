/**
 * The proposals page: the builtin renderer the company-proposals plugin's page contribution
 * names (`OrgProposalsPage`). The plugin says the page exists and where it is routed; this
 * build supplies what draws it, by that name (`ShellModule.pageRenderers`).
 */
import { Bind, Module } from "@prismshadow/penguin-core/kernel";
import { lazyComponent } from "../../lib/lazy-component";

@Module({
  contributes: {
    "ShellModule.pageRenderers": [{ id: "proposals.page", name: "OrgProposalsPage" }],
  },
})
export class ProposalsModule {
  @Bind("proposals.page") page = lazyComponent(
    () => import("./proposals-page"),
    "OrgProposalsPage",
  );
}
