/**
 * The kernel's runtime entry boots a verified tree with arktype unloadable: importing
 * arktype throws in this file, so any path from `kernel/runtime` to it fails the import or
 * the boot.
 *
 * - A tree of literal modules boots in dependency order with contributions and their code
 *   halves; a requirement naming its provider with `from` wires to that provider's one
 *   provision even where only a structural match would satisfy it.
 * - A class tree boots against its generated manifests.
 * - A requirement only a structural match satisfies, with no `from`, is refused before
 *   anything is created, naming the module and the alias.
 * - The identity checks run on every boot: a duplicate module, a duplicate contribution id,
 *   a contribution to a slot nobody declares, an interface the table lacks.
 * - A parked context with a schema refuses the boot (it cannot be validated here); one
 *   without a schema, or a fresh boot, boots.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("arktype", () => {
  throw new Error("arktype was loaded by the runtime entry");
});

const { bootVerified, defineModule, Module, ModuleBootError, moduleDefOf, Provide, Use } =
  await import("../src/kernel/runtime.js");
type Manifest = import("../src/kernel/runtime.js").Manifest;
type IfaceDecl = import("../src/kernel/runtime.js").IfaceDecl;
type Resources = import("../src/kernel/runtime.js").Resources;

const resources: Resources = { register: () => () => {}, claim: () => undefined };
const str = { data: "string" } as const;

const Sessions: IfaceDecl = {
  name: "Sessions",
  methods: {
    startTask: { params: [str], returns: { promise: { data: { sessionId: "string" } } } },
    statusOf: { params: [str], returns: { data: "string" } },
  },
  slots: {},
};
const Runner: IfaceDecl = {
  name: "Runner",
  methods: { statusOf: { params: [str], returns: { data: "string" } } },
  slots: {},
};
const Http: IfaceDecl = {
  name: "Http",
  methods: {
    handle: { params: [{ opaque: "Request" }], returns: { promise: { opaque: "Response" } } },
  },
  slots: { routes: { data: { prefix: "string" }, code: { opaque: "Handler" } } },
};
const table = {
  "sessions#Sessions": Sessions,
  "scheduler#Runner": Runner,
  "http#Http": Http,
};

const manifest = (m: Partial<Manifest> & { name: string }): Manifest => ({
  requires: {},
  provides: {},
  contributes: {},
  children: [],
  ...m,
});

const sessionsApi = { startTask: async () => ({ sessionId: "s" }), statusOf: () => "idle" };

function fixture(order: string[], extra: Partial<Record<string, Partial<Manifest>>> = {}) {
  const leaf = (
    name: string,
    m: Partial<Manifest>,
    create: Parameters<typeof defineModule>[1]["create"],
  ) => defineModule(manifest({ name, ...m, ...extra[name] }), { create });
  return defineModule(
    manifest({ name: "platform", children: ["scheduler", "http", "sessions", "watcher"] }),
    {
      create: () => ({ api: {} }),
      children: [
        leaf(
          "scheduler",
          { requires: { runner: { iface: "Runner", from: "sessions" } } },
          (ctx) => {
            order.push(
              `scheduler:${(ctx.use.runner as { statusOf(id: string): string }).statusOf("x")}`,
            );
            return { api: {} };
          },
        ),
        leaf("http", { provides: { http: "Http" } }, (ctx) => {
          order.push(
            `http:${ctx.contributions.routes!.map((c) => `${c.id}=${String(c.code)}`).join(",")}`,
          );
          return { api: { http: { handle: async () => null } } };
        }),
        leaf(
          "sessions",
          {
            provides: { sessions: "Sessions" },
            contributes: { "http.routes": [{ id: "sessions.routes", prefix: "/api/sessions" }] },
          },
          () => {
            order.push("sessions");
            return { api: { sessions: sessionsApi }, bind: { "sessions.routes": "HANDLER" } };
          },
        ),
        leaf("watcher", { requires: { sessions: { iface: "sessions#Sessions" } } }, (ctx) => {
          order.push(`watcher:${ctx.use.sessions === sessionsApi}`);
          return { api: {} };
        }),
      ],
    },
  );
}

describe("bootVerified (arktype unloadable)", () => {
  it("boots literal modules in dependency order, with contributions and code halves", async () => {
    const order: string[] = [];
    const tree = await bootVerified(fixture(order), { ifaces: table, resources });
    expect(order).toEqual([
      "sessions",
      "scheduler:idle",
      "http:sessions.routes=HANDLER",
      "watcher:true",
    ]);
    expect(tree.api("sessions", "sessions")).toBe(sessionsApi);
    tree.dispose();
  });

  it("boots a class tree against its generated manifests", async () => {
    @Module()
    class SessionsModule {
      @Provide() sessions!: typeof sessionsApi;
      setup() {
        this.sessions = sessionsApi;
      }
    }
    const seen: string[] = [];
    @Module()
    class SchedulerModule {
      @Use(SessionsModule) readonly runner!: { statusOf(id: string): string };
      setup() {
        seen.push(this.runner.statusOf("s"));
      }
    }
    @Module({ children: [SessionsModule, SchedulerModule] })
    class PlatformModule {}
    const manifests = {
      SessionsModule: manifest({ name: "SessionsModule", provides: { sessions: "Sessions" } }),
      SchedulerModule: manifest({
        name: "SchedulerModule",
        requires: { runner: { iface: "Runner", from: "SessionsModule" } },
      }),
      PlatformModule: manifest({
        name: "PlatformModule",
        children: ["SessionsModule", "SchedulerModule"],
      }),
    };
    const ifaces = { "SessionsModule#Sessions": Sessions, "SchedulerModule#Runner": Runner };
    const tree = await bootVerified(moduleDefOf(PlatformModule, { manifests }), {
      ifaces,
      resources,
    });
    expect(seen).toEqual(["idle"]);
    expect(tree.has("SchedulerModule")).toBe(true);
    tree.dispose();
  });

  it("refuses a requirement only a structural match satisfies, naming module and alias", async () => {
    const order: string[] = [];
    const root = fixture(order, { scheduler: { requires: { runner: { iface: "Runner" } } } });
    const err = await bootVerified(root, { ifaces: table, resources }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModuleBootError);
    expect((err as Error).message).toContain("/platform/scheduler: requires.runner");
    expect((err as InstanceType<typeof ModuleBootError>).problems).toEqual([
      expect.objectContaining({ kind: "unresolved", alias: "runner", path: "/platform/scheduler" }),
    ]);
    expect(order).toEqual([]);
  });

  it("runs the identity checks on every boot", async () => {
    const kinds = async (extra: Partial<Record<string, Partial<Manifest>>>) => {
      const err = await bootVerified(fixture([], extra), { ifaces: table, resources }).catch(
        (e: unknown) => e as InstanceType<typeof ModuleBootError>,
      );
      return err instanceof ModuleBootError ? err.problems.map((p) => p.kind) : [];
    };
    expect(
      await kinds({
        watcher: { contributes: { "http.routes": [{ id: "sessions.routes", prefix: "/x" }] } },
      }),
    ).toEqual(["duplicate-id"]);
    expect(await kinds({ watcher: { contributes: { "http.nothing": [{ id: "w" }] } } })).toEqual([
      "no-such-slot",
    ]);
    expect(await kinds({ watcher: { provides: { w: "Missing" } } })).toEqual(["unknown-iface"]);
    expect(
      await kinds({ watcher: { requires: { s: { iface: "sessions#Sessions", from: "nobody" } } } }),
    ).toEqual(["unresolved"]);
  });

  it("refuses a parked context it cannot validate, and boots one it need not", async () => {
    const boot = (context: Manifest["context"], parked?: Record<string, unknown>) =>
      bootVerified(
        defineModule(manifest({ name: "solo", context }), {
          create: (_ctx, ctx) => ({ api: {}, park: () => ctx }),
        }),
        { ifaces: {}, resources, parked: parked as never },
      );
    await expect(
      boot({ version: 1, schema: { n: "number" } }, { solo: { v: 1, self: { n: 1 } } }),
    ).rejects.toThrow(/cannot validate/);
    await expect(boot({ version: 1, schema: { n: "number" } })).resolves.toBeDefined();
    await expect(boot({ version: 1 }, { solo: { v: 1, self: { n: 1 } } })).resolves.toBeDefined();
  });
});
