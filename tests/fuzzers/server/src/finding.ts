/**
 * The replay kit one finding leaves behind.
 *
 * libFuzzer saves the input that tripped a finding, and that input is the whole sequence of
 * calls — but a sequence only means what it meant on the rig it ran on: which Sessions existed,
 * which rows the ids in the pool named, what the clock said. That state is why a finding is
 * reproducible here at all, and it is gone the moment a later epoch replaces the rig.
 *
 * So a leg that throws writes, before it rethrows, the four things a second person needs:
 *
 *   kind.txt    what kind of finding it is — `soft-timeout`, `invariant`, `crash` — and the
 *               message, so a reader does not have to guess from a stack
 *   input.bin   the input bytes, beside libFuzzer's own copy (the two cannot drift apart)
 *   kit.json    the calls that led here, in order, and the rig's own reading: epoch, counters,
 *               clock, pending timers
 *   web.db      a copy of the live SQLite file — the state the input was run against
 *
 * Writing the kit must never be the reason a finding is lost: every step is best effort, and a
 * failure leaves a directory with whatever made it.
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
  /** The live database to copy, when the leg has one. */
  dbPath?: string;
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
  if (kit.dbPath !== undefined) {
    // The write-ahead log is where the newest rows are: copying the main file alone would hand
    // the next person a database that stops before the finding.
    for (const suffix of ["", "-wal", "-shm"] as const) {
      const from = `${kit.dbPath}${suffix}`;
      if (!fs.existsSync(from)) continue;
      attempt(`web.db${suffix}`, () =>
        fs.copyFileSync(from, path.join(dir, `web.db${suffix}`)),
      );
    }
  }
  return dir;
}
