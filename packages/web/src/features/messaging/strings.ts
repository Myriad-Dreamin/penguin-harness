/**
 * The messaging module's UI copy: the zh and en fragments of the app dictionaries, mounted by
 * reference as their `messaging` section. A new string is added here, to both fragments, and
 * nowhere else — `MessagingStrings` makes a key missing from `messagingEn` a type error.
 */
export const messagingZh = {
  panelTitle: "远程控制",
  /** Session-row context-menu action. */
  bindAction: "远程控制",
  dialogTitle: "远程控制",
  /** The channel selector (always live: each channel's config is saved independently). */
  channelLabel: "渠道",
  channelName: {
    feishu: "飞书",
    telegram: "Telegram",
    qq: "QQ",
    wechat: "微信",
    discord: "Discord",
  },
  /**
   * Shared link labels: the tutorial (in the setup FAQ fold) and, at the credential field's
   * corner, the developer console — the latter only for the channels that have one. A
   * channel whose credential is issued elsewhere names that destination itself (Telegram's
   * `telegram.openBotFather`).
   */
  tutorial: "前往教程",
  console: "前往开发者后台",
  /** The connection toggle (flips immediately, using the stored credentials). */
  enabled: "启用连接",
  /** The toggle's own tooltip: the switch IS the bind/unbind control, which a label reading "enable" does not say. */
  bindByEnableHint: "启用即把该机器人绑定到本对话，停用即解除绑定；凭证在两种状态下都保留。",
  /** Why the toggle is gated while the form has unsaved edits. */
  saveBeforeEnable: "先保存凭证，再启用连接",
  test: "测试连接",
  testing: "测试中…",
  testOk: (ms: number): string => `连接成功（${ms}ms）`,
  /** Success feedback naming the account the credentials sign in as (Telegram: the bot's @username). */
  testOkAs: (account: string, ms: number): string => `连接成功，机器人为 ${account}（${ms}ms）`,
  testFail: (reason: string): string => `连接失败：${reason}`,
  /** Second line on a successful Telegram test whose bot still has Group Privacy on; the remedies live in the troubleshooting fold, which outlasts a toast. */
  testPrivacyOn:
    "该机器人的 Group Privacy 处于开启状态：在它不担任管理员的群里，它收不到普通消息。修复办法见下方「常见问题」。",
  sendTestMessage: "发送测试消息",
  sendingTestMessage: "发送中…",
  testMessageSent: "测试消息已发送",
  statusLabel: "连接状态",
  status: {
    disconnected: "未连接",
    connecting: "连接中",
    connected: "已连接",
    error: "连接错误",
  },
  /** Why the enable switch is gated while the OTHER channel holds the connection. */
  otherEnabledHint: (other: string): string => `同一会话只能启用一个渠道：先停用${other}连接`,
  /** Why the enable switch is gated while the selected channel has no stored credential. */
  credentialMissingHint: "先填写并保存凭证，再启用连接",
  /** Why the clear checkbox is gated while the channel's connection is enabled. */
  disableBeforeClearHint: "先停用连接，才能清除凭证",
  /** The saved delivery option: render a reply's Markdown in the channel's own markup. */
  renderMarkdown: "渲染 Markdown",
  /**
   * Its disclosure, beside the label. One per channel, because what a channel can show is
   * the whole of what the reader needs to know here — a shared sentence would have to say
   * "depending on the channel", which answers nothing.
   */
  renderMarkdownHelpFeishu:
    "开启后，回复中的 Markdown 以排版形式到达，而不是显示为 `**字符**`。飞书以卡片渲染：标题、粗体、斜体、删除线、行内代码与代码块、列表、引用、分割线、链接和表格都支持。超过五行的表格改以代码块发送，任何一行都不会被隐藏。若飞书拒绝该卡片，回复会改以纯文本发出，不会丢失。",
  renderMarkdownHelpTelegram:
    "开启后，回复中的 Markdown 以排版形式到达，而不是显示为 `**字符**`。Telegram 支持粗体、斜体、删除线、链接、行内代码与代码块；它没有标题、列表和表格，因此标题渲染为一行粗体，列表符号作为文本的一部分保留，表格改以代码块发送。若 Telegram 拒绝该排版，回复会改以纯文本发出，不会丢失。",
  renderMarkdownHelpQQ:
    "开启后，回复中的 Markdown 以排版形式到达，而不是显示为 `**字符**`。QQ 支持标题、粗体、斜体、删除线、列表、引用、分割线和链接；它没有代码格式，也没有表格，因此代码块按普通文本行到达，表格按其行到达。若 QQ 拒绝该排版，回复会改以纯文本发出——这会多占用 QQ 对每条消息只允许的少数几条回复中的一条。",
  renderMarkdownHelpWeChat:
    "开启后，回复中的 Markdown 以排版形式到达，而不是显示为 `**字符**`。微信自己就读 Markdown，四个渠道里它支持得最全：标题、粗体、删除线、列表、引用、分割线、链接、行内代码、代码块和表格都能渲染。它不支持的部分会被去掉标记只留文字——五级以下的标题、中文两侧的斜体星号，以及行内图片（改为链接）。",
  renderMarkdownHelpDiscord:
    "开启后，回复中的 Markdown 以排版形式到达，而不是显示为 `**字符**`。Discord 自己就读 Markdown：三级以内的标题、粗体、斜体、删除线、列表、引用、链接、行内代码和代码块都能渲染。它没有表格和分割线，因此表格改以代码块发送、分割线改为一行短横；四级以下的标题渲染为一行粗体。",
  /** The saved delivery option: one message per non-blank line of a reply. */
  linePerMessage: "每行一条消息",
  /** Its disclosure, beside the label: what the option does to a reply, and its two edges. */
  linePerMessageHelp:
    "回复的每个非空行各发一条消息，写成多句台词的回复就按台词逐条到达。超出每条回复的消息上限时，余下的行合并为最后一条，内容不会丢失。",
  /** The saved delivery option: hold a run's working notes, send its last reply only. */
  finalReplyOnly: "只发送最终回复",
  /** Its disclosure, beside the label: what the option changes, and what it costs. */
  finalReplyOnlyHelp:
    "只发送一次运行中助手最后说的那段话，在运行结束时发出；工具调用之间的过程记录留在网页端。代价是长时间运行期间聊天里一片安静。审批提醒不属于回复，仍会立即到达。",
  /**
   * Appended to the option's explanation on QQ only. Not a nuance of the same trade but a
   * different outcome — silence on the other two channels, lost output here — which the
   * channel-neutral sentence above would leave the user to discover from an empty chat.
   */
  finalReplyOnlyQQWarning:
    "QQ 只能回复入站消息，锚点约五分钟失效：开启后，运行超过五分钟就一条也发不出。",
  /** Enabled-row indicator's tooltip / sr text (the small per-channel glyph on the session row). */
  enabledIndicator: {
    feishu: "飞书连接已启用",
    telegram: "Telegram 连接已启用",
    qq: "QQ 连接已启用",
    wechat: "微信连接已启用",
    discord: "Discord 连接已启用",
  },
  /**
   * Delivery observability under the toggle: has anything arrived, and did the last one get
   * through. Both readings belong to the LIVE CONNECTION and start over on a re-enable or a
   * credential save, so the empty case names that scope instead of reading as "never".
   * Each failure line carries its own time: nothing clears it on a later success, and a
   * title= is unreachable on touch.
   */
  inboundLastAt: (when: string) => `最近收到消息：${when}`,
  inboundNone: "本次连接建立以来还没有收到过消息",
  deliveryFailedInbound: (when: string, detail: string) =>
    `${when} 收到过一条消息，但任务没有开始：${detail}`,
  deliveryFailedSend: (when: string, detail: string) =>
    `任务已完成，但回复于 ${when} 发送失败：${detail}`,
  /** A connection failure the connection has since recovered from (lastError is gone by then). */
  lastConnectionError: (when: string, detail: string) => `连接曾于 ${when} 中断：${detail}`,
  /** The collapsed FAQ folds below the save area. */
  faqSetupTitle: "如何创建机器人",
  faqWhatTitle: "绑定后会发生什么",
  /** The channel-neutral half of that fold: how the same bot moves between conversations. */
  faqWhatBinding:
    "同一个机器人可以同时保存在多个对话里，但同一时刻只能有一个对话启用它的连接。要换一个对话使用，先在原对话停用连接，再在这里启用——凭证不必删除。",
  faqTroubleTitle: "常见问题",
  /** Troubleshooting entries (bot must be messaged once; connection errors point at credentials; one poller per Telegram token; Telegram Group Privacy withholds group messages from a non-admin bot; QQ answers only a message just sent). */
  troubleNoChat: "「发送测试消息」不可用？机器人要先收到过一条消息，才知道要发到哪个会话。",
  troubleConnError:
    "连接状态显示错误？检查凭证是否正确；飞书还需确认 API 域名与事件订阅方式（长连接）。",
  troubleOnePoller:
    "Telegram 提示已有其他程序在轮询？一个 Bot Token 同一时刻只能被一个程序使用——关闭正在占用它的另一个 PenguinHarness 服务端或机器人脚本，或为该会话单独建一个机器人。手动执行的 getUpdates（例如用 curl 查看 Telegram 那边积压了什么）同样算作「另一个程序」：跑它之前先在这里停用连接。而且手动查看也可能把它们丢掉——任何带 offset 的调用都会确认它之前的全部更新，应用自己的下一次连接也会清空积压——所以复测请重新发一条新消息，而不是指望刚才看到的那几条。",
  troubleGroupPrivacy:
    "在 Telegram 群里发消息，机器人毫无反应？Telegram 的 Group Privacy 默认开启，此时不担任该群管理员的机器人只能收到明确指向它的命令（如 /start@your_bot）和对它自己消息的回复，普通群消息根本不会送达，连接本身也没有任何异常。把机器人设为该群的管理员即可单独解决，管理员始终收到全部消息。也可以到 @BotFather 用 /setprivacy 关闭 Group Privacy，然后把机器人移出该群再重新拉入——已在的群不会自动生效。",
  /** WeChat has no group inbound at all — the answer to "I @-ed it in a group and nothing happened". */
  troubleWeChatDirect: "微信渠道只接收单聊消息：在群里 @机器人不会有任何反应，请直接私聊它。",
  /** Discord delivers a server-channel message only when it @-mentions the bot — the answer to "I wrote in the channel and nothing happened". */
  troubleDiscordMention:
    "在 Discord 服务器频道里发消息，机器人毫无反应？它在频道里只读取 @ 它的消息（这不需要在开发者后台开启任何特权 intent，无需额外设置）。消息以 @机器人 开头，或者直接私聊它。",
  /** Direct messages to a bot need a shared server and the user's own DM setting. */
  troubleDiscordDm:
    "私聊机器人的消息一直没有到达，或回复失败并提示“不接受私信”？Discord 只在机器人与用户同属一个服务器时投递私信，且用户在该服务器的隐私设置里须允许来自成员的私信。",
  /** The QQ-only failure a user will otherwise read as "the bot is broken". */
  troubleQQPassive:
    "QQ 里收不到回复？QQ 只允许机器人回复你刚发出的消息：在网页端发起的对话不会同步过去，距离你上一条 QQ 消息过去几分钟后也发不出。在 QQ 里再发一条消息即可继续。",
  troubleNoGroupInbound:
    "在群里发消息，面板却一直显示「本次连接建立以来还没有收到过消息」？这一行只能作为你读到它之后再发的那条消息的证据：它只覆盖当前这条连接，停用再启用连接、或者再保存一次凭证，都会开启一条新连接并把它清零。所以先重新发一条。如果这一行仍然显示没有收到过，那就是 Telegram 没有把它投递过来，本机再怎么查也无济于事：确认机器人确实还在这个群里；如果刚在 @BotFather 关掉 Group Privacy，必须把机器人移出该群再重新拉入，已有的群不会自动生效；并确认没有别的程序（包括你自己手动跑的 getUpdates，见上一条）在用同一个 Token 轮询。另外，Telegram 频道（channel）的贴文不受支持——本连接只处理群聊与私聊。",
};

