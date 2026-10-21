/**
 * The SSE reader the fixtures use: the production one, which sits next to the writer it
 * parses (src/socket/sse-text.ts). The name stays `SseParser` because that is how the
 * fixtures read — a parser for what the writer emitted — not a second implementation of it.
 */
export { SseReader as SseParser } from "../../src/socket/sse-text.js";
