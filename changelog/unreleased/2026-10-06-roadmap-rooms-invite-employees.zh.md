# 路线图讨论室直接邀请员工本人

- **Date:** 2026-10-06
- **Type:** feature
- **Scope:** `company-roadmaps`, `server`
- **Breaking:** yes — 移除了 `OrganizationModule.channelClaims` 插槽、`MessagingTaskRunner.steer` 与路线图转发设置

[English](2026-10-06-roadmap-rooms-invite-employees.md)

讨论中的路线图不再为讨论室给每位员工另开一个会话。讨论室成了普通的组织频道：成员在各自的工位上参与，组织像投递任何频道一样把消息投递给他们。

## 细节

- 插件不再从组织的提及投递中认领讨论室，不再开讨论室会话，也不再转发：`roadmaps-relay.json` 不再读写，`relayDepth` / `pollSeconds` 设置被移除。员工之间在讨论室里的往来止于组织的提及链上限。
- 讨论室的频道跟随路线图的成员：`roadmap.members` 在频道里增删员工，重开时把中途离开频道的成员重新加回。
- 讨论室开启、或绑定到等待讨论室的路线图时，每位成员的工位都会收到一行通知，告知其已在讨论室中；主持人那一行附带起草与确立的命令。批准请求和重开通知改为发到工位（`notify.roadmap.approval_requested` 与 `notify.roadmap.reopened` 去掉了 `sessionId` / `sessionIds` 参数）。
- 在 `roadmap.members` 指定其他人之前，主持人是第一位成员。
- 服务端移除了只有本插件使用的 `OrganizationModule.channelClaims` 插槽和 `MessagingTaskRunner.steer`。

## 兼容性

- 旧版本写下的 `company.db` 可能含有 `roadmap_clones` 表以及 `clone` / `clone_closed` 事件。它们保持原样：该表不再读写，这些事件按记录留在路线图的时间线里。
- 向 `OrganizationModule.channelClaims` 提供贡献或调用 `MessagingTaskRunner.steer` 的插件需去掉这部分；替换了 `notify.roadmap.approval_requested` 或 `notify.roadmap.reopened` 的公司工作流只会收到 `to` 与 `text`。
