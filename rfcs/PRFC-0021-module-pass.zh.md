# PRFC-0021 Module Pass：模块树的 compile 阶段

[English](PRFC-0021-module-pass.md)

- Feature Name: `module_compile`
- Start Date: 2026-10-25

## Summary
[summary]: #summary

模块树在装配与 boot 之间获得一个 compile 阶段。一组以 manifest 数据注册进树的 **ModulePass** 把树当数据改写——instrument、替换与策略在装配期施加、随树一起校验，而不是藏在运行时钩子后面。树的生命周期由「装配 → boot」补成「装配 → **compile** → 校验 → boot」，整套机制架在 [PRFC-0001](PRFC-0001-module.zh.md) 已导出的原语上：内核本身零改动。

## Motivation
[motivation]: #motivation

任何必须在树 boot 之前触碰它的东西——instrument、测试脚手架、策略改写——过去只有两个落点，两个都不对。运行时钩子在事后包住活对象：包装对树自己的校验不可见，顺序由调用时间而不是声明决定，一个坏掉的包装还会拖垮整个 boot。写在 booter 里的一张清单则是代码：它跟着 booter 走而不是跟着树走，一棵没有它的树会静默失去这层行为。

以 manifest 数据注册把三件事都修正了：跑什么、按什么顺序，都在树装配的地方声明，在任何代码运行之前作为数据被校验，逐 pass 隔离，并在第一个节点创建之前用内核自己的整树校验收口。

## Guide-level explanation
[guide-level-explanation]: #guide-level-explanation

一个带 pass 的模块向 `CompileModule.passes` 投一条注册，与路由组抵达 `HttpModule.routes` 是同一条路：

```json
{ "contributes": { "CompileModule.passes": [{ "id": "my-pass", "after": ["other-pass"] }] } }
```

注册是数据：一个 `id`，加上它排在哪些 id 后面。checker 用槽的 schema 随树一起校验它——一条坏注册是一个指出文件的 boot 错误，而不是运行时的意外。pass 的**代码**半——改写函数——由宿主在 compile 开始时按 `id` 解析（管线的 `resolve` 选项）；plugin host 用插件 bundle 导出的东西回答这里。manifest 携带的正是此前没有着落的那一半：这棵树跑**哪些** pass、按什么顺序。

compile 在每次 boot 都跑——冷启动、重新装配、恢复——全平台树与声明的 bare kernel 都一样。`PENGUIN_MODULE_COMPILE_DEBUG=1` 门控排障输出：逐 pass 的 trace（计时、skip 与失败理由）加编译后整树的转储；关着的时候静默路零收集、零计时。

## Reference-level explanation
[reference-level-explanation]: #reference-level-explanation

### 注册面（`compile/module.ts`）

- `Compile`：一个自身不带成员的接口类。它携带的是注册槽——要 pass 的树声明 `CompileModule`，注册随之成为可校验的数据；以后在这里长出成员时，模块也可以 require `Compile`。
- `CompileSlots`：伴生接口。它的 `passes` 属性是纯数据的 `Slot<{ after?: string[] }>`，由 `gen:ifaces` 投影进 `ifaces.json`——与 `http.routes` 完全同一机制——并由 checker 逐条校验。条目的 `id` 是投稿的 id——checker 在槽内逐条认定的唯一身份——也是宿主要解析的 pass id。
- `compileModuleDef()`：`CompileModule` 节点。它以空 api 提供 `Compile`——槽才是要点。宿主把它挂在平台根下、与插件模块并排，checker 的可见性规则让兄弟模块的投稿在那里合法。manifest 的 `name` 刻意经一个常量拼写：生成器用一段文本扫描从目录的 `module.ts` 里读模块名，匹配的是 `name: "…"` 字符串字面量——这里写字面量会把 `Compile` 的键改离 manifest 的 `provides` 所点名的包键。

### 管线（`compile/pipeline.ts`、`compile/tree.ts`）

`compileModuleTree(root, { ifaces, resolve?, debug? })` 依次做：

1. **收集**：从树自己的 manifest 收注册（`contributionsOf`）——每一条 `CompileModule.passes` 项，按树序。同 id 的第一条运行；重复的那条带理由跳过，checker 自己会把重复作为问题响亮报出。
2. **排序**：按注册的 `after` 拓扑排序，注册序破平局。成环是具名报错（`a -> b -> a`）；指向未注册 id 的 `after` 视为空——「排它后面，若它在」。
3. **满足性检查**：逐 pass 的 `requires`——它要工作的接口类——对当前树检查：每个要求的接口必须在树里某处提供，名字经表解析。提供的集合算一次，仅在某 pass 真正改写树之后重算。要求不满足的 pass 带理由跳过——这是一棵被剥光的树的正常状态，不是错误。
4. **改写**：每个 pass 拿到树的一个不可变副本（`copyTree`），返回一棵新树。改写输入是 pass 自己的 bug——副本正是下面这条回退成立的原因。抛错的 pass、或返回不了树的 pass，被**放下**：boot 拿到的就是它接手时那棵树，理由留痕，warn 不受 debug 门控——一个抛错的 pass 是值得留一行的 bug。一个 pass 拖不垮 boot。
5. **收口**：最终的树过内核自己的 `checkTree`——boot 跑的同一次检查；compile 接受的树就是 boot 接受的树。被 pass 改坏的树在 compile 处被拒，问题按清单列出、首行即首错。

