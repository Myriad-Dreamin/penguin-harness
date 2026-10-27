/**
 * The input format of the API leg: two control bytes, then free payload.
 *
 * libFuzzer mutates bytes and knows nothing about HTTP, so the target has to read a request
 * out of them. The layout is deliberately thin — every remaining decision (which pool id,
 * which body shape) is taken from the same bytes through `ByteChoices`, so a mutation moves
 * a whole request, not just the endpoint:
 *
 *     byte 0      endpoint index (`% specs.length`)
 *     byte 1      flags: bits 0-1 auth mode, bit 2 bad body, bit 3 clock jump, bit 4 raw body
 *     bytes 2…    payload: choice bytes, and the text a body field receives
 *
 * Seeds under `out/corpus/` are written in this format (see seed.ts); the crashing inputs
 * Jazzer.js saves are the same format, so a finding replays with `--mode=regression`.
 */
import type { Variant } from "../../specs/decode.js";

export type AuthMode = "anon" | "bearer" | "cookie";

export const FLAG_BAD_BODY = 0b000100;
export const FLAG_CLOCK_JUMP = 0b001000;
export const FLAG_RAW_BODY = 0b010000;

const AUTH_MODES: readonly AuthMode[] = ["anon", "bearer", "cookie", "anon"];

export interface ApiControls {
  specIndex: number;
  auth: AuthMode;
  variant: Variant;
  jump: boolean;
  /** Send the payload as the body verbatim instead of a generated JSON body. */
  rawBody: boolean;
  /** Bytes 2… — the corpus entry's own choices and text. */
  rest: Buffer;
}

export function decodeApiControls(data: Buffer, specCount: number): ApiControls {
  const byte = (index: number): number => (index < data.length ? data[index]! : 0);
  const flags = byte(1);
  return {
    specIndex: byte(0) % specCount,
    auth: AUTH_MODES[flags & 0b11] as AuthMode,
    variant: (flags & FLAG_BAD_BODY) !== 0 ? "bad" : "ok",
    jump: (flags & FLAG_CLOCK_JUMP) !== 0,
    rawBody: (flags & FLAG_RAW_BODY) !== 0,
    rest: data.subarray(2),
  };
}

/** The payload as text: printable ASCII, everything else folded to `x`. */
export function payloadText(bytes: Buffer, limit = 96): string {
  let text = "";
  for (const value of bytes.subarray(0, limit)) {
    text += value >= 0x20 && value <= 0x7e ? String.fromCharCode(value) : "x";
  }
  return text;
}

/**
 * Give the payload to the last string-valued leaf of a generated body.
 *
 * The last, not the first: a create body is `{ projectId, name }`, and taking the id would
 * only ever exercise the id validator — the name, the title, the path, the task text are
 * where the interesting string handling lives.
 */
export function withPayload(body: unknown, text: string): unknown {
  if (text === "" || body === null || typeof body !== "object") return body;
  replaceLastString(body, text);
  return body;
}

function replaceLastString(value: unknown, text: string): boolean {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index--) {
      const item: unknown = value[index];
      if (typeof item === "string") {
        value[index] = text;
        return true;
      }
      if (replaceLastString(item, text)) return true;
    }
    return false;
  }
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  for (let index = keys.length - 1; index >= 0; index--) {
    const key = keys[index] as string;
    if (typeof record[key] === "string") {
      record[key] = text;
      return true;
    }
    if (replaceLastString(record[key], text)) return true;
  }
  return false;
}
