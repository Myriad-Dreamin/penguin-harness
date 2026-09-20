/**
 * A channel composer's draft storage: one key per user × Project × organization × channel,
 * the text and its picked mentions, and no empty shells left behind.
 */
import { describe, expect, it } from "vitest";
import {
  channelDraftKey,
  loadChannelDraft,
  storeChannelDraft,
} from "../src/features/company/channel-draft";
import type { DraftStorage } from "../src/features/chat/draft-cache";

/** In-memory storage (vitest runs in a Node environment, no localStorage). */
function memStorage(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const plain = (text: string) => ({ text, mentions: [] });

describe("channel drafts", () => {
  it("keeps a draft per user, Project, organization and channel", () => {
    const keys = new Set([
      channelDraftKey("alice", "p1", "acme", "dev"),
      channelDraftKey("bob", "p1", "acme", "dev"),
      channelDraftKey("alice", "p2", "acme", "dev"),
      channelDraftKey("alice", "p1", "other", "dev"),
      channelDraftKey("alice", "p1", "acme", "ops"),
    ]);
    expect(keys.size).toBe(5);
  });

  it("gives back what was stored, and nothing for a channel never typed in", () => {
    const storage = memStorage();
    const key = channelDraftKey("alice", "p1", "acme", "dev");
    expect(loadChannelDraft(key, storage)).toEqual(plain(""));
    storeChannelDraft(key, plain("@ceo 先看一下\nsecond line"), storage);
    expect(loadChannelDraft(key, storage)).toEqual(plain("@ceo 先看一下\nsecond line"));
    expect(loadChannelDraft(channelDraftKey("alice", "p1", "acme", "ops"), storage)).toEqual(
      plain(""),
    );
  });

  it("keeps a picked mention, so the restored name still sends its id", () => {
    const storage = memStorage();
    const key = channelDraftKey("alice", "p1", "acme", "dev");
    const draft = {
      text: "请 @Ada Lovelace 看一下",
      mentions: [{ start: 2, label: "Ada Lovelace", wire: "acme_ada" }],
    };
    storeChannelDraft(key, draft, storage);
    expect(loadChannelDraft(key, storage)).toEqual(draft);
  });

  it("keeps the text but drops mentions that no longer line up with it", () => {
    const storage = memStorage();
    const key = channelDraftKey("alice", "p1", "acme", "dev");
    storage.setItem(
      key,
      JSON.stringify({ text: "hi @Ada", mentions: [{ start: 0, label: "Ada", wire: "ada" }] }),
    );
    expect(loadChannelDraft(key, storage)).toEqual(plain("hi @Ada"));
  });

  it("deletes the key when the box is emptied, rather than storing an empty draft", () => {
    const storage = memStorage();
    const key = channelDraftKey("alice", "p1", "acme", "dev");
    storeChannelDraft(key, plain("half a sentence"), storage);
    storeChannelDraft(key, plain(""), storage);
    expect(storage.map.size).toBe(0);
  });

  it("reads an unreadable entry as no draft", () => {
    const storage = memStorage();
    const key = channelDraftKey("alice", "p1", "acme", "dev");
    storage.setItem(key, "{not json");
    expect(loadChannelDraft(key, storage)).toEqual(plain(""));
  });
});
