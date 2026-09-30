/**
 * The chat route: the conversation page, unless the routed Session is a surface Session —
 * one a plugin renders (SessionInfo.surface) — in which case its surface's page is what
 * the route shows. Decided from the Session list, which is what the sidebar decided from;
 * a Session the list has not resolved yet renders as a conversation until it has.
 *
 * `?machine=<id>` names the machine the Session lives on, for a link from a page whose
 * answers the app never saw (a plugin page in a frame): the app learns a Session's machine
 * from the lists and organization answers it fetched itself, and without one the chat page's
 * lookup asks this server, hears 404 and falls back to the newest personal conversation. It
 * is recorded during render, before the chat page's lookup effect runs.
 */
import { useParams, useSearchParams } from "react-router";
import { rememberLinkedMachine } from "../../lib/session-machines";
import { useSessions } from "../../state/sessions";
import { ChatPage } from "./chat-page";
import { SurfaceSessionPage } from "./session-surface-view";

export function ChatRoute() {
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  if (sessionId) rememberLinkedMachine(sessionId, params.get("machine"));
  const { sessions } = useSessions();
  const listed = sessionId ? sessions.find((s) => s.sessionId === sessionId) : undefined;
  if (listed !== undefined && listed.surface !== undefined) {
    return <SurfaceSessionPage key={listed.sessionId} session={listed} />;
  }
  return <ChatPage />;
}
