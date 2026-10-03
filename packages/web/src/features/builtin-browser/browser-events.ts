/**
 * The agent browser's user-channel events, fanned out from the one `/api/events` connection
 * (state/sessions.tsx hands them to `builtinBrowserUserEvents`, this feature's contribution to
 * `SessionsModule.userEvents`) to the browser layer (browser-layer.tsx), whose follower and page
 * host are the subscribers. Module level and free of dependencies, because the connection outlives every
 * page and the session list's store has no business knowing what the browser does with them.
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

type Listener = (ev: BuiltinBrowserServerEvent) => void;

const listeners = new Set<Listener>();
const resyncListeners = new Set<() => void>();

function publishBuiltinBrowserEvent(ev: BuiltinBrowserServerEvent): void {
  for (const listener of [...listeners]) listener(ev);
}

export function subscribeBuiltinBrowserEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The user channel reconnected past its replay buffer (`resync_required`): browser events
 * may have been lost with the rest, so the layer re-reads the registry and drops activity
 * marks nothing will ever clear.
 */
function publishBuiltinBrowserResync(): void {
  for (const listener of [...resyncListeners]) listener();
}

export function subscribeBuiltinBrowserResync(listener: () => void): () => void {
  resyncListeners.add(listener);
  return () => {
    resyncListeners.delete(listener);
  };
}

/**
 * The browser's handler on the user event stream: its tabs, page requests, agent activity,
 * backend and Chrome connection. Only this server's events and resyncs count: the built-in pages
 * live in the desktop shell that spawned it, the user's Chrome is paired to it, and a machine's
 * server drives no browser on this screen.
 */
export const builtinBrowserUserEvents: UserEventHandler = {
  event: (ev, source) => {
    if (source === null && isBuiltinBrowserEvent(ev)) publishBuiltinBrowserEvent(ev);
  },
  resync: (source) => {
    if (source === null) publishBuiltinBrowserResync();
  },
};
