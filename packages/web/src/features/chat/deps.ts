/**
 * What the chat module binds into its page (lib/module-deps.tsx): the `sessionTabs` and
 * `fileRenderers` contributions (iface.ts), read once at boot.
 */
import type { Contributed } from "@prismshadow/penguin-core/kernel";
import { createDeps } from "../../lib/module-deps";
import type { FileRenderer, FileRendererData, SessionTab, SessionTabData } from "./iface";

export interface ChatDeps {
  /** By `order`, top first. */
  sessionTabs: ReadonlyArray<{ id: string; Tab: SessionTab }>;
  /** The file renderers, in module order: the first whose extensions list a file draws it. */
  fileRenderers: readonly FileRendererRule[];
}

export const chatDeps = createDeps<ChatDeps>();

/** The `sessionTabs` contributions as the page mounts them. */
export function sessionTabsOf(contributions: readonly Contributed[]): ChatDeps["sessionTabs"] {
  return [...contributions]
    .sort(
      (a, b) =>
        (a.data as unknown as SessionTabData).order - (b.data as unknown as SessionTabData).order,
    )
    .map((c) => ({ id: c.id, Tab: c.code as SessionTab }));
}

/** One file renderer contribution as the conversation reads it. */
export interface FileRendererRule {
  id: string;
  /** Lowercase, without the dot; never empty. */
  extensions: readonly string[];
  Renderer: FileRenderer;
}

/**
 * The `fileRenderers` contributions as rules, in module order: extensions lowercased and dropped
 * of a leading dot. The kernel checked each contribution's data against the slot's type.
 */
export function fileRenderersOf(contributions: readonly Contributed[]): ChatDeps["fileRenderers"] {
  return contributions.flatMap((c) => {
    const { extensions } = c.data as unknown as FileRendererData;
    const exts = extensions.map((e) => e.replace(/^\./, "").toLowerCase()).filter((e) => e !== "");
    return exts.length === 0
      ? []
      : [{ id: c.id, extensions: exts, Renderer: c.code as FileRenderer }];
  });
}
