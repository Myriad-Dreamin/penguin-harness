/** The dashboard page: reached from the user menu, not from the nav. */
import { Bind, Module } from "@prismshadow/penguin-core/kernel";
import { lazyComponent } from "../../lib/lazy-component";

@Module({
  contributes: {
    "ShellModule.pages": [
      {
        id: "dashboard.page",
        key: "dashboard",
        path: "/dashboard",
        frame: "shell",
        nav: "none",
        admin: false,
        released: true,
        order: 80,
      },
    ],
  },
})
export class DashboardModule {
  @Bind("dashboard.page") page = lazyComponent(() => import("./dashboard-page"), "DashboardPage");
}
