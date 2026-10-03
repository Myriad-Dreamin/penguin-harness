/**
 * The browser's samples (PRFC-0008, the page's half): what `POST /api/telemetry/samples` lets
 * into the buffer. The page is a client like any other, so nothing it sends is trusted to be a
 * shape — every field is checked here and anything else is dropped, not stored:
 *
 * - the probe is a `web.*` name, so a browser can never pose as one of the server's probes;
 * - numbers are finite and not negative, strings are short, attributes are a few flat scalars;
 * - the only key a browser may set is `session` — a request id is the server's to hand out.
 *
 * A batch is capped, and so is each sample's attribute set, so one tab cannot fill the ring.
 */
import type { TelemetrySampleInput } from "../api/types.js";

/** Most samples one POST may carry; the page flushes well below it. */
export const BROWSER_BATCH_MAX = 200;

const PROBE = /^web\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const PROBE_MAX = 64;
const STRING_MAX = 64;
const ATTRS_MAX = 16;
const ATTR_KEY = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
/** Session ids as the server spells them; anything else is not a session key. */
const SESSION = /^[A-Za-z0-9_-]{1,128}$/;

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function shortString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= STRING_MAX
    ? value
    : undefined;
}

function attrsOf(value: unknown): Record<string, string | number | boolean> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  let kept = 0;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (kept >= ATTRS_MAX) break;
    if (!ATTR_KEY.test(key)) continue;
    const v =
      typeof raw === "boolean"
        ? raw
        : typeof raw === "number"
          ? Number.isFinite(raw)
            ? raw
            : undefined
          : shortString(raw);
    if (v === undefined) continue;
    out[key] = v;
    kept += 1;
  }
  return kept > 0 ? out : undefined;
}

/**
 * One sent sample as the buffer takes it, or null when it is not a browser sample at all
 * (no `web.*` probe). Fields that fail their check are left out rather than failing the sample.
 */
export function browserSample(raw: unknown): TelemetrySampleInput | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.probe !== "string" || r.probe.length > PROBE_MAX || !PROBE.test(r.probe)) {
    return null;
  }
  const durMs = count(r.durMs);
  const bytes = count(r.bytes);
  const status = shortString(r.status);
  const session = typeof r.session === "string" && SESSION.test(r.session) ? r.session : undefined;
  const attrs = attrsOf(r.attrs);
  return {
    probe: r.probe,
    ...(durMs !== undefined ? { durMs } : {}),
    ...(bytes !== undefined ? { bytes: Math.round(bytes) } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(session !== undefined ? { keys: { session } } : {}),
    ...(attrs !== undefined ? { attrs } : {}),
  };
}
