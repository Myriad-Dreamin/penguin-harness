# A roadmap's room invites the employees themselves

- **Date:** 2026-10-06
- **Type:** feature
- **Scope:** `company-roadmaps`, `server`
- **Breaking:** yes — the `OrganizationModule.channelClaims` slot, `MessagingTaskRunner.steer` and the roadmap relay settings were removed

[中文版](2026-10-06-roadmap-rooms-invite-employees.zh.md)

A roadmap under discussion stopped opening a session per employee for its room. The room became an ordinary organization channel: its members took part from their own desks, and the organization delivered its messages to them as it does any channel's.

## Details

- The plugin no longer claimed the room from the organization's mention delivery, opened no room sessions, and kept no relay: `roadmaps-relay.json` was no longer read or written, and the `relayDepth` / `pollSeconds` settings were removed. An exchange between employees in the room stopped at the organization's mention-chain limit.
- The room's channel followed the roadmap's members: `roadmap.members` added and removed employees in it, and a reopening brought back a member who had left the channel.
- Each member's desk was told it was in the room when the room opened or was bound to a roadmap waiting for one; the moderator's line carried the draft and establishment commands. The approval request and the reopening went to desks (`notify.roadmap.approval_requested` and `notify.roadmap.reopened` lost their `sessionId` / `sessionIds` params).
- The moderator was the first member until `roadmap.members` named another.
- The server removed the `OrganizationModule.channelClaims` slot and `MessagingTaskRunner.steer`, which only this plugin used.

## Compatibility

- A `company.db` an earlier build wrote may hold a `roadmap_clones` table and `clone` / `clone_closed` events. They were left as they were: the table was no longer read or written, and the events stayed in a roadmap's timeline as recorded.
- A plugin that contributed to `OrganizationModule.channelClaims` or called `MessagingTaskRunner.steer` had to drop that; a company workflow that replaced `notify.roadmap.approval_requested` or `notify.roadmap.reopened` received `to` and `text` only.
