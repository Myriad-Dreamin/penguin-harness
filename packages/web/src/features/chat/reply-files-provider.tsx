/**
 * Draws the Workspace files a reply links below the paragraph that links them: the chat module's
 * `fileRenderers` contributions (iface.ts — each one's extensions and its component) joined with
 * the open conversation's Workspace, handed to the reply's Markdown as a block trailer (the UI
 * package's ProseBlockTrailerProvider). The Markdown is not changed: a link stays a link and
 * keeps its click.
 *
 * A renderer may be a plugin's lazy component (the music example's player): each is drawn under
 * its own `<Deferred>`, which draws nothing until its code has loaded, and turns a renderer that
 * fails to load or to render into the part-failed notice in its place — the link above it still
 * opens the file.
 *
 * Two parts, because the trailer is built where the chat page's state is and applied where a
 * reply is drawn: `ReplyFilesProvider` sits in the chat page's ChatSessionProvider and builds it
 * once per conversation; `ReplyTrailer` wraps an assistant reply's body only — reasoning and
 * compaction summaries are not replies. Outside the chat page (a test rendering the stream alone)
 * nothing is provided and a reply renders as it always has.
 *
 * Every nested reply (a subagent's) shares the conversation's Workspace, so its files are fetched
 * through the conversation's own Session.
 */
import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { ProseBlockTrailerProvider } from "@prismshadow/penguin-ui";
import type { ProseBlockTrailer } from "@prismshadow/penguin-ui";
import * as api from "../../api/endpoints";
import { ChatSessionContext } from "../../lib/chat-session";
import { Deferred } from "../../components/ui/deferred";
import { chatDeps } from "./deps";
import { replyFilesOf } from "./reply-files";

const ReplyTrailerContext = createContext<ProseBlockTrailer | null>(null);

export function ReplyFilesProvider({ children }: { children: ReactNode }) {
  const { fileRenderers: rules } = chatDeps.useDeps();
  const selected = useContext(ChatSessionContext)?.selected ?? null;
  const sessionId = selected?.sessionId ?? null;
  const workspace = selected?.workspace ?? null;
  // Built from values, not from the session object (a fresh one every render): a new trailer
  // re-renders every paragraph of the transcript.
  const trailer = useMemo<ProseBlockTrailer | null>(() => {
    if (sessionId === null || rules.length === 0) return null;
    const input = {
      workspace,
      rules,
      urlOf: (path: string) => api.workspaceFileUrl(sessionId, path),
    };
    return (hrefs) => {
      const files = replyFilesOf(hrefs, input);
      if (files.length === 0) return null;
      return (
        <div data-reply-files className="my-2 flex flex-col gap-2">
          {files.map(({ path, name, url, Renderer }) => (
            // A renderer is often a plugin's: one that throws, or whose chunk is gone after a
            // rebuild, shows the part-failed notice in its own place, never more.
            <Deferred key={path} fallback={null}>
              <Renderer url={url} path={path} name={name} />
            </Deferred>
          ))}
        </div>
      );
    };
  }, [sessionId, workspace, rules]);
  return <ReplyTrailerContext.Provider value={trailer}>{children}</ReplyTrailerContext.Provider>;
}

/** Applies the conversation's trailer to the reply body below. */
export function ReplyTrailer({ children }: { children: ReactNode }) {
  const trailer = useContext(ReplyTrailerContext);
  return <ProseBlockTrailerProvider trailer={trailer}>{children}</ProseBlockTrailerProvider>;
}
