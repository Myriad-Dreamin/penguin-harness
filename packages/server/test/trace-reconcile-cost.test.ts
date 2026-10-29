/**
 * Trace reconcile cost (proposal: the shared Trace reconcile no longer re-scans on every
 * write): read paths — the Agents list (sessionStats), the Session list's hydration pass
 * (discoverTraces), the single-Session GET (hasTrace / latestTracePath) and the messages
 * read (locateAll) — serve from the index and ask for ONE debounced background reconcile
 * instead of blocking on (and re-running) the mtime-gated diff. Under continuous writes
 * the fresh-window sentinel used to force the slow path on every request, scaling list
 * and idle-poll latency with the Agent's session count.
 *
 * Judged by the proposal's three criteria:
 *  1. reconcile's RESULT stays identical under continuous writes and external changes
 *     (add / delete / rename) — index and disk agree;
 *  2. both states hold: quiet = zero extra scans (stats only), fresh/under-write = correct
 *     answer served immediately, converged by the background pass;
 *  3. file stat counts and reconcile (dir-scan) counts DROP while the mtime correctness
 *     guard stays intact — the speed is not bought by deleting the gate.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionMeta, userText } from "@prismshadow/penguin-core";
import { makeTempRoot, makeTraceHarness, writeTraceFile } from "./helpers.js";
import { backgroundReconcile } from "../src/services/trace-index.js";

const P = "project-i";
const A = "agent-i";
const S1 = "session-2026-07-05-10-00-00-aabb0001";
const S2 = "session-2026-07-06-09-00-00-aabb0002";

function tracesRoot(root: string): string {
  return path.join(root, P, "agents", A, "traces");
}

function meta(sessionId: string): ReturnType<typeof sessionMeta> {
  return sessionMeta({
    session_id: sessionId,
    model_id: "m1",
    provider: "custom",
    model_context_window: 1000,
    system_prompt: "sp",
    agent_state: "/tmp/a",
    workspace: "/ws/one",
    source: "user",
  });
}

describe("trace-reconcile-cost", () => {
  let root: string;
  let h: ReturnType<typeof makeTraceHarness>;

  beforeEach(async () => {
    root = await makeTempRoot();
    h = makeTraceHarness(root);
    backgroundReconcile.delayMs = 10; // each test converges explicitly via flushScheduled
  });
  afterEach(async () => {
    backgroundReconcile.delayMs = 2500;
    h.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  /** The index rows the messages read would serve from (shard indexes, ascending). */
  const indexedShards = (sessionId: string): number[] =>
    h.traceIndex.repo
      .listFilesBySession(P, A, sessionId)
      .map((r) => r.fileIndex)
      .sort((a, b) => a - b);

  it("a read under continuous writes costs one gated sample, not a full re-diff per read; the background pass converges", async () => {
    await writeTraceFile(root, P, A, "2026-07-05", S1, 1, [meta(S1), userText("你好")]);
    h.traceIndex.scheduleReconcile(P, A);
    await h.traceIndex.flushScheduled();

    // Continuous writes: fresh shards keep the tree inside the FRESH_MS window.
    for (let i = 2; i <= 4; i++) {
      await writeTraceFile(root, P, A, "2026-07-05", S1, i, [userText(`w${i}`)]);
    }

    // The read takes one gate sample + one diff (the tree HAS moved — the old cost per
    // read under writes, now paid once per change, not per read). The scheduled pass
    // behind it re-samples a quiet tree and diffs nothing.
    const scans = h.traceIndex.counters.dirScans;
    const messages = await h.service.readMessages(P, A, S1);
    await h.traceIndex.flushScheduled();
    expect(messages.length).toBeGreaterThan(0);
    expect(indexedShards(S1)).toEqual([1, 2, 3, 4]);
    // The request diff plus the scheduled pass re-sampling the still-fresh tree (the
    // mtime guard's own contract): bounded at two, not one per read.
    expect(h.traceIndex.counters.dirScans).toBeLessThanOrEqual(scans + 2);

    // A later read after more writes costs one diff for the change (the scheduled pass
    // re-checks the still-fresh tree per the mtime guard and diffs once more — bounded:
    // two diffs per write round, not two per read), still finding all shards.
    await writeTraceFile(root, P, A, "2026-07-05", S1, 5, [userText("w5")]);
    await h.service.readMessages(P, A, S1);
    await h.traceIndex.flushScheduled();
    expect(h.traceIndex.counters.dirScans).toBeLessThanOrEqual(scans + 4);
    expect(indexedShards(S1)).toEqual([1, 2, 3, 4, 5]);
  });

  it("quiet state: repeated reads cost zero directory scans and no re-classification", async () => {
    await writeTraceFile(root, P, A, "2026-07-05", S1, 1, [meta(S1), userText("你好")]);
    h.traceIndex.scheduleReconcile(P, A);
    await h.traceIndex.flushScheduled();
    // Age the tree past FRESH_MS (a tree written minutes ago) so the gate can cache it
    // clean, then take the steady-state baseline.
    const old = new Date("2026-01-01T00:00:00.000Z");
    const dir = tracesRoot(root);
    await fs.utimes(dir, old, old);
    await fs.utimes(path.join(dir, "2026-07-05"), old, old);
    h.traceIndex.scheduleReconcile(P, A);
    await h.traceIndex.flushScheduled();
    const scans = h.traceIndex.counters.dirScans;
    const heads = h.traceIndex.counters.headReads;

    await h.service.readMessages(P, A, S1);
    await h.service.readMessages(P, A, S1);
    await h.traceIndex.flushScheduled();
    expect(h.traceIndex.counters.dirScans).toBe(scans);
    expect(h.traceIndex.counters.headReads).toBe(heads); // no re-classification either
  });

  it("external changes (add / delete / rename) converge to the disk truth through the scheduled pass", async () => {
    await writeTraceFile(root, P, A, "2026-07-05", S1, 1, [meta(S1), userText("你好")]);
    h.traceIndex.scheduleReconcile(P, A);
    await h.traceIndex.flushScheduled();

    // External add (a new session), delete (S1's only shard), rename (new file identity).
    await writeTraceFile(root, P, A, "2026-07-06", S2, 1, [meta(S2), userText("另一个")]);
    await fs.rm(path.join(tracesRoot(root), "2026-07-05", `${S1}_001.jsonl`));
    await fs.rename(
      path.join(tracesRoot(root), "2026-07-06", `${S2}_001.jsonl`),
      path.join(tracesRoot(root), "2026-07-06", `${S2}_002.jsonl`),
    );

    // The read on the deleted session misses whole → the consumers' synchronous forced
    // retry runs (one extra scan, never a false 404) and observes the deletion; the
    // scheduled pass converges the rename and the add.
    expect(await h.service.readMessages(P, A, S1)).toEqual([]); // no false 404, retry ran
    await h.traceIndex.flushScheduled();
    expect(indexedShards(S1)).toEqual([]); // deleted externally → gone from the index
    expect(indexedShards(S2)).toEqual([2]); // rename observed
  });

  it("the mtime correctness guard stays: a backdated write is gate-missed, the forced retry finds it", async () => {
    await writeTraceFile(root, P, A, "2026-07-05", S1, 1, [meta(S1), userText("你好")]);
    // Age the tree first, then take the baseline pass: the gate caches REAL mtimes
    // (a tree written minutes ago), exactly the steady state the blind spot lives in.
    const old = new Date("2026-01-01T00:00:00.000Z");
    const base = tracesRoot(root);
    const dateDir = path.join(base, "2026-07-05");
    await fs.utimes(base, old, old);
    await fs.utimes(dateDir, old, old);
    h.traceIndex.scheduleReconcile(P, A);
    await h.traceIndex.flushScheduled();
    expect(indexedShards(S1)).toEqual([1]);

    // External write backdated so the date dir's mtime equals the cached one exactly —
    // the documented gate blind spot. The scheduled pass runs with the gate intact and
    // legitimately misses it; the consumers' forced retry (the whole-session miss path)
    // is what recovers it: correctness is preserved, not traded away for speed.
    await writeTraceFile(root, P, A, "2026-07-05", S1, 2, [userText("补写")]);
    await fs.utimes(dateDir, old, old);
    h.traceIndex.scheduleReconcile(P, A);
    await h.traceIndex.flushScheduled();
    expect(indexedShards(S1)).toEqual([1]); // gate-missed: index unchanged
    await h.traceIndex.reconcileAgent(P, A, { force: true });
    expect(indexedShards(S1)).toEqual([1, 2]); // the forced diff finds the backdated shard
  });

  it("fresh window under continuous writes: the scheduled pass settles after the tree goes quiet (stat counts stay bounded)", async () => {
    await writeTraceFile(root, P, A, "2026-07-05", S1, 1, [meta(S1), userText("你好")]);
    h.traceIndex.scheduleReconcile(P, A);
    await h.traceIndex.flushScheduled();

    // A write burst keeps the tree fresh: every gate sample reads the -1 sentinel and
    // re-diffs — the shared cost the proposal removes from read paths. The reads here
    // schedule at most one pass per debounce window; the gate stats the root plus each
    // date dir per pass, and no read waits on any of it.
    const statsBefore = h.traceIndex.counters.gateStats;
    for (let i = 2; i <= 5; i++) {
      await writeTraceFile(root, P, A, "2026-07-05", S1, i, [userText(`w${i}`)]);
      await h.service.readMessages(P, A, S1); // idle-poll shape: read while writes continue
      await h.traceIndex.flushScheduled();
    }
    const passes = 4;
    // Each pass costs at most root + newest + rest = 2 + (shards-1) stats; 4 passes stay
    // far below one-stat-per-read-per-shard (what the old path cost: read × shards × 2).
    expect(h.traceIndex.counters.gateStats - statsBefore).toBeLessThan(passes * 12);
    expect(indexedShards(S1)).toEqual([1, 2, 3, 4, 5]); // and the result is still exact
  });
});
