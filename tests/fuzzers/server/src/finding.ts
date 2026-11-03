/**
 * The record one finding leaves behind: the input, and nothing else.
 *
 * Every input starts from the same clean state (see `park.ts`: each input's rig is parked and
 * released inside the running fuzzer), so the input bytes alone are the whole reproduction — a
 * finding needs no archived database, no file tree, no rig. What a kit carries:
 *
 *   kind.txt    what kind of finding it is — `soft-timeout`, `invariant`, `crash` — and the
 *               message, so a reader does not have to guess from a stack
 *   input.bin   the input bytes, beside libFuzzer's own copy (the two cannot drift apart)
 *   kit.json    the calls that led here, in order, and the run's own reading: counters, clock
 *
 * Writing the kit must never be the reason a finding is lost: every step is best effort, and a
 * failure leaves a directory with whatever made it. Kits written by older builds may also carry
 * `web.db` and `root/` — `replay.ts` still runs those against their saved state.
 */
import fs from "node:fs";
import path from "node:path";

export interface FindingKit {
  leg: "cli" | "server";
  /** The error the leg is about to rethrow. */
  error: Error;
  /** The input bytes, exactly as libFuzzer handed them to `fuzz`. */
  input: Buffer;
  /** The calls that led here, in order — the last one is the failing one. */
  calls: readonly string[];
  /** The rig's own reading: epoch, counters, clock. */
  state: Record<string, unknown>;
}

/** Which face of the rig the error came from — the classification a run summary names. */
export function findingKind(error: Error): "soft-timeout" | "invariant" | "crash" {
  const message = error.message;
  if (/soft timeout|did not settle/i.test(message)) return "soft-timeout";
  if (/broke an invariant/i.test(message)) return "invariant";
  return "crash";
}

/** Write the kit; returns the directory, or "" when even the directory could not be made. */
export function writeFindingKit(outDir: string, kit: FindingKit): string {
  let dir: string;
  try {
    fs.mkdirSync(outDir, { recursive: true });
    dir = fs.mkdtempSync(path.join(outDir, `${kit.leg}-finding-`));
  } catch {
    return "";
  }

  const attempt = (name: string, write: () => void): void => {
    try {
      write();
    } catch {
      // The kit is a convenience; a missing file is one line less, not a lost finding.
      console.error(`[finding] could not write ${name} in ${dir}`);
    }
  };

  const kind = findingKind(kit.error);
  attempt("kind.txt", () =>
    fs.writeFileSync(
      path.join(dir, "kind.txt"),
      `${kind}\n${kit.error.message}\n${kit.error.stack ?? ""}\n`,
      "utf8",
    ),
  );
  attempt("input.bin", () => fs.writeFileSync(path.join(dir, "input.bin"), kit.input));
  attempt("kit.json", () =>
    fs.writeFileSync(
      path.join(dir, "kit.json"),
      `${JSON.stringify(
        { leg: kit.leg, kind, message: kit.error.message, calls: kit.calls, state: kit.state },
        null,
        2,
      )}\n`,
      "utf8",
    ),
  );
  return dir;
}
