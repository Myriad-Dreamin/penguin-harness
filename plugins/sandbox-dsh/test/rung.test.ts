/**
 * The rung the settings card names for the DSH adaptor, the limits each rung discloses,
 * and the pure half of the Landlock extension: the dimensions a rung declares, the grants
 * it splices in, and the corner the allow-list cannot express.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  assertLandlockCanExpress,
  declaredDimensions,
  grantableWritableRoots,
  rungLimits,
  rungName,
  spliceLandlockGrants,
} from "../src/index.js";
import type { GrantArgs } from "../src/index.js";

describe("the DSH rung", () => {
  it.each([
    ["linux", "bwrap", "bubblewrap"],
    ["linux", "/opt/penguin/node_modules/.bin/landlock-run", "Landlock"],
    ["darwin", "sandbox-exec", "Seatbelt"],
    ["win32", "C:\\node.exe", "the Windows ACL runner"],
  ] as const)("on %s, %s is %s", (platform, program, name) => {
    expect(rungName(platform, program)).toBe(name);
  });

  it("names the scratchpad on the non-Landlock rungs, Landlock's shared /tmp, and a partial Landlock's ABI gaps", () => {
    expect(rungLimits("bubblewrap", "full").map((l) => l.text)).toEqual([
      expect.stringContaining("Session scratchpad is not writable"),
    ]);
    // Landlock splices the writable roots in, so its scratchpad limitation is gone; what
    // stays is the shared /tmp — still the first line — and the partial-ABI disclosure.
    const [tmp, ...rest] = rungLimits("Landlock", "full");
    const partial = rungLimits("Landlock", "partial")[1];
    expect(rest).toEqual([]);
    expect(tmp!.text).toContain("the host's shared /tmp");
    expect(tmp!.textZh).toContain("宿主共享的 /tmp");
    expect(partial!.text).toMatch(/older than 5 .*ioctl.*below ABI 3 .*truncating/);
  });
});

describe("the dimensions a rung declares", () => {
  it("readonly-roots rides only on the Landlock rung", () => {
    expect(declaredDimensions("Landlock")).toEqual(["fs-write", "readonly-roots"]);
    expect(declaredDimensions("bubblewrap")).toEqual(["fs-write"]);
    expect(declaredDimensions("Seatbelt")).toEqual(["fs-write"]);
    expect(declaredDimensions("the Windows ACL runner")).toEqual(["fs-write"]);
  });
});

describe("the writable roots the Landlock rung splices in", () => {
  // Resolved in the expectations as in the implementation, so the literals hold on every
  // platform the package tests on (win32 path resolution prefixes a drive).
  it("workspace-write: the policy's further roots plus the real temp, minus what the chain grants", () => {
    expect(
      grantableWritableRoots(
        {
          mode: "workspace-write",
          workspaceRoot: "/work/project",
          writableRoots: ["/data/agent/scratchpad/s", "/data/agent/scratchpad/s"],
          writableTemp: true,
        },
        "/tmp",
      ),
    ).toEqual([path.resolve("/data/agent/scratchpad/s")]);
    // A TMPDIR elsewhere must not lose its temp; the literal /tmp the chain already grants.
    expect(
      grantableWritableRoots(
        {
          mode: "workspace-write",
          workspaceRoot: "/work/project",
          writableRoots: [],
          writableTemp: true,
        },
        "/home/deploy/tmp-verify",
      ),
    ).toEqual([path.resolve("/home/deploy/tmp-verify")]);
    // Temp turned off adds nothing; the workspace itself is already granted.
    expect(
      grantableWritableRoots(
        {
          mode: "workspace-write",
          workspaceRoot: "/work/project",
          writableRoots: ["/work/project", "/work/project/deeper"],
          writableTemp: false,
        },
        "/tmp",
      ),
    ).toEqual([path.resolve("/work/project/deeper")]);
  });

  it("read-only keeps the chain's own profile: nothing to splice", () => {
    expect(
      grantableWritableRoots(
        {
          mode: "read-only",
          workspaceRoot: "/work/project",
          writableRoots: ["/data/s"],
          writableTemp: true,
        },
        "/tmp",
      ),
    ).toEqual([]);
  });
});

describe("splicing further grants into a Landlock wrapper", () => {
  /** A fake with the real one's shape: read-only first, then read-write, flag before path. */
  const fakeGrantArgs: GrantArgs = (grants) => [
    ...(grants.readOnly ?? []).map((root) => ["--ro", root]).flat(),
    ...(grants.readWrite ?? []).map((root) => ["--rw", root]).flat(),
  ];
  const wrapped = [
    "/bin/landlock-run",
    "--ro",
    "/",
    "--rw",
    "/dev/null",
    "--rw",
    "/tmp",
    "--rw",
    "/work/project",
    "--",
    "bash",
    "-lc",
    "echo hi",
  ];
  const callerArgv = ["bash", "-lc", "echo hi"];

  it("adds the extra roots in front of the separator, command untouched behind it", () => {
    expect(
      spliceLandlockGrants(wrapped, callerArgv, ["/data/agent/scratchpad/s"], fakeGrantArgs),
    ).toEqual([
      "/bin/landlock-run",
      "--ro",
      "/",
      "--rw",
      "/dev/null",
      "--rw",
      "/tmp",
      "--rw",
      "/work/project",
      "--rw",
      "/data/agent/scratchpad/s",
      "--",
      "bash",
      "-lc",
      "echo hi",
    ]);
  });

  it("only ever asks for read-write grants: read-only comes from the chain's own profile", () => {
    const seen: unknown[] = [];
    spliceLandlockGrants(wrapped, callerArgv, ["/data/s"], (grants) => {
      seen.push(grants);
      return ["--rw", "/data/s"];
    });
    expect(seen).toEqual([{ readWrite: ["/data/s"] }]);
  });

  it("nothing to add leaves the wrapper byte-identical (a copy, not the same array)", () => {
    const same = spliceLandlockGrants(wrapped, callerArgv, [], fakeGrantArgs);
    expect(same).toEqual(wrapped);
    expect(same).not.toBe(wrapped);
  });

  it("matches the tail even when the caller's own arguments contain a -- separator", () => {
    const tricky = ["/bin/landlock-run", "--ro", "/", "--", "bash", "-c", "echo -- x"];
    expect(
      spliceLandlockGrants(tricky, ["bash", "-c", "echo -- x"], ["/data/s"], fakeGrantArgs),
    ).toEqual([
      "/bin/landlock-run",
      "--ro",
      "/",
      "--rw",
      "/data/s",
      "--",
      "bash",
      "-c",
      "echo -- x",
    ]);
  });

  it("refuses a wrapper that does not end with the separator and the caller's command", () => {
    expect(() =>
      spliceLandlockGrants(["/bin/landlock-run", "--ro", "/"], [], [], fakeGrantArgs),
    ).toThrow(/no longer ends with/);
    expect(() =>
      spliceLandlockGrants(
        ["/bin/landlock-run", "--ro", "/", "--", "bash", "-c", "other"],
        ["bash", "-c", "echo hi"],
        [],
        fakeGrantArgs,
      ),
    ).toThrow(/no longer ends with/);
  });
});

describe("the corner Landlock cannot express", () => {
  it("refuses a read-only root inside a writable grant, or equal to one", () => {
    expect(() =>
      assertLandlockCanExpress(["/tmp/state-root"], ["/dev/null", "/tmp", "/work/project"]),
    ).toThrow(/cannot hold .* read-only under Landlock/);
    expect(() => assertLandlockCanExpress(["/work/project/state"], ["/work/project"])).toThrow(
      /writable grant/,
    );
    expect(() => assertLandlockCanExpress(["/work/project"], ["/work/project"])).toThrow(
      /writable grant/,
    );
    expect(() => assertLandlockCanExpress(["/data/agents/a"], ["/"])).toThrow(/writable grant/);
  });

  it("allows the carve-out: a writable root deeper inside the read-only one is how the scratchpad works", () => {
    expect(() =>
      assertLandlockCanExpress(["/data/agents/a"], ["/data/agents/a/scratchpad"]),
    ).not.toThrow();
    expect(() =>
      assertLandlockCanExpress(["/data/agents/a"], ["/dev/null", "/tmp", "/work/project"]),
    ).not.toThrow();
  });
});
