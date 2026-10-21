/**
 * Quoting for the far side's shell. An ssh session carries a COMMAND, not an argv: whatever
 * this side wants the machine to run has to survive that machine's `sh` intact, whether it is
 * the provider's `exec` (its argv, its environment) or the machine commands an install
 * builds. One definition, because two would eventually disagree about a path with a quote in
 * it — which is exactly the path nobody tests by hand.
 *
 * `cmd.exe`, which a Windows remote hands us instead, does not quote at all: there is no
 * escape for `"` inside a quoted string there, so the machine layer's `cmdQuote` refuses such
 * a value rather than guess. Nothing here is used for it.
 */

/** Wraps a value for a POSIX remote shell. Single quotes are literal there, except `'` itself. */
export function shQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
