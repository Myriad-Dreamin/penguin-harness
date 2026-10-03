/**
 * The chat page: the conversation, or a surface Session's page (chat-route.tsx), with the tabs
 * other modules contribute beside the conversation (`sessionTabs`, iface.ts) and the named
 * renderers for the Workspace files a reply links (`fileRenderers`); its drafts for the surfaces
 * that start and list them; and the two dock panels that show the conversation itself: its
 * subagents and its memory (panels/).
 */
import type { ComponentType } from "react";
import { Bind, Module, Provide } from "@prismshadow/penguin-core/kernel";
import type { ClassCtx } from "@prismshadow/penguin-core/kernel";
import { ChatRoute } from "./chat-route";
import { chatDrafts } from "./chat-drafts";
import { AgentsPanel } from "./panels/agents-panel";
import { MemoryPanel } from "./panels/memory-panel";
import type { Chat, ChatDrafts } from "./iface";
import { chatDeps, fileRenderersOf, sessionTabsOf } from "./deps";

@Module({
  contributes: {
    "ShellModule.pages": [
      {
        id: "chat.page",
        key: "chat",
        path: "/chat/:sessionId?",
        frame: "shell",
        nav: "none",
        admin: false,
        released: true,
        order: 10,
      },
    ],
    "DockModule.panels": [
      {
        id: "chat.agents-panel",
        kind: "agents",
        title: "Agents panel",
        titleZh: "智能体面板",
        icon: "robotPair",
        order: 10,
      },
      {
        id: "chat.memory-panel",
        kind: "memory",
        title: "Memory",
        titleZh: "记忆",
        icon: "brain",
        order: 30,
      },
    ],
  },
})
export class ChatModule {
  @Provide() chat!: Chat;
  @Bind("chat.page") page!: ComponentType;
  @Bind("chat.agents-panel") agentsPanel = AgentsPanel;
  @Bind("chat.memory-panel") memoryPanel = MemoryPanel;
  @Provide() drafts: ChatDrafts = chatDrafts;
  setup({ contributions }: ClassCtx) {
    this.page = chatDeps.provide(
      {
        sessionTabs: sessionTabsOf(contributions.sessionTabs ?? []),
        fileRenderers: fileRenderersOf(contributions.fileRenderers ?? []),
      },
      ChatRoute,
    );
    this.chat = {};
  }
}
