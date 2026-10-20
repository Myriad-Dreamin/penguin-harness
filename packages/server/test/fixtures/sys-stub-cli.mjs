/**
 * A stand-in for `penguin` in the Sys tests: writes its argv and PENGUIN_HOME to the file
 * SYS_TEST_CLI_LOG names, then answers what `plugin install --json` prints — unless
 * SYS_TEST_CLI_FAIL is set, in which case it refuses on stderr and exits 4.
 */
import fs from "node:fs";

const log = process.env.SYS_TEST_CLI_LOG;
if (log !== undefined && log !== "") {
  fs.writeFileSync(
    log,
    JSON.stringify({ argv: process.argv.slice(2), home: process.env.PENGUIN_HOME ?? null }),
  );
}
if (process.env.SYS_TEST_CLI_FAIL === "1") {
  process.stderr.write("the registry refused\n");
  process.exit(4);
}
process.stdout.write(
  `${JSON.stringify({
    plugins: [],
    installed: {
      name: "@penguinharness/a2ui",
      version: "0.2.16",
      library: true,
      modules: false,
    },
    shipped: [],
    file: "plugins.json",
    machineId: "stub-machine",
  })}\n`,
);
