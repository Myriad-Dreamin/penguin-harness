/**
 * A stand-in for the server program in the Sys tests: binds PORT (0 lets the OS pick), then
 * writes the bound port into PENGUIN_PORT_FILE — the real server's announcement step, and
 * the only thing `runServer` interprets as "the server is up". `GET /` answers `stub`, so a
 * caller can prove the announced port answers. SIGTERM closes the listener and exits.
 *
 * Plain node, no imports from this checkout: it runs inside a bubblewrap world too, where
 * the checkout is not part of the program under test.
 */
import fs from "node:fs";
import http from "node:http";

const file = process.env.PENGUIN_PORT_FILE;
if (file === undefined || file === "") {
  process.stderr.write("PENGUIN_PORT_FILE is not set\n");
  process.exit(2);
}
const requested = Number(process.env.PORT ?? "0");
const server = http.createServer((_request, response) => {
  response.end("stub");
});
server.listen(requested, process.env.HOST ?? "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : requested;
  fs.writeFileSync(`${file}.${process.pid}.tmp`, `${port}\n`);
  fs.renameSync(`${file}.${process.pid}.tmp`, file);
});
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
