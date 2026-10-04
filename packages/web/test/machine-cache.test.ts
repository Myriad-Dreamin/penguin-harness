/**
 * What Agents each machine was last seen running (lib/machine-cache.ts), kept in localStorage
 * so a restart can offer a machine's Agents before it answers.
 *
 * - A machine's answer replaces only its own entry, per Project and machine.
 * - An empty answer clears the entry, so something removed over there stops coming back.
 * - At most the placeholder's worth of rows is kept.
 * - Junk in storage reads as nothing remembered, and rows without an id are dropped.
 * - A storage that refuses is not an error: the answer is merely not remembered.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentSummary } from "@prismshadow/penguin-server/api";
import {
  CACHED_ROWS_PER_MACHINE,
  cachedMachineAgents,
  rememberMachineAgents,
} from "../src/lib/machine-cache";
import { blockedStorage, stubLocalStorage } from "./helpers/storage";

const agent = (agentId: string): AgentSummary => ({ agentId, name: agentId }) as AgentSummary;
const ids = (agents: AgentSummary[]) => agents.map((a) => a.agentId);

describe("machine cache", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("remembers per (project, machine), and a machine's answer replaces only its own entry", () => {
    rememberMachineAgents("p", "M1", [agent("a"), agent("b")]);
    rememberMachineAgents("p", "M2", [agent("c")]);
    rememberMachineAgents("p", "M1", [agent("a")]);
    expect(ids(cachedMachineAgents("p", "M1"))).toEqual(["a"]);
    expect(ids(cachedMachineAgents("p", "M2"))).toEqual(["c"]);
    expect(cachedMachineAgents("other", "M1")).toEqual([]);
  });

  it("an empty answer clears the entry — something removed over there stops coming back", () => {
    rememberMachineAgents("p", "M1", [agent("a")]);
    rememberMachineAgents("p", "M1", []);
    expect(cachedMachineAgents("p", "M1")).toEqual([]);
  });

  it("keeps at most the placeholder's worth of rows", () => {
    rememberMachineAgents(
      "p",
      "M1",
      Array.from({ length: CACHED_ROWS_PER_MACHINE + 5 }, (_, i) => agent(`a${i}`)),
    );
    expect(cachedMachineAgents("p", "M1")).toHaveLength(CACHED_ROWS_PER_MACHINE);
  });

  it("junk in storage reads as nothing remembered, and rows without an id are dropped", () => {
    localStorage.setItem("penguin.machineAgents.p:M1", "not json");
    expect(cachedMachineAgents("p", "M1")).toEqual([]);
    localStorage.setItem(
      "penguin.machineAgents.p:M1",
      JSON.stringify([{ name: "x" }, { agentId: "a" }]),
    );
    expect(ids(cachedMachineAgents("p", "M1"))).toEqual(["a"]);
  });

  it("storage that refuses is not an error — the answer is merely not remembered", () => {
    stubLocalStorage(blockedStorage());
    expect(() => rememberMachineAgents("p", "M1", [agent("a")])).not.toThrow();
    expect(cachedMachineAgents("p", "M1")).toEqual([]);
  });
});
