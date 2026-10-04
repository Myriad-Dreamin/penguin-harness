/**
 * The version of the module-tree check's SEMANTICS: what {@link checkTree} accepts given
 * the same tables. A verdict cached under one version (the web's verified plugin tables,
 * web lib/verified-cache.ts) is not trusted under another.
 *
 * Bump it when a change can turn a refused tree into an accepted one or the reverse:
 * a new or relaxed rule in ./check.ts, ./sig.ts or ./data.ts, a change to how tables are
 * merged or mounted (./tables.ts), or an arktype upgrade that changes what a definition
 * accepts. A refactor that keeps every verdict does not bump it.
 */
// 2: checkTables refuses a plugin whose copy of a host interface the host no longer satisfies.
export const CHECK_VERSION = 2;
