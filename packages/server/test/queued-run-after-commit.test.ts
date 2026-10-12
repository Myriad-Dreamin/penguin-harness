import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantText } from "@prismshadow/penguin-core";
import type { OmniMessage } from "@prismshadow/penguin-core";
import { parseManifest } from "@prismshadow/penguin-core/kernel";
import type { Reassembly } from "../src/hmr/capabilities.js";
import { PluginHost } from "../src/plugin/host.js";
import type { RuntimeSession, SessionManager } from "../src/runtime/session-manager.js";
import type { SessionRow } from "../src/db/repos/sessions.js";
import { createTestApp, waitFor } from "./helpers.js";
import type { TestApp } from "./helpers.js";

const SID = "session-2026-09-21-10-00-00-aabb0099";
const row = (tRoot: string): SessionRow => ({
  sessionId: SID,
  projectId: "default_project",
  agentId: "default_agent",
  provider: "custom",
  modelId: "m1",
  workspace: tRoot,
  approvalMode: "allow-all",
  title: null,
  createdAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

function controlledSession(
  first: Promise<void>,
  events: string[],
  onQueuedStart: () => Promise<void>,
): RuntimeSession {
  let calls = 0;
  return {
    sessionId: SID,
    toolPermission: () => "rw",
    generateTitle: async () => ({ title: null, usage: null }),
    compactability: () => "ok" as const,
    steer: () => false,
    skipReconnectWait: () => false,
    async *run(input: OmniMessage[], opts) {
      const call = ++calls;
      events.push(`run:entered:${call}`);
      if (call > 1) await onQueuedStart();
      events.push(`start:${call}`);
      opts.signal.addEventListener("abort", () => events.push(`abort:${call}`), { once: true });
      // Abort is deliberately cooperative, not completion: only the fixture releases run 1.
      if (call === 1) await first;
      events.push(`write:${call}:${input.length}`);
      yield assistantText("done");
      events.push(`end:${call}`);
    },
    async *compact() {},
    dispose: () => events.push("dispose"),
  };
}

async function currentManager(t: TestApp): Promise<SessionManager> {
  const instance = await t.deps.hmr.ensure();
  return instance.api.business()!.api<SessionManager>("SessionRuntimeModule", "Sessions");
}

const reassemble = (t: TestApp) =>
  t.boot.tree.api<Reassembly>("RuntimeModule", "Reassembly").reassemble();

// These are safety assertions, not expected failures. A green run falsifies the corresponding
// suspected path under this controlled fixture; record the actual order before interpreting it.
describe("queued work starts only in the serving generation", () => {
  let t: TestApp | undefined;
  const releaseAll: Array<() => void> = [];
  afterEach(async () => {
    for (const release of releaseAll.splice(0)) release();
    vi.useRealTimers();
    await t?.cleanup();
    t = undefined;
    vi.restoreAllMocks();
  });

  for (const fails of [false, true]) {
    it(`does not start queued work in a ${fails ? "failed" : "delayed"} uncommitted boot`, async () => {
      const first = deferred();
      const bootGate = deferred();
      const bootEntered = deferred();
      releaseAll.push(first.resolve, bootGate.resolve);
      const events: string[] = [];
      let candidate: SessionManager | undefined;
      let boots = 0;
      const plugins = new PluginHost();
      plugins.use({
        specifier: "@fixture/late-boot",
        modules: [{
          manifest: parseManifest({
            name: "LifecycleLateBoot",
            requires: { sessions: { iface: "@prismshadow/penguin-server#Sessions", from: "SessionRuntimeModule" } },
            provides: {},
            contributes: {},
            children: [],
          }),
          async create(ctx) {
            const boot = ++boots;
            if (boot === 2) {
              candidate = ctx.use.sessions as SessionManager;
              events.push("boot:entered");
              bootEntered.resolve();
              await bootGate.promise;
              if (fails) {
                events.push("boot:failed");
                throw new Error("controlled late boot failure");
              }
            }
            events.push(`boot:complete:${boot}`);
            return { api: {} };
          },
        }],
        replaces: [],
      });
      t = await createTestApp({ plugins, config: { port: 58200 } });
      const before = t.deps.manager;
      const servingAtStart: SessionManager[] = [];
      const marker = path.join(t.root, "queued-run-side-effect.txt");
      const session = controlledSession(first.promise, events, async () => {
        // Read the actual serving tree, not the late module's boot-complete marker.
        servingAtStart.push(
          t!.boot.tree.api<SessionManager>("SessionRuntimeModule", "Sessions"),
        );
        events.push("queued:serving-observed");
        await fs.appendFile(marker, "queued side effect\n");
        events.push("queued:side-effect");
      });
      t.deps.sessionsRepo.insert(row(t.root));
      before.adopt(row(t.root), session);
      await before.startTask(SID, [assistantText("first")]);
      await waitFor(() => events.includes("start:1"));
      expect((await before.startTask(SID, [assistantText("queued")], { queueIfBusy: true })).queued).toBe(true);
      const swap = reassemble(t);
      await bootEntered.promise;
      expect(candidate).toBeDefined();
      const queued = candidate as unknown as {
        startQueuedFollowUp(sessionId: string): Promise<void>;
      };
      const starts = vi.spyOn(queued, "startQueuedFollowUp");
      first.resolve();
      await waitFor(() => events.includes("end:1"));
      // Let the real drive continuation and queued start microtasks settle, without releasing boot.
      await new Promise((done) => setTimeout(done, 25));
      const beforeCommit = {
        candidateStarts: starts.mock.calls.length,
        events: [...events],
        sideEffect: await fs.readFile(marker, "utf8").catch((err: NodeJS.ErrnoException) => {
          if (err.code === "ENOENT") return "";
          throw err;
        }),
      };
      console.info("lifecycle before commit", { fails, beforeCommit });
      bootGate.resolve();
      const result = await swap;
      await waitFor(() => events.includes("end:2"));
      const after = await currentManager(t);
      console.info("lifecycle boot observation", { fails, result, beforeCommit, events });
      expect(beforeCommit.candidateStarts).toBe(0);
      expect(beforeCommit.events.filter((e) => e === "start:2")).toHaveLength(0);
      expect(beforeCommit.events).not.toContain("run:entered:2");
      expect(beforeCommit.sideEffect).toBe("");
      expect(beforeCommit.events).not.toContain("queued:side-effect");
      expect(result).toBe(!fails);
      expect(after).not.toBe(before);
      expect(servingAtStart).toEqual([after]);
      if (fails) expect(servingAtStart).not.toContain(candidate);
      expect(await fs.readFile(marker, "utf8")).toBe("queued side effect\n");
      expect(events.filter((e) => e === "start:2")).toHaveLength(1);
    }, 20_000);
  }
});
