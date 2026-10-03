/** A package manager run from the build scripts, with its stderr in the error when it fails. */
import { execFileSync } from "node:child_process";

/** A package manager's command, as the platform names it. */
function command(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}
// cmd.exe does not unquote spawn args by itself: under `shell: true` the args are joined
// into one command line, so a path with a space (the pack directory lives under the user's
// temp directory, i.e. their profile) splits into two. Quoted the way run-with-env.mjs quotes.
const quote = (a) => (/[\s"^&|<>;,()%!]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
export function run(name, args, cwd) {
  const windows = process.platform === "win32";
  try {
    execFileSync(command(name), windows ? args.map(quote) : args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: windows,
      env: process.env,
    });
  } catch (err) {
    const stderr = err instanceof Object && "stderr" in err ? String(err.stderr).trim() : "";
    throw new Error(`${name} ${args.slice(0, 3).join(" ")} failed in ${cwd}\n${stderr}`);
  }
}
