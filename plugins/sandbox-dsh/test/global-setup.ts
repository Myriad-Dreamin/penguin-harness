// The live suite runs the package as it ships: built, packed, and unpacked into an npm prefix in a
// temp directory outside the repository — the shape a plugin arrives in — where nothing but what
// the tarball carries resolves. Under `node_modules/`, vitest also leaves it to Node's own
// resolver rather than transforming it (vite's would fall back to the workspace's packages).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    /** The unpacked package directory. */
    dshPackage: string;
  }
}

// The server's tar, as scripts/vendor-bwrap.mjs borrows it.
const tar = createRequire(
  path.resolve(import.meta.dirname, "../../../packages/server/package.json"),
)("tar");

export default function setup(project: TestProject): () => void {
  const dir = mkdtempSync(path.join(tmpdir(), "penguin-dsh-packed-"));
  const windows = process.platform === "win32";
  const pnpm = (...args: string[]) =>
    execFileSync(windows ? "pnpm.cmd" : "pnpm", args, {
      cwd: path.resolve(import.meta.dirname, ".."),
      shell: windows,
      // stdout is pnpm pack's file listing, hundreds of lines; errors still reach stderr.
      stdio: ["ignore", "ignore", "inherit"],
    });
  pnpm("run", "build");
  pnpm("pack", "--pack-destination", dir);
  const tarball = readdirSync(dir).find((f) => f.endsWith(".tgz"));
  const pkg = path.join(dir, "node_modules", "@penguinharness", "sandbox-dsh");
  mkdirSync(pkg, { recursive: true });
  tar.x({ file: path.join(dir, String(tarball)), cwd: pkg, strip: 1, sync: true });
  project.provide("dshPackage", pkg);
  return () => rmSync(dir, { recursive: true, force: true });
}
