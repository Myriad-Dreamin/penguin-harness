/**
 * Process-level guards for the demo run — none of them touch the harness sources; they are
 * installed by the demo entry around the sections that need them.
 *
 *  - outbound guard: wraps global fetch plus the node http/https/net client entry points.
 *    Loopback (127.0.0.1 / localhost / ::1) passes — the CLI section drives the real HTTP
 *    serialization path against an in-process listener. Anything else is recorded and
 *    blocked with a throw, so no packet can leave. The demo asserts the attempt list is empty.
 *  - exit guard: `process.exit` is replaced by a throwing sentinel while a CLI command runs,
 *    so the two known hard-exit faces (resolveApprovalMode / resolveThinkingLevel with an
 *    invalid value) are observable instead of fatal (the known face is exercised on purpose
 *    by one scripted corpus step).
 *  - stdio capture: swaps process.stdout/stderr writes for a collector while a CLI command
 *    runs, so the transcript can quote what the command printed.
 */

import { createRequire } from "node:module";

const requireBuiltin = createRequire(import.meta.url);

export interface OutboundAttempt {
  kind: "fetch" | "http.request" | "https.request" | "net.connect";
  target: string;
}

export interface OutboundGuard {
  attempts: OutboundAttempt[];
  uninstall(): void;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", undefined, "0.0.0.0"]);

function loopback(host: string | undefined): boolean {
  return LOOPBACK_HOSTS.has(host);
}

export function installOutboundGuard(): OutboundGuard {
  const attempts: OutboundAttempt[] = [];
  const block = (kind: OutboundAttempt["kind"], target: string): never => {
    attempts.push({ kind, target });
    throw new Error(`demo outbound guard: ${kind} to ${target} is outside the demo's bounds`);
  };

  const originalFetch = globalThis.fetch;
  type FetchInput = Parameters<typeof fetch>[0];
  globalThis.fetch = ((input: FetchInput | URL, init?: RequestInit) => {
    let target = "";
    try {
      target =
        typeof input === "string"
          ? new URL(input).host
          : input instanceof URL
            ? input.host
            : new URL(String((input as Request).url)).host;
    } catch {
      target = String(input);
    }
    const host = target.split(":")[0] ?? "";
    if (!loopback(host)) block("fetch", target);
    return originalFetch(input as FetchInput, init);
  }) as typeof fetch;

  const http = requireBuiltin("node:http") as Record<string, unknown>;
  const https = requireBuiltin("node:https") as Record<string, unknown>;
  const net = requireBuiltin("node:net") as Record<string, unknown>;

  const patchRequest = (
    mod: Record<string, unknown>,
    kind: "http.request" | "https.request",
    original: (options: unknown, cb?: unknown) => unknown,
  ) =>
    ((options: unknown, cb?: unknown) => {
      const o =
        typeof options === "string"
          ? new URL(options)
          : (options as { host?: string; hostname?: string });
      const host =
        (o as URL).hostname ?? (o as { host?: string; hostname?: string }).host ?? undefined;
      if (!loopback(host)) block(kind, String((o as URL).host ?? host));
      return original(options, cb);
    }) as typeof original;

  const patchConnect = (original: (options: unknown, cb?: unknown) => unknown) =>
    ((options: unknown, cb?: unknown) => {
      const o = typeof options === "string" ? new URL(options) : (options as { host?: string });
      const host = (o as URL).hostname ?? (o as { host?: string }).host ?? undefined;
      if (!loopback(host)) block("net.connect", String(host));
      return original(options, cb);
    }) as typeof original;

  const originals: Array<[Record<string, unknown>, string, unknown]> = [];
  for (const [mod, kind] of [
    [http, "http.request"],
    [https, "https.request"],
  ] as const) {
    for (const name of ["request", "get"] as const) {
      originals.push([mod, name, mod[name]]);
      mod[name] = patchRequest(
        mod,
        kind as "http.request",
        mod[name] as (options: unknown, cb?: unknown) => unknown,
      );
    }
  }
  for (const name of ["connect", "createConnection"] as const) {
    originals.push([net, name, net[name]]);
    net[name] = patchConnect(net[name] as (options: unknown, cb?: unknown) => unknown);
  }

  return {
    attempts,
    uninstall() {
      globalThis.fetch = originalFetch;
      for (const [mod, name, original] of originals) mod[name] = original;
    },
  };
}

export class DemoProcessExit extends Error {
  constructor(public readonly code: number | undefined) {
    super(`demo exit guard: process.exit(${code ?? ""}) intercepted`);
    this.name = "DemoProcessExit";
  }
}

export interface ExitGuard {
  calls: Array<{ code: number | undefined; where: string }>;
  uninstall(): void;
}

export function installExitGuard(): ExitGuard {
  const calls: Array<{ code: number | undefined; where: string }> = [];
  const original = process.exit;
  process.exit = ((code?: number) => {
    calls.push({ code, where: new Error().stack?.split("\n")[2]?.trim() ?? "?" });
    throw new DemoProcessExit(code);
  }) as typeof process.exit;
  return {
    calls,
    uninstall() {
      process.exit = original;
    },
  };
}

export interface IoCapture {
  out: string[];
  err: string[];
  restore(): void;
}

export function captureStdio(): IoCapture {
  const out: string[] = [];
  const err: string[] = [];
  const so = process.stdout.write.bind(process.stdout);
  const se = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    err.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  return {
    out,
    err,
    restore() {
      process.stdout.write = so;
      process.stderr.write = se;
    },
  };
}
