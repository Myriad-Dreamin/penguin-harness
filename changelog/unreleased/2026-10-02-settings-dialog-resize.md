# The Settings dialog can be resized by its borders

- **Date:** 2026-10-02
- **Type:** feature
- **Scope:** `web`, `ui`

[中文版](2026-10-02-settings-dialog-resize.zh.md)

The Settings dialog can be resized with the mouse, and remembers its size in the browser.

## Details

- Dragging the left or right border changes the width, the bottom border the height, and the bottom-right corner both. The dialog stays centred, so the opposite border moves with the dragged one.
- The size is held between a minimum of 600 × 420 px and the window less the overlay's padding, and is clamped again when the window is resized.
- The chosen size is stored in browser `localStorage` under `penguin.settings.dialogSize` and reused the next time the dialog opens. Nothing is sent to the server; where storage is unavailable the dialog opens at its default size.
- The right and bottom handles are focusable separators: the arrow keys move the border by 16 px.
- Below 640 px the dialog fills the screen and shows no handles.
- `PagedDialog` in the shared UI package takes an opt-in `resizable={{ storageKey }}`; the shared UI strings gained `resizeWidth` and `resizeHeight`.
