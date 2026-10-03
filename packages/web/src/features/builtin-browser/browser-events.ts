/**
 * The agent browser's user-channel events, fanned out from the one `/api/events` connection
 * (state/sessions.tsx hands them to `builtinBrowserUserEvents`, this feature's contribution to
 * `SessionsModule.userEvents`) to the browser layer (browser-layer.tsx), whose follower and page
 * host are the subscribers. Module level and free of dependencies, because the connection outlives every
 * page and the session list's store has no business knowing what the browser does with them.
 *
 * Each event names the server it came from, null for this one: a machine's user channel carries
 * the events of that machine's browser, which go to that machine's state (browser-servers.ts).
 */
import type { BuiltinBrowserServerEvent, ServerEvent } from "@prismshadow/penguin-server/api";
import type { UserEventHandler } from "../../state/user-events";

export function isBuiltinBrowserEvent(ev: ServerEvent): ev is BuiltinBrowserServerEvent {
  return (
    ev.type === "builtin_browser_tabs" ||
    ev.type === "builtin_browser_open" ||
    ev.type === "builtin_browser_close" ||
    ev.type === "builtin_browser_activity" ||
    ev.type === "builtin_browser_metrics" ||
    ev.type === "builtin_browser_backend" ||
    ev.type === "builtin_browser_extension"
  );
}

type Listener = (ev: BuiltinBrowserServerEvent, server: string | null) => void;
type ResyncListener = (server: string | null) => void;

const listeners = new Set<Listener>();
const resyncListeners = new Set<ResyncListener>();

function publishBuiltinBrowserEvent(ev: BuiltinBrowserServerEvent, server: string | null): void {
  for (const listener of [...listeners]) listener(ev, server);
}

export function subscribeBuiltinBrowserEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A server's user channel reconnected past its replay buffer (`resync_required`): browser
 * events may have been lost with the rest, so the layer re-reads that server's registry and
 * drops activity marks nothing will ever clear.
 */
function publishBuiltinBrowserResync(server: string | null): void {
  for (const listener of [...resyncListeners]) listener(server);
}

export function subscribeBuiltinBrowserResync(listener: ResyncListener): () => void {
  resyncListeners.add(listener);
  return () => {
    resyncListeners.delete(listener);
  };
}

/**
 * The browser's handler on the user event stream: its tabs, page requests, agent activity,
 * backend and Chrome connection, each named by the server it came from. A machine's server
 * drives a browser of its own (the Chrome on that machine), which the Browser panel of a
 * conversation there shows; its events and resyncs go to that machine's state and never touch
 * this server's browser.
 */
export const builtinBrowserUserEvents: UserEventHandler = {
  event: (ev, source) => {
    if (isBuiltinBrowserEvent(ev)) publishBuiltinBrowserEvent(ev, source);
  },
  resync: (source) => publishBuiltinBrowserResync(source),
};
