# 系统设置弹窗可拖动边框调整大小

- **Date:** 2026-10-02
- **Type:** feature
- **Scope:** `web`, `ui`

[English](2026-10-02-settings-dialog-resize.md)

系统设置弹窗可以用鼠标调整大小，尺寸记在浏览器本地。

## 细节

- 拖动左右两侧边框调整宽度，拖动下边框调整高度，拖动右下角同时调整两者。弹窗始终居中，对侧边框随拖动的边框一同移动。
- 尺寸限定在最小 600 × 420 px 与窗口减去遮罩内边距之间，窗口大小变化时重新限定。
- 调整后的尺寸存于浏览器 `localStorage` 的 `penguin.settings.dialogSize`，下次打开沿用；不发送到服务端，存储不可用时以默认尺寸打开。
- 右侧与下侧的拖动柄是可聚焦的分隔条，方向键每次移动边框 16 px。
- 窗口窄于 640 px 时弹窗占满屏幕，不显示拖动柄。
- 共享 UI 包的 `PagedDialog` 新增可选的 `resizable={{ storageKey }}`；共享 UI 文案新增 `resizeWidth` 与 `resizeHeight`。
