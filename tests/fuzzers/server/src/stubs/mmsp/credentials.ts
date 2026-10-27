/**
 * Inert stand-in for `@prismshadow/mmsp/credentials` (demo only).
 *
 * `routedClientType(modelId, clientType)` answers "which MMSP client does this entry reach":
 * its pinned client type, else the family the id's spelling begins with, or null where
 * nothing routes. The real table is MMSP's own; this stub keeps a small family table that
 * matches the families packages/server/src/model-catalog/client-protocols.ts keys its
 * CLIENT_PROTOCOLS by, and answers null for everything else. It is honest about being a
 * stand-in: any routing readout in the demo's transcripts comes from here, not from MMSP.
 */

const CANONICAL = new Set([
  "openai-official",
  "anthropic-official",
  "google-official",
  "zai-official",
  "moonshot-official",
  "deepseek-official",
  "minimax-official",
  "openai-responses",
  "openai-chat",
  "openai-chat-vllm-adapter",
  "openai-embedding",
  "ant-messages",
  "google-genai",
  "mmsp",
]);

const FAMILIES: ReadonlyArray<readonly [prefix: string, client: string]> = [
  ["claude", "anthropic-official"],
  ["gpt", "openai-official"],
  ["o1", "openai-official"],
  ["o3", "openai-official"],
  ["gemini", "google-official"],
  ["deepseek", "deepseek-official"],
  ["glm", "zai-official"],
  ["kimi", "moonshot-official"],
  ["minimax", "minimax-official"],
];

export function routedClientType(modelId: string, clientType: string | null): string | null {
  const pinned = clientType?.trim() ?? "";
  if (pinned !== "") return CANONICAL.has(pinned) ? pinned : null;
  for (const [prefix, client] of FAMILIES) {
    if (modelId.startsWith(prefix)) return client;
  }
  return null;
}
