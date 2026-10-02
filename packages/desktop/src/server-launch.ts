/**
 * The embedded server's entry, forked by server-process.ts: starts the server of the harness
 * that runs, resolved by the CLI's one rule (@prismshadow/penguin-cli/harness) — the pushed
 * CLI's when the data root has one, else the server bundled with this app (dist/server.js).
 *
 * Forking dist/server.js unconditionally kept the entry this app was installed with, so a
 * change on the entry side (the process entry, the terminal WebSocket handshake) needed a
 * new app install. Starting the pushed harness's server makes it arrive with a push and a
 * restart, as `penguin server` does.
 *
 * The data root, port and host arrive through the fork's environment, set by the main
 * process; what this process resolves itself — the harness and its CLI, which the server
 * offers the Agents and runs `update` with — is handed to the server as an argument.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveHarness } from "@prismshadow/penguin-cli/harness";
import type { StartOptions } from "@prismshadow/penguin-server";

const here = path.dirname(fileURLToPath(import.meta.url));
/** The CLI bundled into this app beside this file (tsup.config.ts), with its `penguin-hmr` loader. */
const bundledCli = path.join(here, "penguin.js");
const root = process.env.PENGUIN_HOME;

const harness =
  root !== undefined && fs.existsSync(bundledCli)
    ? await resolveHarness(bundledCli, root)
    : { source: "installed" as const, cliEntry: null, bundle: null };
const options: StartOptions = { cliEntry: harness.cliEntry };

const pushed =
  harness.bundle !== null
    ? ((await import(pathToFileURL(harness.bundle).href)) as {
        serve?: (options: StartOptions) => Promise<void>;
      })
    : null;
if (typeof pushed?.serve === "function") {
  await pushed.serve(options);
} else {
  // Nothing pushed, or a CLI pushed before it could start a server in place.
  const bundled = (await import(new URL("./server.js", import.meta.url).href)) as {
    startServer: (options: StartOptions) => Promise<void>;
  };
  await bundled.startServer(options);
}
