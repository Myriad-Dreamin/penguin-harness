/**
 * The ssh layer's two rules, as a source scan (it runs with the suite everywhere, and its
 * failure message names the offending file; tests are exempt — a unit test imports a private
 * module by nature).
 *
 * 1. ONE MOUTH. Nothing outside `ssh/` starts ssh or scp. The incident behind this rule
 *    (#561) grew where four call sites each opened their own channel and each judged the
 *    machine's liveness from its own: the connection, its lifetime and its failures are known
 *    in one place or they disagree.
 * 2. THE LAYER KNOWS NOTHING ABOVE IT. `ssh/` may not import `machines/`. A host is an alias,
 *    an account and maybe a password; what a machine IS — its install, its API, its settings —
 *    belongs to the layer that uses ssh, not to ssh.
 *
 * The directory is entered through its index alone, which is what keeps rule 1 checkable, and
 * the paths the modules had before the layer existed stay gone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".ts")) yield full;
  }
}

const files = [...walk(SRC)].map((full) => ({
  rel: path.relative(SRC, full).replaceAll(path.sep, "/"),
  text: fs.readFileSync(full, "utf8"),
}));
const layer = files.filter((f) => f.rel.startsWith("ssh/"));
const outside = files.filter((f) => !f.rel.startsWith("ssh/"));

describe("the ssh layer", () => {
  it("is the only place ssh or scp is started", () => {
    const start = /\b(?:spawn|execFile|run|runWithInput)\(\s*["'](?:ssh|scp)["']/;
    expect(outside.filter((f) => start.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("knows nothing about machines", () => {
    const reaches = layer
      .filter((f) => /from\s+["'][^"']*machines\//.test(f.text))
      .map((f) => f.rel);
    expect(reaches).toEqual([]);
  });

  it("is entered through its index alone", () => {
    const reachers = outside
      .filter((f) => /from\s+["'][^"']*\/ssh\/(?!index\.js)/.test(f.text))
      .map((f) => f.rel);
    expect(reachers).toEqual([]);
  });

  it("the private modules' old paths stay gone", () => {
    // Each relative specifier is resolved against the importing file rather than matched by
    // shape, so a caller anywhere under src/ reaching for `../machines/exec.js` is caught,
    // not only a sibling writing `./exec.js`.
    const gone = new Set([
      "machines/exec.js",
      "machines/targets.js",
      "machines/ssh-session.js",
      "machines/ssh-config.js",
      "machines/ssh-failure.js",
      "machines/ssh-passwords.js",
      "machines/transport/index.js",
      "machines/transport/connection.js",
      "machines/transport/ssh-session.js",
      "machines/transport/socks.js",
      "machines/transport/exec.js",
      "machines/transport/lane.js",
      "machines/transport/login.js",
      "machines/transport/targets.js",
      "machines/forward.js",
    ]);
    const specifiers = /from\s+["'](\.{1,2}\/[^"']+)["']/g;
    const stragglers = files
      .filter((f) => {
        const dir = path.posix.dirname(f.rel);
        return [...f.text.matchAll(specifiers)].some((m) =>
          gone.has(path.posix.normalize(path.posix.join(dir, m[1]!))),
        );
      })
      .map((f) => f.rel);
    expect(stragglers).toEqual([]);
  });
});
