/** The plugins page and one registry plugin's detail. */
import { Bind, Module } from "@prismshadow/penguin-core/kernel/runtime";

@Module({
  contributes: {
    "ShellModule.pages": [
      {
        id: "plugins.list",
        key: "plugins",
        path: "/plugins",
        frame: "shell",
        nav: "main",
        admin: false,
        released: true,
        order: 40,
        title: "Plugins",
        titleZh: "插件市场",
        icon: "puzzle",
      },
      {
        id: "plugins.detail",
        key: "plugin-detail",
        path: "/plugins/registry/*",
        frame: "shell",
        nav: "none",
        admin: false,
        released: true,
        order: 41,
      },
    ],
  },
})
export class PluginsModule {
  @Bind("plugins.list") list = { load: () => import("./plugins-page").then((m) => m.PluginsPage) };
  @Bind("plugins.detail") detail = {
    load: () => import("./plugin-detail-page").then((m) => m.PluginDetailPage),
  };
}
