import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { OrgStore } from "../src/organization/store.js";
import { serializeTicket, type TicketDoc } from "../src/organization/files.js";

let root: string;
let org: string;
let store: OrgStore;

const ticket = (title: string, status: string): TicketDoc =>
  ({
    title,
    status,
    owner: "agent:alice",
    notify: [],
    priority: "P2",
    sessions: [],
    history: [],
    goal: "g",
    acceptanceCriteria: "a",
    progress: [],
    result: "",
    extra: {},
    extraSections: [],
  }) as unknown as TicketDoc;

const write = async (month: string, column: string, id: string, title: string, status = column) => {
  const p = path.join(org, "tickets", month, column, `${id}.md`);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, serializeTicket(ticket(title, status)));
  return p;
};

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "org-ticket-cache-"));
  org = path.join(root, "orgs", "proj", "org");
  await fs.mkdir(org, { recursive: true });
  store = new OrgStore(root);
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("listTickets mtime cache", () => {
  test("a second listing of unchanged files skips the read and parse and returns the same documents", async () => {
    await write("2026-10", "in_progress", "2026-10-01-alpha", "Alpha");
    const first = await store.listTickets(org);
    expect(first).toHaveLength(1);
    expect(first[0]!.parsed.ok).toBe(true);
    const second = await store.listTickets(org);
    // Same content, and the second pass served it from cache: no re-read means the raw
    // string is the very same object, not a fresh buffer from disk.
    expect(second).toHaveLength(1);
    expect(second[0]!.raw).toBe(first[0]!.raw);
    expect(second[0]!.parsed).toBe(first[0]!.parsed);
    if (!second[0]!.parsed.ok) throw new Error("parse failed");
    expect(second[0]!.parsed.value.title).toBe("Alpha");
  });

  test("a hand edit invalidates the cache and the next listing reads the new content", async () => {
    const p = await write("2026-10", "in_progress", "2026-10-01-alpha", "Alpha");
    await store.listTickets(org);
    await new Promise((r) => setTimeout(r, 5));
    await fs.writeFile(p, serializeTicket(ticket("Edited", "in_progress")));
    const next = await store.listTickets(org);
    expect(next[0]!.parsed.ok).toBe(true);
    if (!next[0]!.parsed.ok) throw new Error("parse failed");
    expect(next[0]!.parsed.value.title).toBe("Edited");
  });

  test("a replaced file (same id, new bytes) is re-parsed, not served stale", async () => {
    const p = await write("2026-10", "in_progress", "2026-10-01-alpha", "Alpha");
    await store.listTickets(org);
    await fs.unlink(p);
    await write("2026-10", "in_progress", "2026-10-01-alpha", "Replaced");
    const next = await store.listTickets(org);
    if (!next[0]!.parsed.ok) throw new Error("parse failed");
    expect(next[0]!.parsed.value.title).toBe("Replaced");
  });

  test("a deleted ticket disappears from the next listing", async () => {
    const p = await write("2026-10", "in_progress", "2026-10-01-alpha", "Alpha");
    expect(await store.listTickets(org)).toHaveLength(1);
    await fs.unlink(p);
    expect(await store.listTickets(org)).toHaveLength(0);
  });

  test("a new file appears in the next listing", async () => {
    await write("2026-10", "in_progress", "2026-10-01-alpha", "Alpha");
    expect(await store.listTickets(org)).toHaveLength(1);
    await write("2026-10", "review", "2026-10-02-beta", "Beta");
    const next = await store.listTickets(org);
    expect(next.map((t) => t.ticketId)).toEqual(["2026-10-01-alpha", "2026-10-02-beta"]);
  });

  test("a moved ticket (column change) is listed once in the new column", async () => {
    await write("2026-10", "in_progress", "2026-10-01-alpha", "Alpha", "review");
    expect(await store.listTickets(org)).toHaveLength(1);
    // The move: write the new column file, remove the old one.
    const dest = await write("2026-10", "review", "2026-10-01-alpha", "Alpha", "review");
    await fs.unlink(path.join(org, "tickets", "2026-10", "in_progress", "2026-10-01-alpha.md"));
    expect(dest).toBeTruthy();
    const next = await store.listTickets(org);
    expect(next).toHaveLength(1);
    expect(next[0]!.column).toBe("review");
  });

  test("listing after a write through the store reflects the write without staleness", async () => {
    await write("2026-10", "in_progress", "2026-10-01-alpha", "Alpha");
    await store.listTickets(org);
    await store.writeTicket(
      org,
      "2026-10-01-alpha",
      "in_progress",
      ticket("Rewritten", "in_progress"),
    );
    const next = await store.listTickets(org);
    if (!next[0]!.parsed.ok) throw new Error("parse failed");
    expect(next[0]!.parsed.value.title).toBe("Rewritten");
  });
});
