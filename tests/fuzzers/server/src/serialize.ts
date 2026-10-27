/**
 * Serialization of one sequence line — the artifact contract, in one place.
 *
 * `out/*.jsonl` is the run's sequence: the same seed must write the same bytes, so this is
 * where the run's own volatile values leave the record.
 *
 *   - Wall-clock timing (`observed.ms`) stays in the transcript, not in the sequence. A
 *     duration is a fact about the machine, not about the call.
 *   - Every id the run captured out of an earlier response is written as its provenance
 *     (`$sessions[0]`), never as the value. Server-minted ids carry the real clock and a
 *     random suffix (trace-service mints `session-<date>-<time>-<rand>`), so the concrete
 *     value differs between two runs of the same seed even though the sequence does not.
 *   - The disposable root the demo boots over becomes `$root`, for the same reason: mkdtemp
 *     names it.
 *
 * Nothing else is rewritten — the request (method/path/auth/body) and the command line
 * (argv) stay exactly as the run sent them, so the artifact still is the serialization
 * format it claims to be.
 */

/** The pools a leg captures ids into; every entry is written as `$<pool>[<index>]`. */
export interface PoolValues {
  projects?: readonly string[];
  agents?: readonly string[];
  sessions?: readonly string[];
  schedules?: readonly string[];
  users?: readonly string[];
}

export interface Token {
  value: string;
  token: string;
}

/**
 * The substitutions for one run. Longest value first, so a value that contains another one
 * (a path inside a longer path) is replaced whole rather than piecemeal.
 */
export function tokensOf(pools: PoolValues, root: string): Token[] {
  const tokens: Token[] = [];
  if (root !== "") tokens.push({ value: root, token: "$root" });
  const entries = Object.entries(pools) as Array<[keyof PoolValues, readonly string[] | undefined]>;
  for (const [name, values] of entries) {
    (values ?? []).forEach((value, index) => {
      if (value !== "") tokens.push({ value, token: `$${name}[${index}]` });
    });
  }
  return tokens.sort((a, b) => b.value.length - a.value.length);
}

/** Replace every captured value in an already-serialized line with its provenance. */
export function tokenize(json: string, tokens: readonly Token[]): string {
  let out = json;
  for (const { value, token } of tokens) out = out.split(value).join(token);
  return out;
}

/**
 * One artifact line: the line without its timing, with captured values tokenized. The key
 * order of the input is kept, so the file's shape is the shape the legs record.
 */
export function serializeLine<T extends { observed: { ms?: number | null } }>(
  line: T,
  tokens: readonly Token[],
): string {
  const { ms: _ms, ...observed } = line.observed;
  return tokenize(JSON.stringify({ ...line, observed }), tokens);
}