管线把树当数据读：manifest 是程序，`create()` 函数是不透明的叶子。compile 里没有任何东西执行模块代码。

### boot 接缝（`hmr/platform.ts`）

两个 boot 分支都把 `compileModuleDef()` 装进树——全平台树作为根下再多一个模块，bare kernel 同样——然后 compile，然后 boot：

```ts
const compiled = await compileModuleTree(platformDef(caps, adoptable, [...kept.modules, compileModuleDef()], ...), { ifaces, debug: compileDebug });
return bootModules(compiled.tree, { ifaces, resources, parked });
```

不注册任何 pass 的树跑一次只有校验的 compile；两种情况下 boot 是同一个 boot。宿主今天不传 `resolve`：没有消费方就没有要回答的东西，注册了却无人解析的 id 被警告并跳过——plugin host 将来要填的接缝是这一处调用的选项，不是管线里的代码改动。

### 两条软边，如实写明

- **名桥**。`requires` 是接口类；树提供的是声明名。桥是类的 `.name`：改写绑定名的 minifier 会连它一起改，同名的两个类会碰撞。内核自己的节点名用装饰器上下文的字符串字面量避开这一点；彻底的修法在生成器——把表的键戳到它投影的类上，在这里读戳。在那之前，这条软边写在 `declNameOf` 自己身上。
- **生成前的表**。`ifaces.json` 是构建产物，由 `typecheck`、服务端的 `build` 与 `test`、`deploy.mjs` 各自重新生成。生成器带着 `Compile` 跑过之前，checker 会把 `CompileModule` 的 provides 与 `passes` 槽报为未知——与每个新模块同样的 pre-gen 注记，也是投影是构建面事实而非代码面事实的原因。

## Drawbacks
[drawbacks]: #drawbacks

- 没有任何 pass 注册时，每次 boot 多付一次整树检查：只有 manifest 数据，与 boot 片刻后自己跑的是同一次检查。另一条路——没有注册就跳过 compile——会让 compile 路径变成有条件的，插件带来第一条注册时走的就是没有任何 boot 走过的路径。
- 改写 manifest 数据（而不是包 `create()`）的 pass 必须复制它要改的东西：`copyTree` 浅复制 manifest，未改动的记录与前一棵树共享。这一条写在 `ModulePass.rewrite` 的契约上。

## Rationale and alternatives
[rationale-and-alternatives]: #rationale-and-alternatives

- **内核缺省钩子**（booter 调用的 `wrapApi` 缝）：在更早的 trial 里被否——钩子是内核要一直保持诚实的缝，而且它把模块树要取代的运行时顺序又请了回来。compile 让内核保持零改动：管线是树的消费者，不是内核的扩展。
- **booter 里的一张 pass 清单**：清单是代码，对树的校验不可见，也没法跟着需要它的树走。以贡献数据注册沿用这棵树已经在用的模式——路由、设置分组、技能目录都是这么进来的。
- **按接口名 switch 分发**：参考消费方按类身份分发，每个分支用自己转型的类做类型检查——键与分支没法像字符串键与远处的 case 那样漂开。

## Prior art
[prior-art]: #prior-art

名字沿用编译器的传统：对树的一组 pass、按声明的依赖排序、逐个隔离、末尾校验。注册机制沿用这套代码库的模块树里已经在用的贡献槽模式。

## Unresolved questions
[unresolved-questions]: #unresolved-questions

- **插件 bundle 的 pass 工厂**。注册是 manifest 数据；代码半跟它走不通（`bind` 在 `create()` 里面才把投稿交给投稿方，而那在 compile 之后）。今天宿主自己解析 id；plugin host 从 bundle 导出的东西回答工厂，动的是插件装载契约（[PRFC-0003](PRFC-0003-plugin.zh.md)），是它自己的一次后续改动。
- **生成侧的名字戳**，取代 `requires` 上的 `.name` 桥（见上文的软边）。
- **node-local pass 的共享遍历**：几个一次只碰一个节点的 pass 可以共享一次遍历，失败的 pass 被剔除后重启遍历；改树形的 pass 保持整树形式。代价模型是拿一次复制换一个更窄的视野。
- **槽的粒度**：今天一个 `passes` 槽；要不要按种类分槽、注册要不要 `id` 与 `after` 之外的元数据，等第二个消费方。
- **无关 pass 之间的顺序**：平局今天由注册序破；两个互不相关的 pass 之间要不要显式声明，未决。

## Future possibilities
[future-possibilities]: #future-possibilities

- instrument 是第一个消费方；测试脚手架（为测试翻倍的树）与策略改写（按配置修剪的树）是同一个形状，不需要新机制。
- 推送前检查可以对目标 runtime 已发布的接口表跑一次 compile，在装不上的 bundle 被推过去之前拦住它。

## Changes

### v1.0.0

- Added：模块树的 compile 阶段——`Compile` 注册接口、`CompileModule.passes` 槽、`compileModuleTree` 管线、两个 boot 分支的接缝与 debug 门控，随其实现一起落地。
