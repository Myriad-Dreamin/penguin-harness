# Web App 模块：每个 feature 目录都是一个模块

- **Date:** 2026-09-29
- **Type:** refactor
- **Scope:** `web`, `skills`

[English](2026-09-29-web-modules-everywhere.md)

Web App 其余 24 个 feature 目录按 [2026-09-27-web-ui-modules](2026-09-27-web-ui-modules.zh.md) 中终端的做法成为模块：一个对外入口、自己的词典片段、自己的测试项目，以及一份声明过的依赖清单。用户可见的文案与行为均无变化。

## 细节

- 目录外对某个 feature 的一切导入——应用源码、应用级 store 与应用测试——都经由该 feature 的 `index.ts`；入口只导出外部实际用到的名字。
- 23 个词典分区从两份应用词典移入所属模块的 `strings.ts`，由应用词典按引用挂载；组件仍读 `S.<分区>.*`。分区名与目录名不同时由模块清单写明（`schedules` 填 `schedule`，`agents` 填 `agent`）；proposals 模块没有自己的文案。英文的 `chat.thinkingLevelMenuName` 现在与中文一样接收 level 参数，仍不使用它。
- 121 个单元测试从应用的 `test/` 移入所测的模块；每个有文案的模块新增一条测试，校验其 zh 与 en 片段的键与函数参数个数一致。跨应用读取源码文件的测试留在应用项目中。
- 每个模块声明它导入的外部文件（`dependsOn`），边界测试按这份清单检查。新增一条测试在全新的模块图中先加载每个模块的入口，模块间在加载期出问题的导入环会在这里失败。
- 三个替换 endpoints 模块的应用测试，现在保留它们未替换的那些 endpoint。
