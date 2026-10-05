# 插件可携带加入 Web App 模块树的 Web 模块

- **Date:** 2026-10-04
- **Type:** feature
- **Scope:** `web`, `server`, `tooling`
- **Breaking:** yes — `ChatModule.fileRenderers` 的贡献改为携带扩展名，服务端的 `WebModule.fileRenderers`、`WebModule.pageRemovals` 与 `WebModule.agentTabs` 槽位已删除

[English](2026-10-04-plugin-web-modules.md)

插件包现在可以携带在 Web App 中运行、带代码的模块，写法与 Web App 自己的模块相同。三个示例现在都是 Web 模块：音乐示例的音频播放器从 Web App 移入了该插件，hello 示例的页面是插件自带的 React 组件，页面移除示例是一个作用全在数据上的 Web 模块。

## 细节

- 插件模块不声明自己在哪里运行：`scripts/gen-ifaces.mjs` 按模块的接线推导其宿主，并把 `side`、`source` 以及每个 Web 模块的产物 `file` 写入该包的 `ifaces.json`。模块接线所指的宿主包括：以宿主包为键的依赖（`@prismshadow/penguin-web#…`、`@prismshadow/penguin-server#…`），以及其贡献、`from` 与替换所指的模块——当两张宿主接口表（`packages/{server,web}/src/ifaces.json`，插件构建只读取、从不重新生成；缺失时构建报错并说明如何生成）中恰有一张含该模块时。指向一个宿主即归属该宿主；同时指向两个宿主是构建错误，错误信息点名两处接线；一个都不指向则属于平台。一个源文件同时含两个宿主的模块是构建错误；Web 模块依赖本包自行重述的接口（应改为导入 Web App 的声明）同样是构建错误。凡运行 gen-ifaces 的插件包都把 `@prismshadow/penguin-web` 列为开发依赖，使工作区构建先生成两张宿主接口表。
- `scripts/build-plugin.mjs` 按这份表构建插件包：面向 Node 的主入口只列平台模块；每个 Web 模块产出 `dist/web/<Module>.js`，即面向浏览器的 ES 模块，延迟导入的代码拆成代码块；存在 `src/styles.css` 时由 Tailwind 以 Web App 的主题为参照编译为 `dist/web/styles.css`。Web 模块与 Web App 共用 React、JSX 运行时、kernel 运行时入口（`@prismshadow/penguin-core/kernel/runtime`，同时承接 `@prismshadow/penguin-core/plugin`）和 UI 包的插件接口面（页面把它们放在 `globalThis.__penguinShared` 上，构建把这些导入解析到那里）；打包进其中任何一个的副本、其同族的其他包（包括完整 kernel）或 Node 内建模块都会使构建失败。UI 接口面是 `packages/web/src/plugins/ui-surface.ts` 中的显式清单，其中全部已在应用的入口包内：页面静态导入它，构建把 `@prismshadow/penguin-ui` 解析为恰好导出这些名字的桩模块，导入清单之外的名字会使构建失败。类体为空的模块同样产出文件。内置插件打包缓存的键包含插件可见类型、UI 接口面以及宿主接口表的哈希。样式表必须在主题导入上写明 Tailwind 前缀；编译结果里有前缀之外的类名会使构建失败，一起构建的两个插件（`scripts/build-plugins.mjs`）使用同一前缀也会。
- `GET /api/contributions` 以 `webModules` 转发已启用插件的 Web 模块：每个包的名称与版本、Web 模块清单、其接口与类型条目，以及产物文件和样式表的 URL。文件经 `/api/plugins/<package>/web/<build>/<file>` 提供，构建标识是产物文件的哈希，缓存一年且不可变；其他构建标识返回 404。
- Web App 在启动时请求这份清单，与安装标识核对和 `GET /api/me` 并行发出（最长等 3 秒，安全模式下不请求）；清单不跨加载保留。各包按包名顺序处理。每个包的接口表按内容只校验一次（kernel 的完整检查，只在遇到未校验过的表时才加载，结论记在页面对所校验内容自行计算的哈希下）；校验通过的包在 4 秒期限内加载文件与样式表，随后模块树带上全部这些包、经 kernel 运行时入口只做一次身份检查启动，因此插件都已校验过的页面不加载 arktype。只有这次启动失败时才逐个尝试各包，使连线不通的包被单独剔除。校验、限时加载、连线或启动失败的包被剔除并记下原因，写入日志并在插件页显示；应用不带它照常启动。因未登录而被拒的加载之后登录会重载一次；安全模式下加载、随后离开安全模式时，第一份转发了插件模块的答复也会触发重载；插件模块已装配时进入安全模式同样重载；在别处启用或移除的插件在下次加载时生效。
- 每个 `<Deferred>` 边界都捕获其下抛出的任何错误：未能到达的代码块（应用自身的或插件的，例如在已打开的标签页下被重新构建）显示加载提示，其“重试”会重载页面；渲染时抛错的组件显示“这部分界面出错了”，其“重试”会重新挂载该部分。插件页面、会话标签、Shell 图层和每个回复文件渲染器都在这样的边界内渲染，失败的插件组件只影响它自己所在的区块。
- 回复中的文件渲染器只来自 `ChatModule.fileRenderers` 的贡献：每条以数据携带扩展名、以代码携带组件，在各自的 `<Deferred>` 内绘制。渲染器收到的是文件本身（`url`、`path`、`name`），界面语言经 `Language` 获取。
- shell 新增 `ShellModule.pageRemovals` 槽位（`{ key }`，只有数据）。它点名的页面从首次渲染起即被去掉，连同其路径下的路由和挂在它下面的页面；首页指向的页面保留。服务端的 `WebModule.pageRemovals` 槽位与贡献答复的 `pageRemovals` 字段已删除。
- `packages/web/src/plugin-types.ts` 收录插件的 Web 模块在编译期可以引用的 Web App 类型，只作类型导入：`FileRendererProps`，以及界面语言接口 `Language`——由设置模块提供，供插件模块 `@Use`。`Language` 是一个 store：`get()` 返回已提交的值，`subscribe` 在每次变化时回调一次；凡向插件提供的应用状态都采用这一形态。Web App 的界面语言也改由一个这样的 store（`state/locale-store.ts`）保存，只在设置函数与浏览器的 `languagechange` 中改变，不在渲染期间写入。Web 包以仅含类型的子路径 `@prismshadow/penguin-web/plugin-types` 导出它；示例插件把 Web 包列为 devDependency。
- `scripts/verify-builtin-tree.mjs` 在完整检查之后对内置模块树再运行页面启动时的检查（`checkExact`），页面会拒绝的模块树因此在 Web 构建时即失败。
- 插件页面的组件可以延迟加载：页面首次打开时，其代码在 shell 的页面边界内加载。
- `ShellModule.pages` 贡献中的 `order`、`admin` 与 `released` 改为可选。未声明 `order` 的页面按插槽顺序（插件模块排在应用自身的模块之后，彼此按包名）排在声明了 `order` 的页面之后，因此在父页面之下时排在应用自身的子页面之后；`admin` 默认为 false，`released` 默认为 true。
- `plugins/example-hello-page` 改为向 `ShellModule.pages` 贡献页面的 Web 模块，页面位于评估中心之下，不声明位置、管理员限制与发布状态，由插件自带的延迟组件在应用的页面框架内绘制，界面语言经 `Language` 订阅（切换语言后无需刷新即重绘），样式来自它自己带 `hp:` 前缀的样式表。原先的 iframe 文档（`ui/`）已删除。
- `plugins/example-no-evaluation-center` 改为类体为空的 Web 模块，向 `ShellModule.pageRemovals` 贡献 `{ key: "benchmark" }`。两者同时启用时，hello 页面随评估中心一起被去掉。
- Web e2e 的第二个插件集合改为 `all-examples`，启用全部三个示例。
- `plugins/example-music` 改为贡献音频播放器（卡片、进度条、时钟、各状态及中英文案，文案随经 `Language` 读取的界面语言切换；文件时长未知时时钟显示 `-:--`、播放头停在起点，不足一秒的时长显示 `0:01`）的 Web 模块，样式来自它自己的样式表，其中的工具类都带 `mp:` 前缀，不与宿主的任何选择器重名。Web App 的 `features/audio/` 与 `AudioModule` 已删除，服务端的 `WebModule.fileRenderers` 槽位、贡献答复的 `fileRenderers` 字段以及 Web App 按名字查找渲染器的逻辑也一并删除。

## 兼容性

- 向服务端 `WebModule.fileRenderers` 槽位贡献的模块不再能接入平台的模块树。改为写一个向 `ChatModule.fileRenderers` 贡献的 Web 模块：贡献的数据里写 `extensions`，组件用 `@Bind` 绑定。
- `ChatModule.fileRenderers` 的贡献携带 `extensions`，不再携带 `name`。
- 向服务端 `WebModule.pageRemovals` 槽位贡献的模块不再能接入平台的模块树。改为写一个向 `ShellModule.pageRemovals` 贡献的 Web 模块，数据同样是 `{ key }`。
- 服务端无人读取的 `WebModule.agentTabs` 槽位及贡献答复的 `agentTabs` 字段已删除；向它贡献的模块不再能接入平台的模块树。
