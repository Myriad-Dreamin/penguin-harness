/**
 * A push whose CLI bundle cannot be loaded is refused before it lands (src/hmr/cli-check.ts):
 * server start paths run the pushed CLI after the next restart, so a broken one would keep the
 * server down long after the push. The bundle is loaded in a process of its own.
 */
import crypto from "node:crypto";
import zlib from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { readHarnessInfo } from "../src/hmr/manifest.js";
import { createTestApp, loginAdmin } from "./helpers.js";
import type { TestApp } from "./helpers.js";

const WEB = { "index.html": Buffer.from("<html>cli-check</html>").toString("base64") };
/** Never booted: every push below is refused, or left to the endpoint, before the platform is read. */
const PLATFORM = "export const platform = 1;\n";

let t: TestApp | undefined;

afterEach(async () => {
  if (t) await t.cleanup();
  t = undefined;
});

const sha256 = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");

function push(t: TestApp, cookie: string, cli: unknown) {
  return t.app.request("/api/hmr/upgrade", {
    method: "POST",
    headers: { cookie, "content-type": "application/gzip" },
    body: zlib.gzipSync(Buffer.from(JSON.stringify({ platform: PLATFORM, cli, web: { files: WEB } }))),
  });
}

describe("POST /api/hmr/upgrade: the pushed CLI must load", () => {
  it("refuses a CLI bundle that does not parse, naming the error, and lands nothing", async () => {
    t = await createTestApp();
    const cookie = (await loginAdmin(t.app)).cookie;
    const res = await push(t, cookie, "export async function cli( {\n");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toMatch(/^the CLI bundle cannot be loaded: SyntaxError/);
    expect(await readHarnessInfo(t.root)).toBeNull();
  });

  it("refuses a CLI bundle that loads but exports no cli", async () => {
    t = await createTestApp();
    const cookie = (await loginAdmin(t.app)).cookie;
    const res = await push(t, cookie, "export const notCli = 1;\n");
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("does not export 'cli'");
  });

  it("loads a CLI named by sha from the store, and refuses it when it cannot load", async () => {
    t = await createTestApp();
    const cookie = (await loginAdmin(t.app)).cookie;
    const broken = Buffer.from("throw new Error('cli exploded at import');\n");
    const put = await t.app.request(`/api/hmr/blobs/${sha256(broken)}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/octet-stream" },
      body: broken,
    });
    expect(put.status).toBe(200);
    const res = await push(t, cookie, { sha: sha256(broken) });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("cli exploded at import");
  });

  it("leaves a push it cannot read to the endpoint: a CLI named by a sha the store lacks", async () => {
    t = await createTestApp();
    const cookie = (await loginAdmin(t.app)).cookie;
    const res = await push(t, cookie, { sha: "a".repeat(64) });
    expect(res.status).toBe(400);
    // The mechanism's own answer, not this check's.
    expect(await res.text()).toContain("put it first");
  });
});
