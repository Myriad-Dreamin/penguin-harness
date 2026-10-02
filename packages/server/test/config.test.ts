/**
 * resolveServerConfig: how the server reads its environment.
 *
 * - An empty PORT (the common `PORT=` line in `.env`) reads as unset, never as port 0; an
 *   explicit value takes effect and an explicit "0" is kept (bind a random free port); a
 *   non-integer or out-of-range value throws. This matches the CLI's resolvePort.
 * - PENGUIN_SEED_ADMIN_PASSWORD: unset, empty or blank leaves the seed unpinned (null, so the
 *   seed generates its own); a value is kept trimmed; desktop mode changes neither.
 * - What the starter resolved (port, host, the harness's CLI) takes precedence over the
 *   environment; no resolved CLI falls through to the checkout lookup, and an environment
 *   variable cannot name one.
 * - PENGUIN_GO_ORIGIN accepts a loopback HTTP origin for integration work and refuses anything
 *   that is not a bare origin, or plaintext HTTP to another host.
 * - MODELSCOPE_BRIDGE_URL may carry a path prefix but refuses plaintext HTTP, credentials, a
 *   query and a fragment.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolveServerConfig } from "../src/config.js";

const base = { PENGUIN_HOME: "/tmp/penguin-config-test" };

describe("resolveServerConfig: PORT parsing", () => {
  it("reads an empty PORT as unset, not as port 0", () => {
    const unset = resolveServerConfig({ ...base }).port;
    expect(unset).not.toBe(0);
    expect(resolveServerConfig({ ...base, PORT: "" }).port).toBe(unset);
  });

  it('takes an explicit value, and keeps "0" (binds a random available port)', () => {
    expect(resolveServerConfig({ ...base, PORT: "8930" }).port).toBe(8930);
    expect(resolveServerConfig({ ...base, PORT: "0" }).port).toBe(0);
  });

  it("throws on a non-integer or out-of-range value", () => {
    for (const bad of ["abc", "3.14", "-1", "65536"]) {
      expect(() => resolveServerConfig({ ...base, PORT: bad }), bad).toThrow(/Invalid port/);
    }
  });
});

describe("resolveServerConfig: seed password", () => {
  it("leaves the seed unpinned when unset, empty or blank, and keeps a value trimmed", () => {
    expect(resolveServerConfig({ ...base }).seedAdminPassword).toBeNull();
    for (const blank of ["", "  "]) {
      expect(
        resolveServerConfig({ ...base, PENGUIN_SEED_ADMIN_PASSWORD: blank }).seedAdminPassword,
      ).toBeNull();
    }
    expect(
      resolveServerConfig({ ...base, PENGUIN_SEED_ADMIN_PASSWORD: " penguin-9999 " })
        .seedAdminPassword,
    ).toBe("penguin-9999");
  });

  it("desktop mode leaves the seed unpinned, and an explicit value still wins there", () => {
    // Nothing pins it: the password the seed generates on its own is already unguessable, so
    // supplying one here would just be a second way to say the same thing.
    const desktop = { ...base, PENGUIN_DESKTOP_TOKEN: "tok" };
    expect(resolveServerConfig(desktop).seedAdminPassword).toBeNull();
    expect(
      resolveServerConfig({ ...desktop, PENGUIN_SEED_ADMIN_PASSWORD: "penguin-2026" })
        .seedAdminPassword,
    ).toBe("penguin-2026");
  });
});

describe("resolveServerConfig: what the starter resolved", () => {
  it("takes the harness's CLI — what the <root>/bin/penguin shim execs", () => {
    expect(
      resolveServerConfig(base, { cliEntry: "/opt/penguin/lib/dist/penguin-hmr.js" }).cliEntry,
    ).toBe("/opt/penguin/lib/dist/penguin-hmr.js");
  });

  it("falls through to the checkout lookup without one, whatever the environment says", () => {
    // What the lookup finds depends on whether this checkout has built its CLI, so the claim
    // here is only that the environment does not name it (see cli-shim.test.ts for
    // checkoutCliEntry itself).
    const inferred = resolveServerConfig(base, { cliEntry: null }).cliEntry;
    expect(resolveServerConfig({ ...base, PENGUIN_CLI_ENTRY: "/planted/cli.js" }).cliEntry).toBe(
      inferred,
    );
    expect(inferred === null || inferred?.endsWith(`${path.sep}penguin.js`)).toBe(true);
  });

  it("takes the resolved port and host over PORT / HOST", () => {
    const config = resolveServerConfig(
      { ...base, PORT: "7364", HOST: "0.0.0.0" },
      { port: 0, host: "127.0.0.1" },
    );
    expect(config.port).toBe(0);
    expect(config.host).toBe("127.0.0.1");
  });
});

describe("resolveServerConfig: PENGUIN_GO_ORIGIN parsing", () => {
  it("accepts a loopback HTTP origin for integration work, trimmed", () => {
    expect(
      resolveServerConfig({ ...base, PENGUIN_GO_ORIGIN: " http://127.0.0.1:3000 " })
        .penguinGoOrigin,
    ).toBe("http://127.0.0.1:3000");
  });

  it("refuses anything but a bare origin, and plaintext HTTP to another host", () => {
    for (const bad of [
      "http://token.penguin.ooo",
      "https://token.penguin.ooo/path",
      "https://user:pass@token.penguin.ooo",
      "https://token.penguin.ooo?next=x",
    ]) {
      expect(() => resolveServerConfig({ ...base, PENGUIN_GO_ORIGIN: bad }), bad).toThrow(
        /Invalid PENGUIN_GO_ORIGIN/,
      );
    }
  });
});

describe("resolveServerConfig: MODELSCOPE_BRIDGE_URL parsing", () => {
  it("allows a path prefix, trimmed of its surrounding space and trailing slash", () => {
    expect(
      resolveServerConfig({
        ...base,
        MODELSCOPE_BRIDGE_URL: " https://go.penguin.ooo/modelscope/ ",
      }).modelscopeBridgeUrl,
    ).toBe("https://go.penguin.ooo/modelscope");
  });

  it("refuses plaintext HTTP, credentials, a query and a fragment", () => {
    for (const bad of [
      "http://go.penguin.ooo/modelscope",
      "https://user:pass@go.penguin.ooo/modelscope",
      "https://go.penguin.ooo/modelscope?next=x",
      "https://go.penguin.ooo/modelscope#token",
    ]) {
      expect(() => resolveServerConfig({ ...base, MODELSCOPE_BRIDGE_URL: bad }), bad).toThrow(
        /Invalid MODELSCOPE_BRIDGE_URL/,
      );
    }
  });
});
