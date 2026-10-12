/** Writer completion across real App reassembly; no LLM or Trace-file race is simulated. */
import { afterEach, describe, expect, it } from "vitest";
import { assistantText, userText } from "@prismshadow/penguin-core";
import type { OmniMessage } from "@prismshadow/penguin-core";
import type { SessionRow } from "../src/db/repos/sessions.js";
import type { Reassembly } from "../src/hmr/capabilities.js";
import type { RuntimeSession, SessionManager } from "../src/runtime/session-manager.js";
import { createTestApp, waitFor } from "./helpers.js";
import type { TestApp } from "./helpers.js";

const SID = "session-2026-09-21-10-00-00-aabb0099";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

function row(root: string): SessionRow {
  const at = new Date().toISOString();
  return {
    sessionId: SID,
    projectId: "default_project",
    agentId: "default_agent",
    provider: "custom",
    modelId: "m1",
    workspace: root,
    approvalMode: "allow-all",
    title: null,
    createdAt: at,
    lastActiveAt: at,
  };
}

function controlledSession(
  release: Promise<void>,
  events: string[],
  inputs: OmniMessage[][],
  failedCleanup?: Promise<void>,
): RuntimeSession {
  let calls = 0;
  return {
    sessionId: SID,
    toolPermission: () => "rw",
    generateTitle: async () => ({ title: null, usage: null }),
    compactability: () => "ok" as const,
    steer: () => false,
    skipReconnectWait: () => false,
    async *run(input, opts) {
      const call = ++calls;
      inputs.push(input);
      events.push(`start:${call}`);
      opts.signal.addEventListener("abort", () => events.push(`abort:${call}`), { once: true });
      try {
        // Abort requests cancellation; it deliberately does not release this writer.
        if (call === 1) await release;
        events.push(`write:${call}`);
        yield assistantText(`writer ${call}`);
        if (call === 1 && failedCleanup) {
          events.push("failed:1");
          throw new Error("controlled writer failure");
        }
      } finally {
        if (call === 1 && failedCleanup) {
          events.push("cleanup:1");
          await failedCleanup;
        }
        events.push(`end:${call}`);
      }
    },
    async *compact() {},
    dispose: () => events.push("dispose"),
  };
}

const textOf = (input: OmniMessage[]): string =>
  input.map((m) => (m.payload as { text?: string }).text ?? "").join("\n");

const currentManager = (t: TestApp): SessionManager =>
  t.boot.tree.api<SessionManager>("SessionRuntimeModule", "Sessions");

const reassemble = (t: TestApp): Promise<boolean> =>
  t.boot.tree.api<Reassembly>("RuntimeModule", "Reassembly").reassemble();

describe("Agent state writer completion", () => {
  let t: TestApp | undefined;
  const releases: Array<() => void> = [];
  const swaps: Promise<boolean>[] = [];
  afterEach(async () => {
    for (const release of releases.splice(0)) release();
    await Promise.allSettled(swaps.splice(0));
    if (t) {
      await currentManager(t).shutdown(Infinity);
      await t.cleanup();
      t = undefined;
    }
  });

  for (const exceedsBudget of [false, true]) {
    it(
      `waits for an incompatible writer ${exceedsBudget ? "past the drain budget" : "that finishes promptly"}`,
      async () => {
        const release = deferred();
        releases.push(release.resolve);
        const events: string[] = [];
        const inputs: OmniMessage[][] = [];
        const session = controlledSession(release.promise, events, inputs);
        t = await createTestApp({ loader: { load: async () => session } });
        t.deps.sessionsRepo.insert(row(t.root));
        await t.deps.manager.startTask(SID, [userText("first")]);
        await waitFor(() => events.includes("start:1"));
        const envelope = t.deps.hmr.resources.claim<{
          shape: string | null;
          stopped?: Promise<void>;
        }>("agent:state")!;
        envelope.shape = "incompatible fixture";
        const swap = reassemble(t);
        swaps.push(swap);
        let swapped = false;
        void swap.then(() => (swapped = true));
        await waitFor(() => events.includes("abort:1"), 10_000);
        let stopped = false;
        void envelope.stopped!.then(() => (stopped = true));
        if (exceedsBudget) {
          // Real boot I/O must run before timing the drain; fake timers starve that setup.
          await new Promise<void>((done) => setTimeout(done, 5_100));
        }
        const beforeRelease = [...events];
        expect(stopped).toBe(false);
        expect(swapped).toBe(false);
        expect(beforeRelease).not.toContain("start:2");
        expect(beforeRelease).not.toContain("end:1");
        expect(beforeRelease).not.toContain("dispose");
        release.resolve();
        expect(await swap).toBe(true);
        await waitFor(() => events.includes("end:2"));
        await waitFor(() => currentManager(t!).statusOf(SID) === "idle");
        console.info("writer handover", { exceedsBudget, beforeRelease, events });
        expect(events).toEqual([
          "start:1",
          "abort:1",
          "write:1",
          "end:1",
          "dispose",
          "start:2",
          "write:2",
          "end:2",
        ]);
        expect(textOf(inputs[1]!)).toContain("[harness_updated]");
        expect(inputs).toHaveLength(2);
      },
      20_000,
    );
  }

  it("starts a queued follow-up exactly once after an aborted writer's failed cleanup", async () => {
    const release = deferred();
    const cleanup = deferred();
    releases.push(release.resolve, cleanup.resolve);
    const events: string[] = [];
    const inputs: OmniMessage[][] = [];
    const session = controlledSession(release.promise, events, inputs, cleanup.promise);
    t = await createTestApp();
    t.deps.sessionsRepo.insert(row(t.root));
    const before = currentManager(t);
    before.adopt(row(t.root), session);
    await before.startTask(SID, [userText("first")]);
    await waitFor(() => events.includes("start:1"));
    expect((await before.startTask(SID, [userText("queued")], { queueIfBusy: true })).queued).toBe(
      true,
    );
    const swap = reassemble(t);
    swaps.push(swap);
    expect(await swap).toBe(true);
    const after = currentManager(t);
    expect(after).not.toBe(before);
    expect(after.pendingFollowUpCount(SID)).toBe(1);
    expect(after.abortTask(SID)).toBe(true);
    expect(events).not.toContain("start:2");
    release.resolve();
    await waitFor(() => events.includes("cleanup:1"));
    expect(events).not.toContain("end:1");
    expect(events).not.toContain("start:2");
    expect(after.statusOf(SID)).toBe("running");
    expect(after.pendingFollowUpCount(SID)).toBe(1);
    cleanup.resolve();
    await waitFor(() => events.includes("end:2"));
    await waitFor(() => after.statusOf(SID) === "idle");
    console.info("writer failed cleanup", { events });
    expect(events).toEqual([
      "start:1",
      "abort:1",
      "write:1",
      "failed:1",
      "cleanup:1",
      "end:1",
      "start:2",
      "write:2",
      "end:2",
    ]);
    expect(inputs).toHaveLength(2);
    expect(textOf(inputs[1]!)).toBe("queued");
    expect(after.pendingFollowUpCount(SID)).toBe(0);
  });
});
