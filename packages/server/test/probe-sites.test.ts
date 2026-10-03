/**
 * The build-time probe-site scan (scripts/probe-sites.mjs): the table the performance panel
 * links each probe's name through. Run over the real source, so a probe whose call is reshaped
 * past the three spellings the scan knows shows up here as a missing name.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { githubRepo, probeSites } from "../../../scripts/probe-sites.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("probe sites", () => {
  const server = probeSites(["packages/server/src"]);
  const web = probeSites(["packages/web/src"]);

  it("finds the server's probes in each spelling, and a per-segment family as prefix.*", () => {
    for (const name of [
      "http.request",
      "boot.migrate",
      "boot.create",
      "plugin.load",
      "session.messages",
      "trace.read",
      "sessions.list.sql",
      "turn.run",
      "turn.*",
      "machine.connect",
      "machine.ssh.command",
    ]) {
      expect(server[name], name).toMatch(/^packages\/server\/src\/.+\.ts:\d+$/);
    }
  });

  it("finds the browser's probes in the web package", () => {
    for (const name of [
      "web.boot",
      "web.turn",
      "web.session.open",
      "web.sessions.fanout",
      "web.socket.connect",
      "web.longtasks",
    ]) {
      expect(web[name], name).toMatch(/^packages\/web\/src\/.+\.tsx?:\d+$/);
    }
  });

  it("points every name at a line that spells it", () => {
    for (const [name, site] of Object.entries({ ...server, ...web })) {
      const at = site.lastIndexOf(":");
      const line = fs.readFileSync(path.join(ROOT, site.slice(0, at)), "utf8").split("\n")[
        Number(site.slice(at + 1)) - 1
      ];
      expect(line, site).toContain(name.endsWith(".*") ? name.slice(0, -2) : name);
    }
  });

  it("links a GitHub origin as itself, anything else at the canonical repository", () => {
    expect(githubRepo("git@github.com:Myriad-Dreamin/penguin-harness.git")).toBe(
      "https://github.com/Myriad-Dreamin/penguin-harness",
    );
    expect(githubRepo("https://github.com/Prism-Shadow/penguin-harness/")).toBe(
      "https://github.com/Prism-Shadow/penguin-harness",
    );
    expect(githubRepo("penguin-harness")).toBe("https://github.com/Prism-Shadow/penguin-harness");
    expect(githubRepo(null)).toBe("https://github.com/Prism-Shadow/penguin-harness");
  });
});
