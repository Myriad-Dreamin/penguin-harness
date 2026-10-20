/**
 * The single-file HMR server: what a world gets before it has a Penguin server.
 *
 * A fresh machine has no program to run and no way to receive one: the server that would
 * serve a push is the thing being pushed. So the first artifact laid there is this file —
 * one JS, no node_modules — started with whatever Node the installation already has. It
 * serves the upgrade STREAM (stream.ts) and nothing else, commits the version it receives
 * into the data root's HMR store (HmrHost with no platform: install(), never boot), and
 * announces its port. The installer forwards that port, pushes the version through it, and
 * only then starts the real server — which restores the version this file committed and
 * boots it. That is how the first start needs neither node-pty nor the plugin library: by
 * the time the server runs, both arrived as assets.
 *
 * Environment (all required, all set by the installer):
 *   PENGUIN_HOME          the data root whose hmr/ store receives the version
 *   PENGUIN_HMR_TOKEN     the bearer token the pusher must present
 *   PENGUIN_HMR_PORT_FILE where to write the bound port (the installer polls it)
 *
 * It binds 127.0.0.1 only: the installer reaches it through a forward, never the network.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { HmrHost } from "@prismshadow/penguin-hmr";
import { attachHmrStream } from "./stream.js";

function required(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (value === "") {
    console.error(`[hmr-server] ${name} is required`);
    process.exit(2);
  }
  return value;
}

const root = required("PENGUIN_HOME");
const token = required("PENGUIN_HMR_TOKEN");
const portFile = required("PENGUIN_HMR_PORT_FILE");

const host = new HmrHost(root, null);
const server = http.createServer((_request, response) => {
  // Deliberately not a product surface: a version is pushed through the stream, and the
  // server that answers HTTP is the one started after this file's job is done.
  response.writeHead(503, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(
    JSON.stringify({
      error: {
        code: "hmr_bootstrap_only",
        message: "this is the HMR bootstrap: it receives a version over /api/hmr/stream only",
      },
    }),
  );
});
attachHmrStream(server, host, token);

server.on("error", (err) => {
  console.error(`[hmr-server] listener failed: ${err.message}`);
  process.exit(1);
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  fs.mkdirSync(path.dirname(portFile), { recursive: true });
  const tmp = `${portFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${port}\n`);
  fs.renameSync(tmp, portFile);
  console.log(`[hmr-server] listening on 127.0.0.1:${port}`);
  console.log(`[hmr-server] data root: ${root}`);
});

const stop = (): void => {
  server.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
