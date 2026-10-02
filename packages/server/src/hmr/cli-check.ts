/**
 * A push is refused when its CLI bundle cannot be loaded.
 *
 * Every server start path runs the pushed CLI once a push has landed (packages/cli
 * server-entry.ts): a CLI bundle that fails to import would keep the server down at its next
 * restart, long after the push that brought it. The upgrade itself boots the pushed platform
 * and puts the previous one back when it fails, but never runs the CLI — so the CLI is
 * loaded here, before the push is handed to the mechanism, in a process of its own: the
 * pushed code does not run inside this server, and a bundle that hangs is cut off.
 *
 * The push is read with the mechanism's own parser (`parseUpgradeTarget`), the CLI resolved
 * from the store when it is named by sha. A body that does not parse, or a CLI this process
 * cannot read, is left to the endpoint to answer: this check only refuses what it has seen
 * fail.
 */
import { execFile } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { parseUpgradeTarget } from "@prismshadow/penguin-hmr";

const execFileAsync = promisify(execFile);

/** Long enough for a cold import of a full CLI bundle; short enough not to hold a push. */
const LOAD_TIMEOUT_MS = 30_000;

/** What a loadable CLI bundle exports: the loader (`penguin-hmr`) calls it. */
const LOAD_CHECK = `
const mod = await import(process.argv[1]);
if (typeof mod.cli !== "function") {
  process.stderr.write("the CLI bundle does not export 'cli'\\n");
  process.exit(1);
}
process.exit(0);
`;

/**
 * Why `request`'s CLI bundle cannot be loaded, or null when it loads or this check has
 * nothing to say about it. `readBlob` resolves a CLI pushed as `{ sha }`; a control object
 * from an HMR layer that predates it has none, and such a CLI is then not checked.
 */
export async function pushedCliProblem(
  request: Request,
  readBlob: ((sha: string) => Buffer | null) | undefined,
): Promise<string | null> {
  let source: string;
  try {
    const target = parseUpgradeTarget(
      request.headers.get("content-type"),
      Buffer.from(await request.arrayBuffer()),
      readBlob ?? (() => null),
    );
    source = target.cli;
  } catch {
    return null;
  }
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "penguin-cli-check-"));
  const file = path.join(dir, "cli.mjs");
  try {
    await fsp.writeFile(file, source);
    await execFileAsync(
      process.execPath,
      ["--input-type=module", "--eval", LOAD_CHECK, pathToFileURL(file).href],
      {
        timeout: LOAD_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        // Under the desktop app process.execPath is the Electron binary, which runs a script
        // only as Node with this set; without it, a second app instance would open.
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      },
    );
    return null;
  } catch (err) {
    const e = err as { killed?: boolean; stderr?: string; message?: string };
    if (e.killed) return `the CLI bundle did not load within ${LOAD_TIMEOUT_MS / 1000}s`;
    // Node prints where the import failed before what failed; the error line says why.
    const lines = (e.stderr ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "");
    const reason = lines.find((l) => /Error\b|error:/.test(l)) ?? lines[0];
    return `the CLI bundle cannot be loaded: ${reason ?? e.message ?? "unknown error"}`;
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}
