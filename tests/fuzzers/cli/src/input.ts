/**
 * The input format of the CLI leg: a sequence of commands, each one record of two control
 * bytes and free payload.
 *
 *     byte 0      command index (`% specs.length`)
 *     byte 1      flags: bit 0 bad variant (the corpus's own "bad" argv shape)
 *     bytes 2…    payload: choice bytes for the argv's slots, and the text a `-m`/`-t`
 *                 value receives
 *
 * Same contract as the API leg's `input.ts`: `splitRecords` cuts one input into commands at
 * every newline, seeds and crash files are this format, and `--mode=regression` replays them —
 * a finding being a whole sequence, the commands that led to it replay with it.
 */
import type { Variant } from "../../specs/decode.js";
import { payloadText } from "../../server/src/input.js";

export const FLAG_BAD_VARIANT = 0b1;

export interface CliControls {
  specIndex: number;
  variant: Variant;
  /** Bytes 2… of this record — this command's own choices and text. */
  rest: Buffer;
  /** The payload as text, ready for a `-m`/`-t` value (empty when the record is too short). */
  text: string;
}

export function decodeCliControls(record: Buffer, specCount: number): CliControls {
  const byte = (index: number): number => (index < record.length ? record[index]! : 0);
  const flags = byte(1);
  return {
    specIndex: byte(0) % specCount,
    variant: (flags & FLAG_BAD_VARIANT) !== 0 ? "bad" : "ok",
    rest: record.subarray(2),
    text: payloadText(record.subarray(2)),
  };
}
