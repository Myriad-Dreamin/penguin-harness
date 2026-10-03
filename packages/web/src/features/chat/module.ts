/**
 * The chat page: the conversation, or a surface Session's page (chat-route.tsx); and its drafts
 * for the surfaces that start and list them (iface.ts).
 */
import { Bind, Module, Provide } from "@prismshadow/penguin-core/kernel";
import { ChatRoute } from "./chat-route";
import { chatDrafts } from "./chat-drafts";
import type { ChatDrafts } from "./iface";

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
  },
})
export class ChatModule {
  @Bind("chat.page") page = ChatRoute;
  @Provide() drafts: ChatDrafts = chatDrafts;
}