export type MessagingStrings = typeof messagingZh;

export const messagingEn: MessagingStrings = {
  panelTitle: "Remote control",
  /** Session-row context-menu action. */
  bindAction: "Remote control",
  dialogTitle: "Remote control",
  /** The channel selector (always live: each channel's config is saved independently). */
  channelLabel: "Channel",
  channelName: {
    feishu: "Feishu",
    telegram: "Telegram",
    qq: "QQ",
    wechat: "WeChat",
    discord: "Discord",
  },
  /**
   * Shared link labels: the tutorial (in the setup FAQ fold) and, at the credential field's
   * corner, the developer console — the latter only for the channels that have one. A
   * channel whose credential is issued elsewhere names that destination itself (Telegram's
   * `telegram.openBotFather`).
   */
  tutorial: "Open tutorial",
  console: "Open developer console",
  /** The connection toggle (flips immediately, using the stored credentials). */
  enabled: "Enable connection",
  /** The toggle's own tooltip: the switch IS the bind/unbind control, which a label reading "enable" does not say. */
  bindByEnableHint:
    "Enabling binds this bot to this conversation; turning it off releases it. The credentials stay saved either way.",
  /** Why the toggle is gated while the form has unsaved edits. */
  saveBeforeEnable: "Save the credentials first, then enable the connection",
  test: "Test connection",
  testing: "Testing…",
  testOk: (ms: number): string => `Connected (${ms}ms)`,
  /** Success feedback naming the account the credentials sign in as (Telegram: the bot's @username). */
  testOkAs: (account: string, ms: number): string => `Connected as ${account} (${ms}ms)`,
  testFail: (reason: string): string => `Connection failed: ${reason}`,
  /** Second line on a successful Telegram test whose bot still has Group Privacy on; the remedies live in the troubleshooting fold, which outlasts a toast. */
  testPrivacyOn:
    "Group Privacy is on for this bot: it receives no ordinary messages in any group where it is not an administrator. See Troubleshooting below.",
  sendTestMessage: "Send test message",
  sendingTestMessage: "Sending…",
  testMessageSent: "Test message sent",
  statusLabel: "Connection status",
  status: {
    disconnected: "Not connected",
    connecting: "Connecting",
    connected: "Connected",
    error: "Connection error",
  },
  /** Why the enable switch is gated while the OTHER channel holds the connection. */
  otherEnabledHint: (other: string): string =>
    `Only one channel can be enabled per conversation: turn off the ${other} connection first`,
  /** Why the enable switch is gated while the selected channel has no stored credential. */
  credentialMissingHint: "Enter and save the credential first, then enable the connection",
  /** Why the clear checkbox is gated while the channel's connection is enabled. */
  disableBeforeClearHint: "Disable the connection before clearing the credential",
  /** The saved delivery option: render a reply's Markdown in the channel's own markup. */
  renderMarkdown: "Render Markdown",
  /**
   * Its disclosure, beside the label. One per channel, because what a channel can show is
   * the whole of what the reader needs to know here — a shared sentence would have to say
   * "depending on the channel", which answers nothing.
   */
  renderMarkdownHelpFeishu:
    "A reply's Markdown arrives as formatting instead of as `**characters**`. Feishu renders it as a card: headings, bold, italic, strikethrough, code and fenced code blocks, lists, quotes, rules, links and tables. A table longer than five rows arrives as a code block so no row is hidden. If Feishu refuses the card, the reply is sent as plain text rather than lost.",
  renderMarkdownHelpTelegram:
    "A reply's Markdown arrives as formatting instead of as `**characters**`. Telegram shows bold, italic, strikethrough, links, inline code and code blocks; it has no headings, lists or tables, so a heading becomes a bold line, list markers become part of the text, and a table arrives as a code block. If Telegram refuses the formatting, the reply is sent as plain text rather than lost.",
  renderMarkdownHelpQQ:
    "A reply's Markdown arrives as formatting instead of as `**characters**`. QQ shows headings, bold, italic, strikethrough, lists, quotes, rules and links; it has no code formatting and no tables, so a code block arrives as plain lines and a table as its rows. If QQ refuses the formatting, the reply is sent as plain text — which costs one more of the few replies QQ allows per message.",
  renderMarkdownHelpWeChat:
    "A reply's Markdown arrives as formatting instead of as `**characters**`. WeChat reads Markdown itself and shows the most of the four channels: headings, bold, strikethrough, lists, quotes, rules, links, inline code, code blocks and tables all render. What it cannot show keeps its words and loses its markers — headings past the fourth level, italics around Chinese text, and inline images, which become links.",
  renderMarkdownHelpDiscord:
    "A reply's Markdown arrives as formatting instead of as `**characters**`. Discord reads Markdown itself: headings up to the third level, bold, italic, strikethrough, lists, quotes, links, inline code and code blocks all render. It has no tables and no horizontal rules, so a table arrives as a code block and a rule as a short dash line; a heading past the third level becomes a bold line.",
  /** The saved delivery option: one message per non-blank line of a reply. */
  linePerMessage: "One message per line",
  /** Its disclosure, beside the label: what the option does to a reply, and its two edges. */
  linePerMessageHelp:
    "Each non-blank line of a reply is sent as its own message, so an answer written as several spoken lines arrives as several messages. Past a per-reply limit the remaining lines are combined into one last message rather than dropped.",
  /** The saved delivery option: hold a run's working notes, send its last reply only. */
  finalReplyOnly: "Final reply only",
  /** Its disclosure, beside the label: what the option changes, and what it costs. */
  finalReplyOnlyHelp:
    "Sends only the last thing the assistant says in a run, when the run ends; the notes it writes between tool calls stay in the web app. The cost is hearing nothing while a long run is under way. The approval reminder is not a reply and still arrives immediately.",
  /**
   * Appended to the option's explanation on QQ only. Not a nuance of the same trade but a
   * different outcome — silence on the other two channels, lost output here — which the
   * channel-neutral sentence above would leave the user to discover from an empty chat.
   */
  finalReplyOnlyQQWarning:
    "QQ can only answer an inbound message, and that anchor expires after about five minutes: with this on, a run taking longer delivers nothing at all.",
  /** Enabled-row indicator's tooltip / sr text (the small per-channel glyph on the session row). */
  enabledIndicator: {
    feishu: "Feishu connection enabled",
    telegram: "Telegram connection enabled",
    qq: "QQ connection enabled",
    wechat: "WeChat connection enabled",
    discord: "Discord connection enabled",
  },
  /**
   * Delivery observability under the toggle: has anything arrived, and did the last one get
   * through. Both readings belong to the LIVE CONNECTION and start over on a re-enable or a
   * credential save, so the empty case names that scope instead of reading as "never".
   * Each failure line carries its own time: nothing clears it on a later success, and a
   * title= is unreachable on touch.
   */
  inboundLastAt: (when: string) => `Last message received: ${when}`,
  inboundNone: "No message has arrived since this connection opened",
  deliveryFailedInbound: (when: string, detail: string) =>
    `A message arrived at ${when} but its task never started: ${detail}`,
  deliveryFailedSend: (when: string, detail: string) =>
    `The task ran but its reply failed to go out at ${when}: ${detail}`,
  /** A connection failure the connection has since recovered from (lastError is gone by then). */
  lastConnectionError: (when: string, detail: string) =>
    `The connection dropped at ${when}: ${detail}`,
  /** The collapsed FAQ folds below the save area. */
  faqSetupTitle: "Set up the bot",
  faqWhatTitle: "What binding does",
  /** The channel-neutral half of that fold: how the same bot moves between conversations. */
  faqWhatBinding:
    "The same bot can stay saved in several conversations, but only one of them may have its connection enabled at a time. To move it, turn the connection off where it is on and enable it here — no credential has to be deleted.",
  faqTroubleTitle: "Troubleshooting",
  /** Troubleshooting entries (bot must be messaged once; connection errors point at credentials; one poller per Telegram token; Telegram Group Privacy withholds group messages from a non-admin bot; QQ answers only a message just sent). */
  troubleNoChat:
    "“Send test message” disabled? The bot must have received one message first, so it knows which chat to send to.",
  troubleConnError:
    "Connection status shows an error? Check the credentials; for Feishu also confirm the API domain and the long-connection event subscription.",
  troubleOnePoller:
    "Telegram reports that another program is polling? A Bot Token serves exactly one program at a time — close the other PenguinHarness server or bot script using it, or give this conversation a bot of its own. A getUpdates you run by hand (a curl to see what Telegram has queued) is that other program too: disable the connection here before running one. Inspecting them by hand can also discard them — any call you pass an offset to confirms everything before it, and the app's own next connect drops the backlog — so retest with a freshly sent message rather than the ones you just looked at.",
  troubleGroupPrivacy:
    "The bot ignores everything you say in a Telegram group? Telegram's Group Privacy is on by default, and under it a bot that is not an administrator of the group receives only commands addressed to it (such as /start@your_bot) and replies to its own messages — ordinary group messages are never delivered at all, and the connection itself looks perfectly healthy. Making the bot an administrator of that group fixes it on its own, since administrators always receive every message. Otherwise turn Group Privacy off with /setprivacy in @BotFather, then remove the bot from the group and add it back — a group it is already in does not pick up the change.",
  /** WeChat has no group inbound at all — the answer to "I @-ed it in a group and nothing happened". */
  troubleWeChatDirect:
    "The WeChat channel receives direct chats only: @-mentioning the bot in a group does nothing at all. Message it directly instead.",
  /** Discord delivers a server-channel message only when it @-mentions the bot — the answer to "I wrote in the channel and nothing happened". */
  troubleDiscordMention:
    "The bot ignores what you write in a Discord server channel? It reads only messages that @-mention it there (this needs no privileged intent in the developer portal, so nothing has to be switched on). Start the message with @the-bot, or send it a direct message.",
  /** Direct messages to a bot need a shared server and the user's own DM setting. */
  troubleDiscordDm:
    "A direct message to the bot never arrives, or the reply fails with “does not accept direct messages”? Discord only routes DMs between a bot and a user who share a server, and the user's privacy settings for that server must allow direct messages from its members.",
  /** The QQ-only failure a user will otherwise read as "the bot is broken". */
  troubleQQPassive:
    "No replies arriving in QQ? QQ only lets a bot answer a message you just sent: a turn started in the web app is not mirrored there, and replies stop being deliverable a few minutes after your last QQ message. Send another message in QQ to continue.",
  troubleNoGroupInbound:
    "Sending in a group but the panel still says no message has arrived? Read that line as evidence only about a message sent after it: it covers the current connection alone, and disabling and re-enabling the connection — or saving the credential again — opens a new one and starts it over. So send a fresh one now. If the line still reports nothing, Telegram is not delivering it and nothing on this machine can change that: confirm the bot is still in that group; if you have just turned Group Privacy off in @BotFather, remove the bot from the group and add it back, because an existing group does not pick up the change; and confirm nothing else is polling the same token — including a getUpdates you ran yourself (see above). Telegram channel posts are not supported either — this connection handles groups and direct chats only.",
};
