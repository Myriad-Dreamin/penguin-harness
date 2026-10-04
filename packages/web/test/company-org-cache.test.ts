/**
 * The organization list drawn from the list cache (features/company/org-list-cache.ts): an
 * organization page opened by URL knows which machine to ask before the server's list answers,
 * and only that answer decides that an organization is gone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationSummary } from "@prismshadow/penguin-server/api";
import { memoryStorage, stubLocalStorage } from "./helpers/storage";

const listOrganizations = vi.fn();
vi.mock("../src/api/endpoints", () => ({
  listOrganizations: (...args: unknown[]) => listOrganizations(...args),
}));

const { createCompanyStore } = await import("../src/features/company/company-state");
const { forgetOrgMachines, machineForOrg } = await import("../src/lib/org-machines");
const { readOrganizationCache, writeOrganizationCache } = await import("../src/lib/list-cache");
const { setSafeMode } = await import("../src/rescue/safe-mode");

const org = (orgId: string, machineId: string | null = null): OrganizationSummary =>
  ({
    projectId: "p1",
    orgId,
    name: orgId,
    mission: "",
    status: "active",
    machineId,
  }) as OrganizationSummary;
const orgIds = () => readOrganizationCache("u")?.map((o) => o.orgId) ?? null;

beforeEach(() => {
  stubLocalStorage(memoryStorage({ "penguin.installId": "root" }));
});
afterEach(() => {
  forgetOrgMachines();
  listOrganizations.mockReset();
  setSafeMode(false);
});

describe("the organization list from the cache", () => {
  it("is drawn at once with each organization's machine, and is not the server's answer", () => {
    writeOrganizationCache("u", [org("acme"), org("lab", "m-a")]);
    const store = createCompanyStore({ serverEnabled: true, cacheUser: "u" });
    expect(store.getState().organizations.map((o) => o.orgId)).toEqual(["acme", "lab"]);
    expect(machineForOrg("p1", "lab")).toBe("m-a");
    expect(store.getState().orgsLoaded).toBe(false);
  });

  it("never decides that an organization is gone", () => {
    writeOrganizationCache("u", [org("acme")]);
    const store = createCompanyStore({ serverEnabled: true, cacheUser: "u" });
    store.setState({ currentOrgKey: "p1/deleted-or-new" });
    store.getState().forgetMissingOrganizations();
    expect(store.getState().currentOrgKey).toBe("p1/deleted-or-new");
  });

  it("the server's complete answer replaces it and is written back; a partial one is not", async () => {
    writeOrganizationCache("u", [org("deleted"), org("acme")]);
    const store = createCompanyStore({ serverEnabled: true, cacheUser: "u" });
    listOrganizations.mockResolvedValue({ organizations: [org("acme", "m-b")] });
    await store.getState().reloadOrganizations(["p1"], true);
    expect(store.getState().organizations.map((o) => o.orgId)).toEqual(["acme"]);
    expect(orgIds()).toEqual(["deleted", "acme"]);
    await store.getState().reloadOrganizations(["p1"]);
    expect(store.getState().orgsLoaded).toBe(true);
    expect(machineForOrg("p1", "acme")).toBe("m-b");
    expect(orgIds()).toEqual(["acme"]);
  });

  it("is not drawn with company mode off, in safe mode, or without a user", () => {
    writeOrganizationCache("u", [org("acme")]);
    expect(
      createCompanyStore({ serverEnabled: false, cacheUser: "u" }).getState().organizations,
    ).toEqual([]);
    expect(createCompanyStore({ serverEnabled: true }).getState().organizations).toEqual([]);
    setSafeMode(true);
    expect(
      createCompanyStore({ serverEnabled: true, cacheUser: "u" }).getState().organizations,
    ).toEqual([]);
  });
});
