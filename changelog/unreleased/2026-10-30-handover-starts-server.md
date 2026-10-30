# A stopped machine is started so the build can be handed to it

- **Date:** 2026-10-30
- **Type:** fix
- **Scope:** `server`

[中文版](2026-10-30-handover-starts-server.zh.md)

Enabling a machine whose program was current but whose server was down recorded the machine
as being on this build while nothing had reached it: the hand-over goes through the running
server's update channel, and with none there was nothing to hand the build to. From then on
"use" read its own record, said "already on", and did nothing — the machine kept running the
older build, and the forced install, which only a failed job offers, stayed out of reach.

## Details

- A hand-over that finds no server running now starts it, then hands the build to it the way
  it does to any running server, refusals included. A server that cannot be started fails the
  job at that step, before anything is recorded as being on that build; a port another
  program holds there is not offered a forced install, and a server that was started but
  still does not answer fails at the same step.
- "Use" asks the machine what it carries instead of reading the install record: the
  installer's own probe answers, once per use, and copies nothing when the machine is already
  on that build. "Already on" is said on that answer alone.
