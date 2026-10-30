# 命令面板随内容放宽

- **Date:** 2026-10-30
- **Type:** feat
- **Scope:** `ui`
- **PR:** TBD

[English](2026-10-30-command-palette-content-width.md)

命令面板的面板保持全宽、覆盖式弹层与手机上的窄默认，但最大宽度向小断点之上放宽一档
（`max-w-md` → `sm:max-w-lg`），与 modal 家族用的是同一道接缝。候选行里会话 id 与标题都很
长，原先固定 28 rem 的上限会把它们截断；放宽后的面板让它们保持可读，而交互零变化——无横
向滚动，键盘模型（方向键移动选择、Enter 运行、Escape 关闭）原样不动。
