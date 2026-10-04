/**
 * Which Workspace files a block of a reply draws below itself, from the hrefs of its links: a link
 * that resolves to a Workspace file (lib/reply-link.ts, the same sorting the link's click uses)
 * whose extension a file renderer contribution lists (iface.ts `fileRenderers`). One entry per
 * distinct file, in the order the block first links it.
 *
 * Existence is not checked here, as it is not for the link itself: a renderer shows its own state
 * for a file that is not there.
 */
import { resolveReplyLink } from "../../lib/reply-link";
import type { FileRendererRule } from "./deps";
import type { FileRenderer } from "./iface";

export interface ReplyFile {
  /** Workspace-relative. */
  path: string;
  /** The last path segment. */
  name: string;
  url: string;
  Renderer: FileRenderer;
}

/** A file name's extension, lowercase, without the dot; "" when it has none (`.bashrc` has none). */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export interface ReplyFilesInput {
  /** The Session's absolute Workspace path. */
  workspace: string | null;
  /** The file renderer contributions, in module order. */
  rules: readonly FileRendererRule[];
  /** The URL a renderer fetches a Workspace-relative path from. */
  urlOf: (path: string) => string;
}

/** The files one block draws. The first contribution listing the extension draws it. */
export function replyFilesOf(hrefs: readonly string[], input: ReplyFilesInput): ReplyFile[] {
  const out: ReplyFile[] = [];
  const seen = new Set<string>();
  for (const href of hrefs) {
    const link = resolveReplyLink(href, input.workspace);
    if (link.kind !== "file" || seen.has(link.path)) continue;
    const name = link.path.slice(link.path.lastIndexOf("/") + 1);
    const ext = extensionOf(name);
    if (ext === "") continue;
    const rule = input.rules.find((r) => r.extensions.includes(ext));
    if (rule === undefined) continue;
    seen.add(link.path);
    out.push({
      path: link.path,
      name,
      url: input.urlOf(link.path),
      Renderer: rule.Renderer,
    });
  }
  return out;
}
