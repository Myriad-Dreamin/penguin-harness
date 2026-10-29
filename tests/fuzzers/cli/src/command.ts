/**
 * Run one CLI command behind the process-level guards.
 *
 * The exit guard turns the one hard `process.exit` face (`resolveApprovalMode` with an
 * invalid value) into an observable sentinel instead of a dead fuzz run; stdio is captured so
 * a command's output is available to the finding; the soft timeout turns a hang into a
 * finding rather than a stopped fuzzer.
 */
import { DemoProcessExit, captureStdio, installExitGuard } from "../../server/src/guards.js";
import { withSoftTimeout } from "../../server/src/timeout.js";

/** Per-command soft timeout — commands carry their own `--timeout` caps below this. */
export const COMMAND_SOFT_TIMEOUT_MS = 15_000;

export interface CommandOutcome {
  exitCode: number | null;
  ms: number;
  stdout: string;
  stderr: string;
  /** Non-null exactly when the command reached a process.exit the guard intercepted. */
  exitGuardCatch: { code: number | undefined; where: string } | null;
  /** Non-null when `cli()` rejected with something other than the exit-guard sentinel. */
  threw: Error | null;
  /** True when the soft timeout decided the race. */
  timedOut: boolean;
}

export async function runOneCommand(
  cli: (argv: string[]) => Promise<number>,
  argv: string[],
  options: { onDeadlineArmed?: (handle: unknown) => void } = {},
): Promise<CommandOutcome> {
  const guard = installExitGuard();
  const io = captureStdio();
  const startedAt = performance.now();
  let exitCode: number | null = null;
  let exitGuardCatch: CommandOutcome["exitGuardCatch"] = null;
  let threw: Error | null = null;
  let timedOut = false;
  try {
    const raced = await withSoftTimeout(cli(argv), COMMAND_SOFT_TIMEOUT_MS, {
      ...(options.onDeadlineArmed !== undefined
        ? { onArm: options.onDeadlineArmed }
        : {}),
    });
    if (raced.ok) {
      exitCode = raced.value;
    } else if (raced.threw instanceof DemoProcessExit) {
      // The known hard-exit face: the guard's sentinel arrives through the rejection channel,
      // and the code the command asked for is in the guard's own record.
      exitGuardCatch = guard.calls[guard.calls.length - 1] ?? {
        code: raced.threw.code,
        where: "?",
      };
      exitCode = exitGuardCatch.code ?? null;
    } else if (raced.threw !== null) {
      threw = raced.threw;
    } else {
      timedOut = true;
    }
  } catch (err) {
    // Defensive: withSoftTimeout settles every path, so this only fires on a bug in the
    // wrapper itself — still recorded rather than crashing the run.
    threw = err instanceof Error ? err : new Error(String(err));
  } finally {
    io.restore();
    guard.uninstall();
  }
  return {
    exitCode,
    ms: Math.round(performance.now() - startedAt),
    stdout: io.out.join(""),
    stderr: io.err.join(""),
    exitGuardCatch,
    threw,
    timedOut,
  };
}
