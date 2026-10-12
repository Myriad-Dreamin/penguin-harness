# 终端流从当代 App 解析鉴权

- **日期：** 2026-10-12
- **类型：** fix
- **范围：** `server`

[English](2026-10-12-terminal-stream-current-auth.md)

终端 WebSocket 升级从服务终端及流协议的同一个平台实例现解析 Auth，不再读取运行时的 Auth getter。插件重组后，有效会话 cookie 进入当前 App；业务树缺失或已释放时，握手返回 503 并记录一行终端日志，不把解析异常抛出升级回调。cookie 选择、同源检查及终端所有权校验保持不变。

这一握手修复需要更新运行时，单独推送平台不能替换 socket 装配。
