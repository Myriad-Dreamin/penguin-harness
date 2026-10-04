# 插件可携带加入 Web App 模块树的 Web 模块

- **Date:** 2026-10-04
- **Type:** feature
- **Scope:** `web`, `server`, `tooling`
- **Breaking:** yes — `ChatModule.fileRenderers` 的贡献改为携带扩展名，服务端的 `WebModule.fileRenderers` 槽位已删除

[English](2026-10-04-plugin-web-modules.md)

插件包现在可以携带在 Web App 中运行、带代码的模块，写法与 Web App 自己的模块相同。音乐示例是第一个：音频播放器从 Web App 移入了该插件。

## 细节

- `scripts/gen-ifaces.mjs` 按连线为插件包的每个模块判定归属：它贡献的、依赖的或替换的模块必须属于平台的接口表或 Web App 的接口表；并把 `side`、`source` 以及 Web 模块的产物 `file` 写入该包的 `ifaces.json`。模块指向两边都没有的模块、指向所有者没有的槽位、同时连到两边，或一个源文件同时含两边的模块，都是构建错误并报出模块名。不指向任何模块的模块仍属于平台。
- `scripts/build-plugin.mjs` 按这份表构建插件包：面向 Node 的主入口只列平台模块；每个 Web 模块产出 `dist/web/<Module>.js`，即面向浏览器的 ES 模块，延迟导入的代码拆成代码块；存在 `src/styles.css` 时由 Tailwind 以 Web App 的主题为参照编译为 `dist/web/styles.css`。Web 模块与 Web App 共用 React、JSX 运行时、kernel 运行时入口（`@prismshadow/penguin-core/kernel/runtime`，同时承接 `@prismshadow/penguin-core/plugin`）和 UI 包（页面把它们放在 `globalThis.__penguinShared` 上，构建把这些导入解析到那里）；打包进其中任何一个的副本、其同族的其他包（包括完整 kernel）或 Node 内建模块都会使构建失败。Web 模块对其自行重述的 Web App 接口的依赖以 Web App 的键写入，其副本也放在该键下，页面因此按身份连线。
- `GET /api/contributions` 以 `webModules` 转发已启用插件的 Web 模块：每个包的名称与版本、Web 模块清单、其接口与类型条目，以及产物文件和样式表的 URL。文件经 `/api/plugins/<package>/web/<build>/<file>` 提供，构建标识是产物文件的哈希，缓存一年且不可变；其他构建标识返回 404。
- Web App 用上次答复留下的清单（`penguin.listCache.webModules`：按数据根区分，登出时清除，安全模式下不读）启动，同时由请求在后台重新确认；只有没有这份清单的浏览器才等待答复（最长等 5 秒，安全模式下不请求）。每个包的接口表按内容只校验一次（kernel 的完整检查，只在遇到未校验过的表时才加载，结论记在页面对所校验内容自行计算的哈希下），再由运行时的身份检查逐个接纳；接纳的包加载文件与样式表，其模块经 kernel 运行时入口作为 `WebRoot` 的运行时子模块启动，因此插件都已校验过的页面不加载 arktype。校验、连线、加载或启动失败的包被剔除并记下原因，写入日志并在插件页显示；应用不带它照常启动。答复中的清单与模块树所用的不同时（插件有变、未登录加载后登录、离开安全模式），新清单被保存并重载页面一次；插件模块已装配时进入安全模式也会重载。
- 回复中的文件渲染器只来自 `ChatModule.fileRenderers` 的贡献：每条以数据携带扩展名、以代码携带组件，在 Suspense 和错误边界内绘制。渲染器会收到界面语言（`locale`）。
- `plugins/example-music` 改为贡献音频播放器（卡片、进度条、时钟、各状态及中英文案）的 Web 模块，样式来自它自己的样式表，其中的工具类都带 `mp:` 前缀，不与宿主的任何选择器重名。Web App 的 `features/audio/` 与 `AudioModule` 已删除，服务端的 `WebModule.fileRenderers` 槽位、贡献答复的 `fileRenderers` 字段以及 Web App 按名字查找渲染器的逻辑也一并删除。

## 兼容性

- 向服务端 `WebModule.fileRenderers` 槽位贡献的模块不再能接入平台的模块树。改为写一个向 `ChatModule.fileRenderers` 贡献的 Web 模块：贡献的数据里写 `extensions`，组件用 `@Bind` 绑定。
- `ChatModule.fileRenderers` 的贡献携带 `extensions`，不再携带 `name`。
