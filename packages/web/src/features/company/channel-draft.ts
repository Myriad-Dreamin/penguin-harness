/**
 * A channel composer's unsent draft, kept across leaving the channel and reloading the page.
 *
 * Cached in localStorage per "user × Project × organization × channel" — the user dimension
 * for the same reason the chat drafts carry it (draft-cache.ts): two accounts on one browser
 * must not read each other's unsent words. What is kept is the composer's whole draft — the
 * text and its picked mentions (mention-draft.ts) — in the shape the composer's own clipboard
 * type uses, so a restored `@Ada Lovelace` still sends the id it was picked for.
 *
 * The write strategy is the session composer's (use-session-draft.ts): typing is debounced, an
 * edit still waiting for its timer is flushed when the channel changes or the view unmounts,
 * an emptied box deletes the key rather than leaving a shell per channel, and a successful
 * send cancels the pending write first — otherwise it would put the sent text back.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../../state/auth";
import { clearDraft } from "../chat/draft-cache";
import type { DraftStorage } from "../chat/draft-cache";
import { EMPTY_DRAFT, mentionEnd, serializeClip } from "./mention-draft";
import type { DraftMention, MentionDraft } from "./mention-draft";

const SAVE_DEBOUNCE_MS = 300;

export const channelDraftKey = (
  userId: string,
  projectId: string,
  orgId: string,
  channelId: string,
): string => `penguin.channelDraft.${userId}.${projectId}.${orgId}.${channelId}`;

/**
 * The mentions of a stored draft, or none when any of them does not read `@<label>` where it
 * claims to: the text is what the person typed and is kept regardless, while a mention that
 * no longer lines up with it would send to someone the box does not show.
 */
function storedMentions(text: string, raw: unknown): DraftMention[] {
  if (!Array.isArray(raw)) return [];
  const kept: DraftMention[] = [];
  let end = 0;
  for (const item of raw as unknown[]) {
    const { start, label, wire } = (item ?? {}) as Record<string, unknown>;
    if (typeof start !== "number" || !Number.isInteger(start) || start < end) return [];
    if (typeof label !== "string" || typeof wire !== "string") return [];
    const m = { start, label, wire };
    end = mentionEnd(m);
    if (text.slice(start, end) !== `@${label}`) return [];
    kept.push(m);
  }
  return kept;
}

export function loadChannelDraft(key: string, storage: DraftStorage = localStorage): MentionDraft {
  let data: unknown;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return EMPTY_DRAFT;
    data = JSON.parse(raw);
  } catch {
    return EMPTY_DRAFT;
  }
  const { text, mentions } = (data ?? {}) as { text?: unknown; mentions?: unknown };
  if (typeof text !== "string" || text === "") return EMPTY_DRAFT;
  return { text, mentions: storedMentions(text, mentions) };
}

/** Writes the draft, or deletes the key when there is nothing left to keep. */
export function storeChannelDraft(
  key: string,
  draft: MentionDraft,
  storage: DraftStorage = localStorage,
): void {
  if (draft.text === "") {
    clearDraft(key, storage);
    return;
  }
  try {
    storage.setItem(key, serializeClip(draft));
  } catch {
    /* Write fails under quota limits/private browsing: the draft cache is best-effort */
  }
}

export function useChannelDraft(
  projectId: string,
  orgId: string,
  channelId: string,
): {
  /** Identifies the draft: the composer remounts on it, so it starts from `initial`. */
  key: string | null;
  initial: MentionDraft;
  onDraftChange: (draft: MentionDraft) => void;
  /** Drops the draft after a successful send. */
  discard: () => void;
} {
  // No user (should not happen under RequireAuth) disables the cache: never an account-less key.
  const userId = useAuth().user?.userId ?? null;
  const key = userId === null ? null : channelDraftKey(userId, projectId, orgId, channelId);
  const initial = useMemo(() => (key === null ? EMPTY_DRAFT : loadChannelDraft(key)), [key]);

  const draftRef = useRef(initial);
  const timer = useRef<number | null>(null);

  const cancelPending = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const persistNow = useCallback(() => {
    cancelPending();
    if (key !== null) storeChannelDraft(key, draftRef.current);
  }, [cancelPending, key]);

  // Another channel, or leaving: the cleanup flushes the old channel's pending edit (its
  // closure still holds the old key), then setup starts from the new channel's draft.
  useEffect(() => {
    draftRef.current = initial;
    return () => {
      if (timer.current !== null) persistNow();
    };
  }, [initial, persistNow]);

  const onDraftChange = useCallback(
    (draft: MentionDraft) => {
      draftRef.current = draft;
      cancelPending();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        persistNow();
      }, SAVE_DEBOUNCE_MS);
    },
    [cancelPending, persistNow],
  );

  const discard = useCallback(() => {
    cancelPending();
    draftRef.current = EMPTY_DRAFT;
    if (key !== null) clearDraft(key);
  }, [cancelPending, key]);

  return { key, initial, onDraftChange, discard };
}
