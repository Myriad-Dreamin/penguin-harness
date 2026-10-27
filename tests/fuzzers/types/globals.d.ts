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
