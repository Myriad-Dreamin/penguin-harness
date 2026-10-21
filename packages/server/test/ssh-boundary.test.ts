/**
 * The ssh transport's rules, as a source scan (it runs with the suite everywhere, and its
 * failure message names the offending file; tests are exempt — a unit test imports a private
 * module by nature).
 *
 * 1. ONE MOUTH. Nothing outside `machines/transport/` starts ssh or scp. The incident behind
 *    this rule (#561) grew where four call sites each opened their own channel and each judged
 *    the machine's liveness from its own: the connection, its lifetime and its failures are
 *    known in one place or they disagree.
 * 2. IT KNOWS NOTHING ABOVE IT. `machines/transport/` may not import the machine feature that
 *    uses it: a host is an alias, an account and maybe a password; what a machine IS — its
 *    install, its API, its settings — belongs to the layer above. What it may use is the
 *    server's own leaves at `src/` (a 0600 file writer), and the files it moved with.
 *
 * It is not a `Sys` provider: a machine is a server installed on another computer and reached
 * through its API socket, so the transport lives with the machine feature, not under `sys/`
 * beside the worlds an outside caller acts in.
 *
 * The directory is entered through its index alone, which is what keeps rule 1 checkable, and
 * the paths those modules had before they came here stay gone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const TRANSPORT = "machines/transport/";

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
const transport = files.filter((f) => f.rel.startsWith(TRANSPORT));
const outside = files.filter((f) => !f.rel.startsWith(TRANSPORT));

/** Every relative specifier in a file, resolved against the file that wrote it. */
function reaches(f: { rel: string; text: string }): string[] {
  const dir = path.posix.dirname(f.rel);
  return [...f.text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)].map((m) =>
    path.posix.normalize(path.posix.join(dir, m[1]!)),
  );
}

describe("the ssh transport", () => {
  it("is the only place ssh or scp is started", () => {
    const start = /\b(?:spawn|execFile|run|runWithInput)\(\s*["'](?:ssh|scp)["']/;
    expect(outside.filter((f) => start.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("knows nothing about the machine feature", () => {
    const machines = transport
      .filter((f) => reaches(f).some((p) => p.startsWith("machines/") && !p.startsWith(TRANSPORT)))
      .map((f) => f.rel);
    expect(machines).toEqual([]);
  });

  it("reaches nothing above it but the server's own leaves", () => {
    const above = transport
      .filter((f) =>
        reaches(f).some(
          (p) =>
            !p.startsWith(TRANSPORT) && !p.startsWith("machines/") && !/^[a-z0-9-]+\.js$/.test(p),
        ),
      )
      .map((f) => f.rel);
    expect(above).toEqual([]);
  });

  it("is entered through its index alone", () => {
    const reachers = outside
      .filter((f) =>
        reaches(f).some((p) => p.startsWith(TRANSPORT) && p !== `${TRANSPORT}index.js`),
      )
      .map((f) => f.rel);
    expect(reachers).toEqual([]);
  });

  it("the modules' old paths stay gone", () => {
    const gone = new Set([
      // The provider that once wrapped this transport around a machine's ssh session.
      "machines/ssh-sys.js",
      // The module names it had before the split (renamed: session, spawn, hosts).
      "machines/transport/ssh-session.js",
      "machines/transport/exec.js",
      "machines/transport/targets.js",
      // The copies that sat beside the machine feature before the split.
      "machines/ssh-session.js",
      "machines/ssh-config.js",
      "machines/ssh-failure.js",
      "machines/ssh-passwords.js",
      "machines/exec.js",
      "machines/targets.js",
      // The locations this layer passed through on its way back here.
      "ssh/index.js",
      "ssh/args.js",
      "ssh/config.js",
      "ssh/connection.js",
      "ssh/failure.js",
      "ssh/hosts.js",
      "ssh/lane.js",
      "ssh/login.js",
      "ssh/passwords.js",
      "ssh/session.js",
      "ssh/socks.js",
      "ssh/spawn.js",
      "ssh/target.js",
      "sys/ssh/index.js",
      "sys/ssh/sys.js",
    ]);
    const stragglers = files.filter((f) => reaches(f).some((p) => gone.has(p))).map((f) => f.rel);
    expect(stragglers).toEqual([]);
  });
});
