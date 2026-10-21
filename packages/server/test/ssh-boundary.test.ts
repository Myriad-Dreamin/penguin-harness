/**
 * The ssh provider's rules, as a source scan (it runs with the suite everywhere, and its
 * failure message names the offending file; tests are exempt — a unit test imports a private
 * module by nature).
 *
 * 1. ONE MOUTH. Nothing outside `sys/ssh/` starts ssh or scp. The incident behind this rule
 *    (#561) grew where four call sites each opened their own channel and each judged the
 *    machine's liveness from its own: the connection, its lifetime and its failures are known
 *    in one place or they disagree.
 * 2. THE PROVIDER KNOWS NOTHING ABOVE IT. `sys/ssh/` may not import the server's features —
 *    `machines/` above all: a host is an alias, an account and maybe a password; what a machine
 *    IS — its install, its API, its settings — belongs to the layer that uses ssh, not to ssh.
 *    What it may use is the server's own leaves at `src/` (a 0600 file writer), and the files
 *    it moved with.
 *
 * The directory is entered through its index alone, which is what keeps rule 1 checkable, and
 * the paths those modules had before they became a provider stay gone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const PROVIDER = "sys/ssh/";

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
const provider = files.filter((f) => f.rel.startsWith(PROVIDER));
const outside = files.filter((f) => !f.rel.startsWith(PROVIDER));

/** Every relative specifier in a file, resolved against the file that wrote it. */
function reaches(f: { rel: string; text: string }): string[] {
  const dir = path.posix.dirname(f.rel);
  return [...f.text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)].map((m) =>
    path.posix.normalize(path.posix.join(dir, m[1]!)),
  );
}

describe("the ssh provider", () => {
  it("is the only place ssh or scp is started", () => {
    const start = /\b(?:spawn|execFile|run|runWithInput)\(\s*["'](?:ssh|scp)["']/;
    expect(outside.filter((f) => start.test(f.text)).map((f) => f.rel)).toEqual([]);
  });

  it("knows nothing about the machine feature", () => {
    const machines = provider
      .filter((f) => reaches(f).some((p) => p.startsWith("machines/")))
      .map((f) => f.rel);
    expect(machines).toEqual([]);
  });

  it("reaches nothing above it but the server's own leaves", () => {
    const above = provider
      .filter((f) => reaches(f).some((p) => !p.startsWith(PROVIDER) && !/^[a-z0-9-]+\.js$/.test(p)))
      .map((f) => f.rel);
    expect(above).toEqual([]);
  });

  it("is entered through its index alone", () => {
    const reachers = outside
      .filter((f) => reaches(f).some((p) => p.startsWith(PROVIDER) && p !== `${PROVIDER}index.js`))
      .map((f) => f.rel);
    expect(reachers).toEqual([]);
  });

  it("the modules' old paths stay gone", () => {
    const gone = new Set([
      // The machine feature's copies before the provider had a directory of its own.
      "machines/ssh-sys.js",
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
      // The layer that stood at the top of src/ before it moved under sys/.
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
    ]);
    const stragglers = files.filter((f) => reaches(f).some((p) => gone.has(p))).map((f) => f.rel);
    expect(stragglers).toEqual([]);
  });
});
