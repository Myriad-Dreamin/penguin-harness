/**
 * An organization belongs to the Project, so the company store lists from this server alone.
 * One whose shared workspace is on a machine runs there and says so; that is remembered, so
 * the forty organization-scoped calls route there without naming it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrganizationSummary } from "@prismshadow/penguin-server/api";

const listOrganizations = vi.fn();
const getMachines = vi.fn();
vi.mock("../src/api/endpoints", () => ({
  listOrganizations: (...args: unknown[]) => listOrganizations(...args),
  getMachines: (...args: unknown[]) => getMachines(...args),
}));

const { ApiError } = await import("../src/api/client");
const { createCompanyStore } = await import("../src/features/company/company-state");
const { forgetOrgMachines, machineForOrg } = await import("../src/lib/org-machines");

const org = (orgId: string, over: Partial<OrganizationSummary> = {}): OrganizationSummary =>
  ({
    projectId: "p1",
    orgId,
    name: orgId,
    mission: "",
    status: "active",
    ...over,
  }) as OrganizationSummary;

afterEach(() => {
  forgetOrgMachines();
  listOrganizations.mockReset();
  getMachines.mockReset();
});

describe("the organization listing", () => {
  it("is ONE list, from this server, and remembers where each organization runs", async () => {
    // An organization belongs to the Project; one whose workspace is on a machine runs there
    // and says so. No machine is asked for a listing of its own.
    listOrganizations.mockResolvedValue({
      organizations: [org("acme"), org("lab", { machineId: "m-a" })],
    });
    const store = createCompanyStore();
    await store.getState().reloadOrganizations(["p1"]);

    expect(listOrganizations.mock.calls).toEqual([["p1"]]);
    expect(getMachines).not.toHaveBeenCalled();
    const { organizations, orgsPartial } = store.getState();
    expect(organizations.map((o) => [o.orgId, o.machineId ?? null])).toEqual([
      ["acme", null],
      ["lab", "m-a"],
    ]);
    expect(orgsPartial).toBe(false);
    expect(machineForOrg("p1", "acme")).toBeNull();
    expect(machineForOrg("p1", "lab")).toBe("m-a");
  });

  it("records a Project that could not be asked as a partial listing", async () => {
    listOrganizations.mockImplementation(async (projectId: string) => {
      if (projectId === "p2") throw new ApiError(500, "boom", "boom");
      return { organizations: [org("acme")] };
    });
    const store = createCompanyStore();
    await store.getState().reloadOrganizations(["p1", "p2"]);
    expect(store.getState().organizations.map((o) => o.orgId)).toEqual(["acme"]);
    expect(store.getState().orgsPartial).toBe(true);
  });

  it("reads the routed Project alone as a partial list, and lets the later full read win", async () => {
    // An organization page opened by URL reads its Project's list before the Project list is
    // in; that early answer must never replace the full one if it lands after it.
    let answerEarly: (v: unknown) => void = () => undefined;
    listOrganizations
      .mockImplementationOnce(() => new Promise((resolve) => (answerEarly = resolve)))
      .mockImplementation(async (projectId: string) => ({
        organizations: [projectId === "p1" ? org("acme") : org("lab", { projectId })],
      }));
    const store = createCompanyStore();
    const early = store.getState().reloadOrganizations(["p1"], true);
    await store.getState().reloadOrganizations(["p1", "p2"]);
    answerEarly({ organizations: [org("acme")] });
    await early;
    expect(store.getState().organizations.map((o) => o.orgId)).toEqual(["acme", "lab"]);
    expect(store.getState().orgsPartial).toBe(false);
    expect(store.getState().orgsLoading).toBe(false);
  });

  it("marks the routed Project's early list partial, so nothing is forgotten from it", async () => {
    listOrganizations.mockResolvedValue({ organizations: [org("acme")] });
    const store = createCompanyStore();
    await store.getState().reloadOrganizations(["p1"], true);
    expect(store.getState().orgsLoaded).toBe(true);
    expect(store.getState().orgsPartial).toBe(true);
  });
});
