# 不兼容交接等待会话 writer 真正完成

- **Date:** 2026-10-12
- **Type:** fix
- **Scope:** `server`

[English](2026-10-12-session-writer-drain.md)

不兼容的会话状态交接现在等待收到 abort 的 writer 真正完成，再发布下一代并恢复被中断的会话。超过普通退出的五秒等待预算不再允许第二个 writer 启动；进程退出仍保留有界等待。
