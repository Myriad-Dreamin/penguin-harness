# 模块树获得 compile 阶段：以数据注册的 pass 在 boot 前改写整棵树

- **Date:** 2026-10-25
- **Type:** feature
- **Scope:** `server`, `docs`

[English](2026-10-25-module-compile-pass.md)

模块树现在在装配与 boot 之间经历一次 compile：模块向 `CompileModule.passes` 投递 pass——一个 id，加上各自排在哪些 id 后面——管线按这些声明排序、对当前树检查每个 pass 的要求、把树的不可变副本交给它改写、把失败的 pass 放下而不拖垮 boot，并在第一个节点创建之前用内核自己的整树校验收口。instrument、替换与策略随树声明、作为数据被校验，不再藏在运行时钩子后面。设计见 PRFC-0021。

- 注册面：一个只携带纯数据 `passes` 槽的 `Compile` 接口，由校验路由与设置分组的同一个 checker 逐条校验；`CompileModule` 节点挂在平台根下，两个 boot 分支都一样——全平台树与声明的 bare kernel 以同一条路 compile。
- pass 的代码半由宿主按注册的 id 解析（管线的 `resolve` 选项）；plugin host 可以用插件 bundle 导出的东西回答这里。注册了却无人解析的 id 被警告并跳过；不注册任何东西的树跑一次只有校验的 compile。
- `PENGUIN_MODULE_COMPILE_DEBUG=1` 门控排障输出：逐 pass 的 trace（计时、skip 与失败理由）加编译后整树的转储；静默路零收集、零计时。
- 内核零改动：整套机制架在已导出的原语上（`checkTree`、`satisfies`、`Interface`、`Slot`、`defineModule`），管线把树当数据读——manifest 是程序，`create()` 函数是不透明的叶子。
