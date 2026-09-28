/**
 * The composer's permission level: one colour for how much the Agent may do on its own.
 */
import { describe, expect, it } from "vitest";
import type { SessionSandbox } from "@prismshadow/penguin-server/api";
import {
  PERMISSION_LEVEL_GLYPH,
  PERMISSION_LEVEL_TONE,
  SHIELD,
  fsModeBlock,
  networkBlock,
  permissionLevel,
} from "../src/lib/permission-level";

const FULL: SessionSandbox = { mode: "danger-full-access", network: "open" };

describe("which levels the composer lets a person pick", () => {
  const NO_BACKEND: SessionSandbox = {
    ...FULL,
    confinementSupported: false,
    noNetworkSupported: false,
    localNetworkSupported: false,
  };

  it("with no backend installed, every level short of full access is marked not installed", () => {
    expect(fsModeBlock(NO_BACKEND, "read-only")).toBe("no-backend");
    expect(fsModeBlock(NO_BACKEND, "workspace-write")).toBe("no-backend");
    expect(fsModeBlock(NO_BACKEND, "danger-full-access")).toBeNull();
    expect(networkBlock(NO_BACKEND, "none")).toBe("no-backend");
    expect(networkBlock(NO_BACKEND, "local")).toBe("no-backend");
    expect(networkBlock(NO_BACKEND, "open")).toBeNull();
  });

  it("with a filesystem-only backend, confinement is open and only the network levels are not", () => {
    const fsOnly: SessionSandbox = { ...NO_BACKEND, confinementSupported: true };
    expect(fsModeBlock(fsOnly, "read-only")).toBeNull();
    expect(fsModeBlock(fsOnly, "workspace-write")).toBeNull();
    expect(networkBlock(fsOnly, "none")).toBe("none-unsupported");
    expect(networkBlock(fsOnly, "local")).toBe("local-unsupported");
  });

  it("with a full backend, nothing is blocked", () => {
    const full: SessionSandbox = {
      ...FULL,
      confinementSupported: true,
      noNetworkSupported: true,
      localNetworkSupported: true,
    };
    for (const mode of ["read-only", "workspace-write", "danger-full-access"] as const) {
      expect(fsModeBlock(full, mode)).toBeNull();
    }
    for (const network of ["none", "local", "open"] as const) {
      expect(networkBlock(full, network)).toBeNull();
    }
  });

  it("a server that does not report the flags is not second-guessed, except for local", () => {
    expect(fsModeBlock(FULL, "read-only")).toBeNull();
    expect(networkBlock(FULL, "none")).toBeNull();
    expect(networkBlock(FULL, "local")).toBe("local-unsupported");
  });
});

describe("permission level", () => {
  it("is all only when nothing holds the Agent back", () => {
    expect(permissionLevel("allow-all", FULL)).toBe("all");
    expect(permissionLevel("always-ask", FULL)).toBe("partial");
    expect(permissionLevel("read-only", FULL)).toBe("partial");
    expect(permissionLevel("allow-all", { ...FULL, network: "none" })).toBe("partial");
    expect(permissionLevel("allow-all", { ...FULL, mode: "workspace-write" })).toBe("partial");
  });

  it("is read-only when commands cannot write, and off when every call is denied", () => {
    expect(permissionLevel("allow-all", { mode: "read-only", network: "open" })).toBe("read-only");
    expect(permissionLevel("deny-all", FULL)).toBe("off");
    expect(permissionLevel("deny-all", { mode: "read-only", network: "none" })).toBe("off");
  });

  it("gives each level its own tone, loudest for the most access", () => {
    expect(PERMISSION_LEVEL_TONE).toEqual({
      all: "danger",
      partial: "attention",
      "read-only": "success",
      off: "muted",
    });
  });

  it("draws each level with its own mark, so the level never depends on colour alone", () => {
    const glyphs = Object.values(PERMISSION_LEVEL_GLYPH);
    expect(glyphs).toHaveLength(4);
    expect(new Set(glyphs).size).toBe(4);
    // lucide's shield family: the three that keep the whole outline start with it.
    for (const level of ["all", "partial", "read-only"] as const) {
      expect(PERMISSION_LEVEL_GLYPH[level].startsWith(SHIELD)).toBe(true);
    }
  });
});
