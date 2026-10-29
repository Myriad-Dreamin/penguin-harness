# Trace 读取不再每次请求都重跑 reconcile 慢路

- **Date:** 2026-10-29
- **Type:** fix
- **Scope:** `server`

[English](2026-10-29-trace-reconcile-scan-cost.md)

共享 Trace 的 reconcile 原本就跑在每一次读里：Agents 列表、会话列表的水合段、单会话 GET、消息读取与 Traces 列表都先等一道 mtime 门控的 diff 再作答。持续写入时新鲜窗口判树不稳定，每次读都重走慢路，一个会话的请求被其他会话的活动拖慢。现在读路径只做一次门控采样——安静的树只有若干次 stat——树真的动过才 diff，并在其上调度一次防抖的后台 reconcile。读到的答案不变。

## 一次读现在花什么

安静的树每次读只花目录 stat，零 readdir、零 head-read、零 diff；读与读之间动过的树为变化付一次 diff，而不是每次读各付一次，写入平息之后由读路径调度的后台轮把索引跟上磁盘。读不到所报名字的会话时仍然强制一次全量 diff 再重试作答，索引陈旧的代价是多一次扫描，绝不是丢一个文件。mtime 门控与新鲜窗口原样保留——快不是靠削弱正确性保护换来的。

## 兼容性

重启后一个只存在于 Trace 目录的会话照旧被采纳：启动扫强制跑它那一轮，不等后台。索引里仍有行而磁盘已丢的 shard 读作空，随下一次 reconcile 落掉行。单会话 GET 不再以 hasTrace 快照短路 latestTracePath 的查找，两次后台之间写入的 Trace 仍能被找到。
