/**
 * One global the driven product code expects and this program would otherwise lack.
 *
 * `packages/amsp/src/sse.ts` names `ReadableStreamReadResult` bare. Its own tsconfig adds
 * the DOM lib, which is where the name comes from; the fuzzers' program runs without DOM
 * (see tsconfig.base.json), and Node's own typing spells this as a member of the
 * `stream/web` module rather than a global. The shape below is that member's: a read either
 * yields a value or reports the stream done, and a done read carries no value.
 */
type ReadableStreamReadResult<T> = { done: false; value: T } | { done: true; value?: T };

/**
 * Jazzer.js's bug-detector configuration accessor.
 *
 * The package is a dependency of the fuzzer installed under `tests/fuzzers`, not of the
 * workspace, so its declarations are not on this program's resolution path. Only what the
 * targets call is spelled out — see `server/src/bug-detectors.ts` for why they call it.
 */
declare module "@jazzer.js/bug-detectors" {
  export function getBugDetectorConfiguration(
    name: string,
  ): { addPermittedTCPConnection(hostname: string, port: number): unknown } | undefined;
}
