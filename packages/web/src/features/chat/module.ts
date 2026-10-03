/** The chat page: the conversation, or a surface Session's page (chat-route.tsx). */
import { Bind, Module } from "@prismshadow/penguin-core/kernel";
import { ChatRoute } from "./chat-route";

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
}
