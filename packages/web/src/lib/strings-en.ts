/**
 * English dictionary (constrained by the `Strings` type to the same shape as zh):
 * locale switching goes through state/locale.tsx.
 * Keep domain terms capitalized — Workspace, Token, Task, Session, Project, Trace.
 * "agent" is a common noun: lowercase mid-sentence, capitalized only at the start
 * of a label/sentence or in a proper name (Agent State, AgentHub).
 */
import { terminalEn } from "../features/terminal/strings";
import { adminEn } from "../features/admin/strings";
import { agentEn } from "../features/agents/strings";
import { aiCreateEn } from "../features/ai-create/strings";
import { benchmarkEn } from "../features/benchmark/strings";
import { browserEn } from "../features/browser/strings";
import { chatEn } from "../features/chat/strings";
import { companyEn } from "../features/company/strings";
import { dashboardEn } from "../features/dashboard/strings";
import { dockEn } from "../features/dock/strings";
import { harnessHistoryEn } from "../features/harness/strings";
import { machinesEn } from "../features/machines/strings";
import { messagingEn } from "../features/messaging/strings";
import { modelsEn } from "../features/models/strings";
import { commandPaletteEn } from "../features/palette/strings";
import { pluginsEn } from "../features/plugins/strings";
import { portsEn } from "../features/ports/strings";
import { scheduleEn } from "../features/schedules/strings";
import { semanticIdEn } from "../features/semantic-id/strings";
import { settingsEn } from "../features/settings/strings";
import { skillsEn } from "../features/skills/strings";
import { tracesEn } from "../features/traces/strings";
import { usageEn } from "../features/usage/strings";
import { workflowsEn } from "../features/workflows/strings";
import type { Strings } from "./strings";

export const en: Strings = {
  appName: "PenguinHarness",

  nav: {
    chat: "Chat",
    newChat: "New chat",
    agents: "Agents",
    models: "Models",
    machines: "Machines",
    plugins: "Plugins",
    usage: "Cost Center",
    traces: "Trajectories",
    benchmark: "Evaluation Center",
    // Collapsed-rail tooltips (product-specified wording; new chat reuses chat.newSessionMenu, the other pages reuse the page names above).
    lastConversation: "Last conversation",
    // The rail avatar's tooltip says what the control does; who is signed in stays in its accessible name.
    userSettings: "User settings",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
    collapseGroup: "Collapse",
    expandGroup: "Expand",
    pinGroup: "Pin group",
    unpinGroup: "Unpin group",
    /** Company mode's page entries (S.nav.org.<key>, the COMPANY_NAV_KEYS manifest), and the mode switch's option names. */
    org: {
      overview: "Overview",
      chart: "Org Chart",
      calendar: "Calendar",
      tickets: "Tickets",
      finance: "Finance",
      handbook: "Handbook",
      /** The proposals page a plugin contributes (ORG_PAGE_RENDERERS); the row exists only while the plugin does. */
      proposals: "Proposals",
      /** The roadmaps page a plugin contributes and serves itself (an iframe row of ORG_PAGE_RENDERERS); the row exists only while the plugin does. */
      roadmaps: "Roadmaps",
    },
  },

  /** Machines page: the server's own ssh hosts, and installing this build on one. */
  machines: machinesEn,

  /** The Browser: a dock tab showing a page on a host of its own. */
  browser: browserEn,

  /** Port forwarding: the dock's Ports panel, and a machine's Ports page. */
  ports: portsEn,

  /** Server-side terminal (the in-app dock and the standalone /terminal page): the terminal module owns this copy. */
  terminal: terminalEn,

  dock: dockEn,

  tracePanel: {
    empty: "No traces yet",
    emptyHint: "This session has not produced a Trace file yet",
    loadFailed: "Failed to load traces",
  },

  dashboard: dashboardEn,

  settings: settingsEn,

  commandPalette: commandPaletteEn,
  workflows: workflowsEn,
  harnessHistory: harnessHistoryEn,
  /**
   * The software-update flow (lib/update-flow.ts): the one modal for both the server release
   * and the desktop client, the account-menu row, the version-line badge, and the toasts for
   * outcomes that land while the modal is closed. Null version = the backend named none.
   */
  update: {
    /** Version-line date label; `date` is formatMonthDay output, e.g. "Last updated Jul 26". */
    lastUpdated: (date: string) => `Last updated ${date}`,
    /** The version line's superscript, a button into the modal; the other two follow the flow. */
    newVersionBadge: "New version available",
    badgeDownloading: "Downloading update",
    badgeReady: "Restart to update",
    /** A release offered: the row's label and the avatar badges' sentence. */
    newVersion: (v: string) => `New version v${v} available`,
    /** A release downloaded / installed and waiting for the restart: the row's label and the badges' sentence. */
    restartToUpdate: (v: string | null) =>
      v !== null ? `Restart to update to v${v}` : "Restart to finish updating",
    /** The combined wording for an anchor covering several update trails at once. */
    updatesAvailable: "Updates available",
    // —— the account-menu row ——
    checkNow: "Check for updates",
    checking: "Checking…",
    rowDownloading: (v: string | null, percent: number | null) =>
      `Downloading${v !== null ? ` v${v}` : " update"}${percent !== null ? ` ${percent}%` : "…"}`,
    rowRestarting: "Restarting…",
    rowUnsupported: "Cannot update from here",
    // —— the modal ——
    title: "Software Update",
    currentVersion: (v: string) => `Current version v${v}`,
    checkingBody: "Checking for updates…",
    upToDate: "You're on the latest version",
    checkFailed: "Update check failed — try again later",
    checkDisabled: "Update checks are disabled (PENGUIN_UPDATE_CHECK=off)",
    releaseNotes: "Release notes",
    openReleases: "Open the Releases page",
    /** What "download and update" does, per backend. */
    availableBodyRelease:
      "Downloads the latest release and installs it into the install directory on the server (the data directory is not touched). You can close this window while it downloads; restart the service afterwards to run it.",
    availableBodyClient:
      "Downloads the new version. You can close this window and keep working while it downloads; restart the app once it is ready to finish updating.",
    /** Shown to non-admins in place of the body above (they can read the notes but cannot run the update). */
    adminOnly: "Only an administrator can run the update from here.",
    downloadAndInstall: "Download and update",
    later: "Later",
    background: "Continue in background",
    downloading: (v: string | null) =>
      v !== null ? `Downloading v${v}…` : "Downloading the update…",
    /** The progress bar's accessible name. */
    downloadProgress: "Download progress",
    /** The server job's stages, shown under the bar while it carries no percentage. */
    phaseResolving: "Resolving the release…",
    phaseDownloading: "Downloading the package…",
    phaseInstalling: "Verifying and installing…",
    ready: (v: string | null) => (v !== null ? `v${v} is ready` : "The update is ready"),
    readyBodyRelease:
      "Restart the service to run the new version. Running tasks will be interrupted; this page reloads once the service is back.",
    /** Mirrors the shell's native restart prompt: the interruption warning must not disappear on the web path. */
    readyBodyClient:
      "PenguinHarness will restart to finish updating. Running tasks will be interrupted.",
    /** Nothing supervises the server process (not started through penguin web / penguin server), so the restart is the user's. */
    readyBodyManual:
      "The new version is installed. This service is not supervised by penguin web or penguin server, so it cannot be restarted from here: re-run penguin web (or penguin server) in a terminal.",
    restartNow: "Restart and update",
    restarting: "Restarting…",
    restartingBodyRelease: "This page reloads once the service is back.",
    restartingBodyClient: "The app is about to restart.",
    failed: "Update failed",
    retry: "Retry",
    /** Why this install cannot update itself. */
    unsupportedDev: "A dev run does not update itself",
    unsupportedNonAppImage:
      "Only the AppImage build updates itself on Linux — update a package install through your package manager",
    unsupportedNotViaCli:
      "This service was not started through penguin web or penguin server, so it cannot be updated from here",
    unsupportedCli: "This install cannot be updated from the web UI",
    // —— toasts: outcomes that land while the modal is closed ——
    foundNew: (v: string) => `New version v${v} found — open the update entry to download it`,
    foundNewUnnamed: "New version found — open the update entry to download it",
    readyToast: (v: string | null) =>
      v !== null ? `v${v} is ready — restart to update` : "The update is ready — restart to update",
    failedToast: "Update failed — open the update entry for details",
    unsupportedToast: "This install cannot be updated from the web UI",
    /** The shell's own updater failure text — a failed download or signature check, not only a failed lookup. */
    clientUpdateFailed: (detail: string) => `Client update failed: ${detail}`,
    /** A download / restart request failed before the backend could act; `detail` is apiErrorText output. */
    requestFailed: (detail: string) => `Could not run the update action: ${detail}`,
    restartTimedOut:
      "The service has not come back — check penguin web's output in the terminal, then reload this page",
  },

  /**
   * The four DISMISSIBLE badge trails (Agents / Skill library / model library / cost center),
   * the controls that clear them and the control that acts on all of one at once. The tooltip
   * sentences below are what each dot says; the page notice restates the same count in its own
   * `changes*` wording, since a block that can act needs to say what it would act on.
   */
  todo: {
    pluginUpdates: (n: number) => (n === 1 ? "1 plugin update" : `${n} plugin updates`),
    presetUpdates: (n: number) =>
      n === 1 ? "1 preset model to sync" : `${n} preset models to sync`,
    unexpectedErrors: (n: number) => (n === 1 ? "1 unexpected error" : `${n} unexpected errors`),
    /** Combined anchor whose trails are not all updates — an unexpected error is not one. */
    pending: "Something needs attention",
    /** Clears an update the user has decided not to take now (a later one raises the badge again). */
    dismiss: "Dismiss",
    /** The cost center's wording: nothing is being updated there, the errors are simply read. */
    markRead: "Mark as read",

    // —— The page notice's own line and its bulk action (components/ui/todo-notice.tsx) ——

    /** The notice line where the trail can separate genuinely new things from upgradable ones (Models only). */
    changesWithAdded: (added: number, updated: number): string =>
      `Changes detected: ${added} new, ${updated} to upgrade`,
    /** The same line where the trail has only one honest count — no padded zero (Agents, Plugins). */
    changesUpgradable: (updated: number): string => `Changes detected: ${updated} to upgrade`,
    /** Updates every object the notice counts, behind the page's own confirmation. */
    updateNow: "Update now",
    /** Heading of the confirmation's list of exactly what the batch would write to. */
    willTouch: "This will touch:",
    /** Bulk kernel update confirmation; the body reuses agent.kernelUpdateConfirmBody verbatim. */
    agentsConfirmTitle: (n: number): string => `Update the kernel of ${n} agent(s)`,
    /** Bulk plugin update confirmation. Same warning as the per-plugin confirm, with no single subject. */
    pluginsConfirmTitle: (n: number): string => `Update ${n} plugin(s)`,
    pluginsConfirmBody:
      "Updating reinstalls the library copy over each agent's installed skill and hook files — any local edits are lost. Export a backup first if you need them.",
    /** Bulk preset sync confirmation; the body reuses models.syncCatalogHint verbatim. */
    modelsConfirmTitle: (n: number): string => `Sync ${n} preset model(s)`,
    /** Every target of the batch was written. Counted in agents: both pages that use this
     * send one request per agent, and the partial-failure line below names agents too. */
    bulkDone: (ok: number): string => `${ok} agent${ok === 1 ? "" : "s"} updated`,
    /** Some targets were written and some were not — the failed ones are named, never just counted. */
    bulkPartial: (ok: number, failed: string): string =>
      `${ok} agent${ok === 1 ? "" : "s"} updated; these did not: ${failed}`,
    /** Separator between named targets in the two strings above. */
    listSeparator: ", ",
  },

  /** Task-completion notifications (window unfocused; opt-in, see lib/notification-pref). */
  notify: {
    taskCompleteTitle: "Task completed",
    /** `session` is the Session title (defaultSessionTitle when unnamed). */
    taskCompleteBody: (session: string): string => `"${session}" has finished — click to view`,
  },

  common: {
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    create: "Create",
    delete: "Delete",
    edit: "Edit",
    settings: "Settings",
    confirm: "Confirm",
    /** Sole button of a dialog that only informs: it has nothing to confirm or cancel, so the label acknowledges rather than agrees (and does not repeat the header X's "close"). */
    gotIt: "Got it",
    loading: "Loading…",
    saved: "Saved",
    saving: "Saving…",
    /** Clicking save with nothing changed: an info toast instead of a silent no-op. */
    noChangesToSave: "No changes to save",
    /** Confirm-before-save dialog shared by the settings forms (writes go to server-side config files). */
    confirmSaveTitle: "Save changes",
    confirmSaveBody:
      "Save these changes? They will be written to the configuration files on the server.",
    none: "(none)",
    retry: "Retry",
    unknownError: "Request failed, please try again later",
    requiredField: "This field is required",
    /** A menu row that copies what it acts on (the conversation's selection menu); the confirmation is `copied`. */
    copy: "Copy",
    copied: "Copied",
    /** Accessible name of the circled "?" that discloses a section or field explanation. */
    moreInfo: "More info",
    /** The same, named for what it explains — so the trigger never repeats the heading it sits in. */
    moreInfoAbout: (subject: string) => `More info: ${subject}`,
    name: "Name",
    username: "Username",
    role: "Role",
    actions: "Actions",
    created: "Created",
    cost: "Cost",
    time: "Time",
  },

  /**
   * The id field every create dialog with a semantic id wears (features/semantic-id): a Project's,
   * an Agent's, a Benchmark's, an organization's and a channel's.
   */
  semanticId: semanticIdEn,

  auth: {
    usernameHint:
      "2–32 chars: starts with a lowercase letter; lowercase letters, digits and underscores only",
    password: "Password",
    passwordHint: "At least 8 characters",
    showPassword: "Show password",
    hidePassword: "Hide password",
    login: "Sign in",
    logout: "Sign out",
    /** The sign-out confirmation: dialog name and body. */
    logoutConfirmTitle: "Sign out?",
    logoutConfirmBody:
      "This ends your session here and returns to the login page. Running conversations keep going on the server.",
    admin: "Admin",
    defaultAdminNote:
      "First run: the server prints a first-login link in its startup output — open it to claim the built-in admin “admin” and set a password. No initial password exists to type here",
    /** Login footer line 2: the offline rescue for a forgotten admin password (other users ask the admin instead). */
    forgotAdminNote:
      "Forgot the admin password? Stop the server and run penguin server reset-admin-password; its next start prints a new first-login link — open it to set a new password",
    /** Dialog raised over the login form when the server refused a sign-in link (spent, expired, or never valid). */
    claimFailedTitle: "Sign-in link no longer works",
    /** Desktop deployment: the shell mints a fresh link every time it starts, so restarting it is the way back in. */
    claimFailedDesktop:
      "This one-time sign-in link has already been used or has expired. Restart the PenguinHarness desktop app to get a fresh link and be signed in automatically, or sign in with your username and password below.",
    /** Everywhere else: nobody at this browser can mint a link, so the way in is the form below or whoever runs the server. */
    claimFailedServer:
      "The first-login link stops working once the server has a password, and a restart replaces it with a new one. Sign in with your username and password below, or ask your administrator for a new sign-in link.",
  },

  /**
   * The Profile page of Settings, and the avatar/nickname it writes. Visible in every
   * session, the desktop shell's own window included: a profile needs no password to change.
   */
  profile: {
    /** Avatar row: its label, and the two actions beside the preview. */
    avatar: "Avatar",
    /** Disclosed by the "?" beside that label: when a picked image takes effect. */
    avatarInfo:
      "A picture takes effect as soon as you choose it — there is no separate Save for it. The nickname beside it is typed text, so it keeps a Save of its own.",
    cropAvatar: "Crop avatar",
    cropAvatarHint: "Drag to position, scroll or use the slider to zoom",
    cropZoom: "Zoom",
    useAvatar: "Use this",
    changeAvatar: "Change avatar",
    /**
     * Shared label of the two buttons that put a field back to what an account with nothing set
     * shows: the letter tile for the avatar, the username for the nickname. Neither deletes
     * anything the app cannot draw again, which is why it does not say "remove".
     */
    restoreDefault: "Restore default",
    /** The same, named for what it restores: two of these sit on one page. */
    restoreDefaultOf: (subject: string) => `Restore default: ${subject}`,
    /** The picked image could not be brought under the size limit even as JPEG. */
    avatarTooLarge: "That image is too large. Please pick a smaller one.",
    /** The picked file could not be decoded as an image at all. */
    avatarUnreadable: "That image could not be read. Please pick another file.",
    /** Nickname row: the field, and the shape rule that stays on screen while typing. */
    displayName: "Nickname",
    displayNameHint: "1–32 characters; leave blank to clear",
    displayNamePlaceholder: "Blank shows the username",
  },

  account: {
    changePassword: "Change password",
    oldPassword: "Current password",
    oldPasswordHint:
      "The password this account currently signs in with — checked before the new one takes effect",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    passwordMismatch: "New passwords do not match",
    initialPasswordBanner: "This account is using its initial password. Please change it soon.",
    changeNow: "Change now",
  },

  admin: adminEn,

  project: {
    switcher: "Project",
    create: "New Project",
    createTitle: "New Project",
    id: "Project id",
    idHint:
      "2–64 chars: starts with a lowercase letter; lowercase letters, digits and underscores only; cannot be changed later",
    idPrefixHint:
      "The id is prefixed with your username and a hyphen; append lowercase letters, digits or underscores; cannot be changed later",
    displayName: "Display name",
    /** Create dialog only: leaving the name empty falls back to the id. In Project settings the saved name cannot be blanked. */
    displayNameHint: "Leave empty to use the Project id as the name",
    settings: "Project settings",
    settingsTitle: "Project settings",
    members: "Members",
    addMember: "Add member",
    removeMember: "Remove",
    /** New-chat defaults section (Project settings): prefill for every new chat. */
    chatDefaultsTitle: "New chat defaults",
    chatDefaultsHint:
      "Prefilled defaults for every new chat: agent, working directory, approval mode, thinking level and default model.",
    chatDefaultsAgent: "Agent",
    chatDefaultsNotSet: "Not set",
    chatDefaultsApprovalNotSet: "Not set (defaults to allow all)",
    chatDefaultsThinkingNotSet: "Not set (follow the agent's config)",
    /** The model default is single-sourced with the Models page (the same default_model); this is just another entry point. */
    chatDefaultsModelHint: "Same default model as the Models page",
    /** Settings dialog tab rail. */
    settingsTabGeneral: "General",
    settingsTabMembers: "Members",
    settingsTabDefaults: "Defaults",
    settingsTabSecurity: "Security policy",
    projectIdLabel: "Project ID",
    deleteProjectDesc: "The project directory is removed recursively and cannot be recovered.",
    /** Security-policy page (Project settings): disclosed by the "?" beside the tab heading. */
    commandPolicyInfo:
      "The command text is normalized for whitespace and quoting, then matched against each enabled rule's regular expression; a hit is refused outright whatever the approval mode allows. It is an accident guardrail: a command assembled at run time is not covered.",
    commandPolicyEnable: "Enable policy",
    commandPolicyEnableDesc: "When off, no rule blocks anything.",
    commandPolicyRules: "Rules",
    commandPolicyRestore: "Restore defaults",
    commandPolicyAddRule: "Add rule",
    commandPolicyEditRule: "Edit",
    commandPolicyApplyRule: "Apply",
    commandPolicyEmpty: "No rules.",
    commandPolicyOn: "Enabled",
    commandPolicyOff: "Disabled",
    commandPolicyRuleName: "Name",
    commandPolicyRulePattern: "Regular expression",
    commandPolicyRuleDesc: "Description",
    commandPolicyInvalidPattern: "Invalid regular expression",
    deleteProject: "Delete Project",
    deleteConfirm:
      "Delete this Project? Its directory will be removed recursively and cannot be recovered.",
    deleteLastForbidden:
      "This is the last Project on this account; create another Project before deleting it",
    deleteDefaultForbidden:
      "default_project is shared with the CLI and cannot be deleted from the web",
    noCredentialTitle: "No model credential configured",
    noCredentialBody:
      "The default model of this Project has no API key yet. Configure it on the Models page before chatting.",
    goToModels: "Go to Models",
    later: "Later",
  },

  /** The "Create with AI" kit (features/ai-create): the pair of create buttons, the prompt panel and the bridge into a new conversation with the Project's default agent. */
  aiCreate: aiCreateEn,

  agent: agentEn,

  models: modelsEn,

  memory: {
    desc: "Long-term memory across Sessions (stored in agent_state/memory/): the agent saves what is worth keeping as it works, and you can also just ask it to remember something. User memory applies to all of this agent's sessions; workspace memory is kept per workspace. Memory edits are made by the agent in chat. Turning the switch off only stops memory from being used and deletes nothing.",
    enable: "Enable memory",
    userScope: "User memory",
    templateMissing:
      "The prompt template has no {{MEMORY}} placeholder, so memory never enters the context.",
    insertPlaceholder: "Insert the {{MEMORY}} placeholder",
    insertPlaceholderDone: "Inserted",
    promptSection: "Memory prompt",
    promptSectionHint:
      "What the template's {{MEMORY}} placeholder expands to. The main prompt is injected into every session; the workspace addendum only in sessions with a persistent workspace.",
    promptLabel: "Main prompt",
    workspacePromptLabel: "Workspace addendum",
    /**
     * Memory-prompt placeholder reference; a chip inserts into whichever field was focused
     * last. The two indexes plus the workspace directory — the user directory stays a literal
     * pattern in the prompt, resolvable from the Environment section.
     */
    promptPlaceholders: [
      [
        "{{USER_MEMORY_INDEX}}",
        "Content of the user MEMORY.md index (at most 200 lines and 25,000 characters total)",
      ],
      [
        "{{WORKSPACE_MEMORY_INDEX}}",
        "Content of the workspace MEMORY.md index (at most 200 lines and 25,000 characters total); effective only in the workspace addendum",
      ],
      [
        "{{WORKSPACE_MEMORY_DIR}}",
        "Absolute path of the current workspace's memory directory; effective only in the workspace addendum",
      ],
    ],
    insertToken: "Insert at the cursor",
    itemCount: (n: number): string => (n === 1 ? "1 item" : `${n} items`),
    emptyScope:
      "No memories for this Workspace yet — the agent saves what is worth keeping as it works",
    emptyUserScope: 'No user memories yet — say "remember …" in a chat and the agent will save it',
    add: "Add",
    addScopeLabel: (scope: string): string => `Add to ${scope}`,
    addTitle: "Add memory",
    addWhy:
      "The agent organizes and saves memories in a chat: fill in the content, open a new conversation, and the agent does the rest.",
    addContentLabel: "Content or source to remember",
    addContentPlaceholder: "Paste the content to remember, or a file path / URL",
    /** Prefilled draft for the add-via-chat flow, per scope kind; the required content follows on the next line. */
    addPromptLead: {
      user: "Please turn the following into memories in user memory:",
      workspace: "Please turn the following into memories in this workspace's memory:",
    },
    view: "View",
    edit: "Edit",
    editTitle: "Edit memory",
    editWhy:
      "Content edits are made by the agent in a chat: confirm the prompt to open a new conversation, and the agent updates the memory file and its MEMORY.md index together.",
    editRequirementLabel: "What to change",
    editRequirementPlaceholder: "Describe the change — you can finish it in the chat",
    editPromptLabel: "Prompt preview",
    editCopyPrompt: "Copy prompt",
    editOpenChat: "Open a new chat",
    delete: "Delete",
    deleteTitle: "Delete this memory?",
    deleteConfirm: (name: string): string =>
      `This deletes "${name}" and removes its index line from MEMORY.md. This cannot be undone.`,
    deleteDone: "Deleted",
    /** Prefilled draft for the edit-via-chat flow; the user completes the trailing requirement line before sending. */
    editPromptLead: (title: string): string => `Please update a memory: ${title}`,
    editPromptTail: "What to change: ",
    exportScope: "Export",
    exportScopeHint: "Download every memory in this group as one JSON document",
    exportScopeLabel: (scope: string): string => `Export ${scope}`,
    importScope: "Import",
    importScopeHint: "Restore memories into this group from an exported JSON document",
    importScopeLabel: (scope: string): string => `Import into ${scope}`,
    importTitle: "Import memories",
    importWhy:
      "Reads a memory group exported from this or another agent: a JSON file holding the memories and the group's MEMORY.md index.",
    importFile: (name: string, count: number): string => `${name} — ${count} memories`,
    importModeLabel: "When this group already has a memory of the same name",
    importModeSkip: "Keep the one that is here",
    importModeSkipHint: "Adds only what this group does not have. Nothing here is lost.",
    importModeOverwrite: "Take the file's version",
    importModeOverwriteHint: "Memories the file does not carry are left alone.",
    importModeReplace: "Replace the whole group",
    importModeReplaceHint: "Every memory the file does not carry is deleted.",
    importAction: "Import",
    importInvalidFile: "This file is not a memory export.",
    importEmptyFile: "This file carries no memories.",
    importConfirmTitle: "Confirm the import",
    importWillOverwrite: (names: string[]): string =>
      `${names.length} memories will be overwritten: ${names.join(", ")}`,
    importWillRemove: (names: string[]): string =>
      `${names.length} memories will be deleted: ${names.join(", ")}`,
    importWillReplaceIndex: "The group's MEMORY.md index will be replaced.",
    importIrreversible: "This cannot be undone.",
    importDone: (added: number, overwritten: number, removed: number): string =>
      `Imported: ${added} added, ${overwritten} replaced, ${removed} deleted`,
    importNothingNew: "Nothing to import — this group already has every memory in the file",
  },

  vault: {
    desc: "Environment variables owned by this agent (stored in agent_state/.vault.toml), injected into the environment of its shell commands (exec_command); key names are shared with the model, values never enter the model context. Subagents use their own vaults and do not inherit this one. Saved changes take effect from the next task (a task already running is unaffected).",
    key: "Name",
    value: "Value",
    valueMasked: "Value (masked)",
    add: "Add",
    addTitle: "Add variable",
    remove: "Remove",
    deleteTitle: "Delete variable",
    deleteConfirm: (key: string): string =>
      `Delete variable "${key}"? Its value cannot be recovered.`,
    overwriteTitle: "Overwrite existing variable",
    overwriteConfirm: (key: string): string =>
      `"${key}" already exists — saving will overwrite its value, which cannot be recovered.`,
    empty: "No variables configured yet",
    readOnlyHint: "Members are read-only; only the owner can edit the vault",
    keyHint: "Letters, digits and underscores; must not start with a digit",
    keyInvalid: "Invalid name: only letters, digits and underscores, not starting with a digit",
    valueRequired: "Value must not be empty",
    aiAddTitle: "Add secrets with AI",
    aiAddIntro:
      "A secret value typed here is sent to the model provider, recorded in the conversation's Trace, and shown again in the command the agent runs. The safer way is to let AI create only the key names and tell you what each is for, then fill in the values in the vault by hand.",
    aiAddPlaceholder: "Ask which API keys this agent needs, or name the keys to create…",
    aiAddExamples: [
      {
        key: "audit",
        label: "Find the keys this agent needs",
        description: "Key names now, values filled in by hand",
        prompt:
          "Check which API keys this agent's installed skills need, create the key names now, and tell me what each one is for and where to apply for it — I will fill in the values in the vault myself.",
      },
      {
        key: "rotate",
        label: "Reset an expired token",
        description: "Clears the value; you paste the new one",
        prompt:
          "GH_TOKEN has expired. Reset it to a placeholder value and tell me where to issue a new one — I will paste the new token in the vault myself.",
      },
      {
        key: "endpoint",
        label: "Connect an internal service",
        description: "Address set now, token left for you",
        prompt:
          "This agent will call our internal Gitea at https://git.example.com. Set GITEA_BASE_URL to that address, create GITEA_TOKEN with a placeholder value, and tell me where to issue the token.",
      },
    ],
    aiAddTail: (agentId: string, projectId: string): string =>
      [
        `Use the penguin-config skill to write the secrets above into the vault of agent ${agentId} (Project ${projectId}):`,
        "- Every command below carries `--root <data root>`, the parent directory of the App Data Dir in your Environment section. Your command environment does not name that root, so a command without `--root` writes into a different one and this agent's vault stays empty.",
        `- Run \`penguin config vault set --key <NAME> --value <value> --agent-id ${agentId} --project-id ${projectId} --root <data root>\` once per secret; when only the key name is wanted, store the placeholder value TODO and tell me what the key is for and where to apply for it.`,
        "- Never repeat a value back in your reply, and never read .vault.toml.",
        `- Finish with \`penguin config vault list --agent-id ${agentId} --project-id ${projectId} --root <data root>\` to list the key names.`,
      ].join("\n"),
    /** Prompt-injection controls (toggle card / template alert / prompt editor), mirroring the memory tab's set. */
    injection: {
      enable: "Enable vault",
      templateMissing:
        "The prompt template has no {{VAULT}} placeholder, so the vault section never enters the context.",
      legacyTemplate:
        "The template still carries the legacy hardcoded # Vault section: one-click migration replaces it in place with the {{VAULT}} placeholder, wording unchanged, after which it is editable below.",
      insertPlaceholder: "Insert the {{VAULT}} placeholder",
      migrate: "Migrate to the {{VAULT}} placeholder",
      promptSection: "Vault prompt",
      promptSectionHint:
        "What the template's {{VAULT}} placeholder expands to; nothing is injected when the toggle is off or the template lacks the placeholder.",
      promptLabel: "Prompt",
      promptPlaceholders: [
        [
          "{{VAULT_KEYS}}",
          'Vault key-name list (one "- KEY" line per key, names only — values are never injected; empty when no keys)',
        ],
      ] as ReadonlyArray<readonly [string, string]>,
    },
  },

  schedule: scheduleEn,

  /** Plugin library page (features/plugins/plugins-page.tsx): one card per library plugin, installed on agents as a whole. */
  plugins: pluginsEn,

  /** Agent settings "Hooks" tab (features/agents/hooks-tab.tsx): the hook packages installed on one agent — the list with its enable switch, the import modal (chat import / zip upload) and the export. The hook-point chips carry the bare point name (`stop`, `user_prompt`) and need no string. */
  hooks: {
    agentTabDesc:
      "Hook packages installed on this agent (agent_state/hooks/) — scripts the harness runs at the loop's hook points, e.g. after every Task. Uninstalling deletes the whole package directory.",
    agentTabEmpty: "No hook packages installed yet",
    /** Members see the switch state but cannot flip it (appended to the tab description). */
    readOnlyHint: "Only the Project owner can switch hooks on or off.",
    /** The agents page's hook-count stat (hover title / accessible name). */
    hookCount: (n: number): string => (n === 1 ? "1 hook package" : `${n} hook packages`),
    exportHook: "Export",
    importHook: "Import hook",
    importChatTitle: "Recommended: import it by chatting with the agent",
    importChatWhy:
      "The agent reads the source in full, reviews every script and installs the package on this agent — more reliable than a bare upload.",
    importSourceLabel: "Hook source",
    importSourceHint:
      "A URL, a GitHub repository, a local path, a description, or another tool's hook config (such as the hooks block of a Claude Code settings.json)",
    importSourcePlaceholder:
      'https://…, /path/to/hooks, or "write a stop hook that runs after every task…"',
    /** Preview placeholder shown in the generated prompt before a source is entered. */
    importSourceToken: "<source>",
    importPromptLabel: "Prompt to send to the agent (preview)",
    /** Lead sentence for a URL / repo / path source; free text (a description, a pasted hooks config) is used verbatim as the lead instead. Composed with importPromptTail by buildHookImportPrompt (features/agents/hook-import.ts). */
    importPromptLead: (s: string): string => `Import ${s} as a hook package.`,
    importCopyPrompt: "Copy prompt",
    importOpenChat: "Open a new chat",
    importUploadTitle: "Upload a hook package zip",
    importUploadDesc:
      "hooks.json and the scripts at the zip root, or exactly one top-level directory containing them. An import takes effect at once: while this agent has hooks on, its scripts run on this machine at every hook point, so import only what you trust.",
    importUploadAction: "Choose zip file",
    importUploading: "Uploading…",
    importDoneToast: "Hook package installed",
    importOverwriteTitle: "Overwrite installed hook package",
    importOverwriteBody: (name: string): string =>
      `The hook package "${name}" is already installed. Overwriting replaces all of its files (local edits included) and cannot be undone. Continue?`,
    importOverwriteAction: "Overwrite",
    /** The fixed tail joined after the lead (features/agents/hook-import.ts): the review step, the package format, the script contract and the install target, named by Project and Agent id. */
    importPromptTail: (projectId: string, agentId: string): string =>
      [
        "Read the source in full first and review every script for malicious behavior (exfiltrating data, touching files outside its source, running unknown commands); continue only once it is safe.",
        'Then produce a PenguinHarness hook package: a hooks.json (name, description, description_zh, version in the YYYY.MM.DD.N format, and one command list per hook point — stop / pre_tool_use / user_prompt — each entry { "command": "<script path relative to the package>", "timeout": <seconds> }) plus plain Node .mjs scripts using builtin modules only.',
        'Script contract: stdin carries one JSON object — at the stop point { "hook": "stop", "session_id", "trace_path" } (trace_path is the Trace file the Session is writing, absent without a Trace); the pre_tool_use point adds tool_name, tool_call_id and arguments (the raw argument JSON string); the user_prompt point carries scratchpad_dir and prompt instead. Empty stdout means no opinion; otherwise stdout is one JSON answer — stop: { "decision": "continue" | "stop", "input", "reason", "output", "subagent"? }, pre_tool_use: { "decision": "allow" | "deny", "reason", "output" }, user_prompt: { "context" }. A non-zero exit, non-JSON stdout or a timeout is recorded as a failure and ignored.',
        `Install it into agent_state/hooks/<name>/ of agent "${agentId}" in Project "${projectId}" (the directory name is the package name and must match ^[A-Za-z0-9_-]+$), then tell me what it does and at which hook point it fires.`,
      ].join("\n"),
    uninstallConfirmTitle: (name: string): string => `Uninstall ${name}`,
    uninstallConfirmBody: (name: string, agent: string): string =>
      `Uninstall the ${name} hook package from ${agent}? All of its scripts (local edits included) will be deleted.`,
    uninstalledToast: (name: string, agent: string): string =>
      `Uninstalled the ${name} hook package from ${agent}`,
    /** The Agent-level switch card at the top of the tab (usePromptInjection); hooks have no prompt half. */
    injection: {
      enable: "Enable hooks",
      enableHint:
        "With it on, every Session this agent starts runs all installed hook packages at the loop's hook points. With it off, a new Session runs no hooks at all and the installed packages stay on disk. A Task already running keeps the setting it started with.",
      savedToast: "Saved — takes effect from the next turn",
    },
  },

  pluginRegistry: {
    pageTitle: "Plugins",
    empty: "No plugins yet",
    specifierHint: "Package name, as a Project's plugin list names it",
    back: "Back to Plugins",
    readme: "Documentation",
    noReadme: "This plugin has no documentation yet.",
    notFound: "No such plugin.",
    /** Shown above the list when a source answered with nothing, so a short list is not read as a complete one. */
    sourceUnavailable: (count: number): string =>
      count === 1
        ? "One plugin source could not be reached, so this list may be incomplete."
        : `${count} plugin sources could not be reached, so this list may be incomplete.`,
    repository: "Repository",
    homepage: "Homepage",
    authors: "Authors",
    license: "License",
    copySpecifier: "Copy specifier",
    installHint:
      "Install from the Plugins page: the row's Install button asks the current Project for it.",
  },

  skills: skillsEn,

  chat: chatEn,

  /** Feishu-channel strings of the messaging binding editor (channel-neutral ones live under `messaging`). */
  feishu: {
    /** The what-binding-does FAQ fold's body (this channel's flavor). */
    intro:
      "Once bound, messages sent to the Feishu bot flow into this conversation, and the AI's replies are sent back to Feishu as plain text. You need a self-built Feishu app with the bot capability and the message-receive event subscribed in long-connection mode.",
    appId: "App ID",
    appSecret: "App Secret",
    /** Shown while a saved secret exists: submitting an empty field keeps it. */
    appSecretKeepHint: "Leave empty to keep the saved App Secret",
    /** The stored-secret row's clear checkbox (the models-page clear idiom). */
    clearSecret: "Clear stored App Secret",
    baseDomain: "API domain",
    baseDomainHint: "https://open.feishu.cn for Feishu, https://open.larksuite.com for Lark",
    invalidDomain: "The domain must be an http(s) URL",
    /** Why "send test message" is disabled before the bot has ever been messaged. */
    testMessageNoChat: "Message the bot once in Feishu first, so it knows which chat to send to",
    /** The setup FAQ fold's steps. */
    setupSteps: [
      "Create a self-built app in the Feishu developer console",
      "Enable the bot capability for the app",
      "Subscribe to the message-receive event, with the subscription mode set to long connection",
      "Copy the App ID and App Secret from the credentials page into the form above",
      "Publish an app version, get it approved, then message the bot once in Feishu",
    ],
  },

  /** Telegram-channel strings of the messaging binding editor (channel-neutral ones live under `messaging`). */
  telegram: {
    /** The what-binding-does FAQ fold's body (this channel's flavor). */
    intro:
      "Once bound, messages sent to the Telegram bot flow into this conversation, and the AI's replies are sent back to Telegram as plain text. Create a bot with @BotFather and paste its Bot Token — no public URL is needed.",
    botToken: "Bot Token",
    /** Shown while a saved token exists: submitting an empty field keeps it. */
    botTokenKeepHint: "Leave empty to keep the saved Bot Token",
    /** The stored-token row's clear checkbox (the models-page clear idiom). */
    clearToken: "Clear stored Bot Token",
    /**
     * The Bot Token field's corner link. Telegram has no developer console — the token is
     * issued by @BotFather inside the app — so this channel names the destination instead
     * of borrowing the shared "open developer console" label.
     */
    openBotFather: "Open @BotFather",
    invalidToken: "The Bot Token looks like <digits>:<secret>, as issued by @BotFather",
    /** Why "send test message" is disabled before the bot has ever been messaged. */
    testMessageNoChat: "Message the bot once in Telegram first, so it knows which chat to send to",
    /** The setup FAQ fold's steps. */
    setupSteps: [
      "Open @BotFather in Telegram and send /newbot to create a bot",
      "Name it as prompted, then copy the Bot Token @BotFather returns into the form above",
      "Find the bot in Telegram and send it one message",
    ],
  },

  /** QQ-channel strings of the messaging binding editor (channel-neutral ones live under `messaging`). */
  qq: {
    /** The what-binding-does FAQ fold's body (this channel's flavor). */
    intro:
      "Once bound, messages sent to the bot in QQ flow into this conversation, and the AI's replies are sent back to QQ. Create a bot on the QQ open platform and set its event subscription to WebSocket — no public URL is needed.",
    appId: "App ID",
    appSecret: "App Secret",
    /** Shown while a saved secret exists: submitting an empty field keeps it. */
    appSecretKeepHint: "Leave empty to keep the saved App Secret",
    /** The stored-secret row's clear checkbox (the models-page clear idiom). */
    clearSecret: "Clear stored App Secret",
    /** Why "send test message" is disabled before the bot has ever been messaged. */
    testMessageNoChat: "Message the bot once in QQ first, so it knows which chat to send to",
    /**
     * The rule that shapes this whole channel, stated where it is first needed rather than
     * left for the user to infer from a reply that never arrives.
     */
    repliesOnly:
      "QQ only lets a bot reply to a message you just sent it — it cannot start one. So a turn you begin in the web app is not mirrored to QQ, and once a few minutes have passed since your last QQ message, replies can no longer be delivered either. Send the bot another message in QQ to continue.",
    /** The passive-reply budget, in the terms a user experiences it. */
    replyBudget:
      "One QQ message can receive at most 4 replies (5 in a group). When a run produces more than that, the last one carries the rest combined — nothing is lost, it just arrives as a single message.",
    /** Scan-to-connect: the button, and the states it moves through. */
    scanStart: "Connect by QR",
    scanStarting: "Generating code…",
    /** In the setup fold: what scanning saves the user, in one line. */
    scanHint:
      "Or connect by QR: authorize in QQ by scanning, with no App ID or App Secret to copy by hand.",
    scanQrLabel: "QQ bot authorization QR code",
    scanWaiting: "Waiting to be scanned in QQ…",
    scanSteps:
      "Scan the code with QQ on your phone, then pick the bot to authorize on the page it opens and confirm.",
    /** Shown only after a code has actually lapsed and been replaced. */
    scanRefreshed: "The previous code expired; this is a new one.",
    /** Why the secret is safe to obtain this way — the question a careful user will ask. */
    scanPrivacy:
      "The credentials are received and stored by the server; the decryption key never reaches this browser.",
    scanDone: (appId: string): string =>
      `Saved the credentials for bot ${appId} — the connection can be enabled now`,
    scanFailed: (reason: string): string => `Scan-to-connect failed: ${reason}`,
    /** Shown when replacing lapsed codes stopped being worth another round trip. */
    scanExpiredRepeatedly:
      "The code kept expiring before it could be scanned. Try starting a new scan in a moment.",
    /** Why the scan button is gated while this channel holds the connection. */
    scanDisableFirst: "Disable the connection before rebinding by scan",
    /** Separates the scan path from the manual one; the fields below are the fallback, not the default. */
    scanOrManual: "Or enter them by hand",
    /** The setup FAQ fold's steps. */
    setupSteps: [
      "Register as a developer on the QQ open platform and create a bot",
      "Copy the App ID and App Secret from the development settings page into the form above",
      "Set the event subscription mode to WebSocket — leave the callback URL empty",
      "Add your own QQ account or a test group to the sandbox allowlist",
      "Find the bot in QQ and send it one message",
    ],
  },

  /** WeChat-channel strings of the messaging binding editor (channel-neutral ones live under `messaging`). */
  wechat: {
    /** The what-binding-does FAQ fold's body (this channel's flavor). */
    intro:
      "Once bound, messages sent to the bot in WeChat arrive in this conversation and the AI's replies go back to WeChat. Binding is a QR code scanned in WeChat — no public address, and no credential to apply for in any console.",
    /** The stored-token row's clear checkbox (the models-page clear idiom). */
    clearToken: "Clear stored Bot Token",
    /** Why this channel's form has no credential fields at all. */
    scanOnly:
      "A WeChat bot's credential comes only from scanning: there is no App ID or secret to fill in by hand.",
    /** Why "send test message" is disabled before the bot has ever been messaged. */
    testMessageNoChat:
      "Send the bot a message in WeChat first, so it knows which conversation to reply to",
    /**
     * The channel's shape, stated below its controls rather than left in a collapsed fold:
     * a user who binds it and then writes in a group sees nothing arrive.
     */
    directOnly:
      "This channel carries direct chats with the bot only; group messages never reach it.",
    /** What travels, and the one inbound kind that does not. */
    media:
      "Text, images and files travel in both directions. A voice message arrives as WeChat's own transcription of it; a recording WeChat could not transcribe cannot be read.",
    /** Scan-to-connect: the button, and the states it moves through. */
    scanStart: "Connect by scanning",
    /** The same control once a binding exists: scanning again replaces the stored credential. */
    scanRescan: "Scan again",
    scanStarting: "Generating the code…",
    scanQrLabel: "WeChat bot authorization QR code",
    scanWaiting: "Waiting for the code to be scanned in WeChat…",
    scanSteps: "Scan the code with WeChat on your phone, then confirm the authorization there.",
    /** Scanned but not yet confirmed: the phone is waiting, not this panel. */
    scanScanned: "Scanned — confirm the authorization on your phone.",
    /** Shown only after a code has actually lapsed and been replaced. */
    scanRefreshed: "The previous code lapsed; this one is new.",
    /** Why the credential is safe to obtain this way — the question a careful user will ask. */
    scanPrivacy:
      "The credential is received and stored by the server; it never reaches the browser.",
    scanDone: (botId: string): string =>
      `Saved the credential for bot ${botId} — the connection can be enabled now`,
    scanFailed: (reason: string): string => `Connecting by scan failed: ${reason}`,
    /** Shown when replacing lapsed codes stopped being worth another round trip. */
    scanExpiredRepeatedly:
      "The code lapsed before it was scanned several times over. Try again later.",
    /** The platform stopped accepting pairing codes for this scan. */
    scanBlocked:
      "Too many wrong pairing codes, so this scan is spent. Start a new one in a little while.",
    /** Not a failure: the bot is already bound here, so no new credential was issued. */
    scanAlreadyBound:
      "This bot is already bound, here or somewhere else, so no new token was issued. If this conversation is the one that should have it, unbind the bot where it is in use and scan again.",
    /** Why the scan button is gated while this channel holds the connection. */
    scanDisableFirst: "Disable the connection before rebinding it by scan",
    /** The pairing-code step: WeChat shows digits on the phone that must be typed here. */
    verifyPrompt: "Your phone is showing a number. Enter it to continue:",
    verifyLabel: "Pairing code",
    verifySubmit: "Confirm",
    verifySubmitting: "Submitting…",
    /** The setup FAQ fold's steps. */
    setupSteps: [
      "Press “Connect by scanning” above to generate the code",
      "Scan it with WeChat on your phone",
      "If your phone shows a number, type it into the panel",
      "Confirm the authorization on your phone; the credential is saved automatically",
      "Find the bot in WeChat and send it one message",
    ],
  },

  /** Discord-channel strings of the messaging binding editor (channel-neutral ones live under `messaging`). */
  discord: {
    /** The what-binding-does FAQ fold's body (this channel's flavor). */
    intro:
      "Once bound, direct messages to the Discord bot — and messages that @-mention it in a server channel or thread — flow into this conversation, and the AI's replies are sent back to the same channel. Create an application in the Discord developer portal, add a bot to it and paste its token — no public URL is needed.",
    botToken: "Bot Token",
    /** Shown while a saved token exists: submitting an empty field keeps it. */
    botTokenKeepHint: "Leave empty to keep the saved Bot Token",
    /** The stored-token row's clear checkbox (the models-page clear idiom). */
    clearToken: "Clear stored Bot Token",
    /** The Bot Token field's corner link: the developer portal's application list. */
    openPortal: "Open developer portal",
    invalidToken:
      "The Bot Token looks like three dot-separated segments, as copied from the Bot page of the developer portal",
    /** Why "send test message" is disabled before the bot has ever been messaged. */
    testMessageNoChat:
      "Message the bot once in Discord first, so it knows which channel to send to",
    /**
     * The rule that cannot wait for a collapsed fold: a server channel delivers only messages
     * that @-mention the bot, so a user who writes without the mention sees nothing arrive.
     */
    mentionOnly:
      "In a server channel or thread the bot reads only messages that @-mention it; direct messages reach it as they are.",
    /** The setup FAQ fold's steps. */
    setupSteps: [
      "Open the Discord developer portal, create an application, and on its Bot page reset the token and copy it into the form above",
      "Under OAuth2 → URL Generator pick the bot scope with the Send Messages, Read Message History and Attach Files permissions, then open the generated link to add the bot to your server",
      "@-mention the bot in a channel, or send it a direct message",
    ],
  },

  /**
   * Session ↔ messaging-bot binding: the dock panel, the row action + dialog, and the
   * channel-neutral editor strings (per-channel fields live under `feishu` / `telegram` /
   * `qq` / `wechat` / `discord`).
   */
  messaging: messagingEn,

  /** Subagents side panel: call-graph of the latest Task + the selected child conversation. */
  subagentPanel: {
    topologyLabel: "Call graph",
    mainSessionNote: "The main conversation stays in the chat area",
    empty: "No subagents in the current task yet",
    nodeRunning: "running",
    nodeDone: "done",
    openAsSession: "Jump to this session",
    subagentGone: "This subagent session no longer exists and could not be revived",
  },

  files: {
    title: "Files",
    upload: "Upload",
    download: "Download",
    /** Desktop shell's own window only: opens the previewed file's directory in the OS file manager. */
    revealInFolder: "Show in folder",
    /** Row / preview context menu: the two entries both kinds carry, then the kind-specific one. */
    copyPath: "Copy relative path",
    addToChat: "Add to conversation",
    addSelectionToChat: "Add selection to conversation",
    uploadHere: "Upload here",
    openInNewTab: "Open in new tab",
    previewNotIsolatedHint:
      "This address has no separate preview origin, so the page opens sandboxed: localStorage, cookies and third-party embeds will not work. Reach the app over 127.0.0.1 or localhost, or set PENGUIN_PREVIEW_ORIGIN.",
    refresh: "Refresh",
    /** The Workspace root, as the breadcrumbs and the drop overlay name it. "." is what a
     *  shell calls the working directory, so it needs no translation. */
    root: ".",
    empty: "Empty directory",
    previewUnsupported: "Preview not supported for this type; download instead",
    uploadedCount: (n: number): string => (n === 1 ? "1 file uploaded" : `${n} files uploaded`),
    uploading: (done: number, total: number): string => `Uploading ${done}/${total}…`,
    /** Oversize picks are named and skipped before anything is read. */
    uploadTooLarge: (names: string, mb: number): string =>
      `Over the ${mb}MB upload limit, skipped: ${names}`,
    /** A dropped folder is not a file the upload endpoint can take; it is named and skipped. */
    folderDropSkipped: (names: string): string => `Folders cannot be uploaded, skipped: ${names}`,
    /** Upload-overwrite confirmation: same-name files in the target directory will be replaced. */
    overwriteTitle: "Overwrite existing files",
    overwriteConfirm: (n: number): string =>
      `The target directory already has ${n} file(s) with these names — uploading will overwrite:`,
    loadFailed: "Failed to load",
    previewTruncated: "File too large; preview truncated, download for the full file",
    htmlRendered: "Preview",
    htmlSource: "Source",
    backToList: "Back to list",
    /** The tree pane: its accessible name and the toolbar toggle's two states. */
    treeLabel: "File tree",
    showTree: "Show file tree",
    hideTree: "Hide file tree",
    /** The divider between the tree and the preview: drag, or nudge with the arrow keys. */
    treeWidth: "Resize the file tree",
    /** The search box above the tree; it reaches only as far as the lazy tree has been loaded. */
    searchPlaceholder: "Search files",
    searchClear: "Clear search",
    searchNoMatch: "No matches in the Workspace",
    /** The walk is server-side and covers the whole Workspace, so it is not instant on a large one. */
    searching: "Searching…",
    /** The server stopped at its cap: what is listed is the shallowest matches, not all of them. */
    searchTruncated: (n: number): string => `Too many matches — showing the first ${n}`,
    selectFile: "Select a file to preview",
    /** Drop overlay label; `dir` is the directory the files will land in (the root's display name for the root). */
    dropToUpload: (dir: string): string => `Drop to upload into ${dir}`,
    /** In-place text editing. */
    editorLabel: (name: string): string => `Editing ${name}`,
    /** Soft-wrap toggle, shared by the source view and the editor: off means long lines scroll sideways. */
    wrapLines: "Wrap",
    unsaved: "Unsaved changes",
    saveTitle: "Save (Ctrl+S / ⌘S)",
    saveConfirmTitle: "Save file",
    saveConfirm: (name: string): string =>
      `Save changes to ${name}? The file in the Workspace will be overwritten.`,
    editTooLarge: (kb: number): string =>
      `The file is larger than ${kb}KB and cannot be edited here — download it instead`,
    saveTooLarge: (mb: number): string =>
      `The content exceeds the ${mb}MB write limit and was not saved`,
    discardTitle: "Discard unsaved changes",
    discardBody: (name: string): string => `${name} has unsaved changes. Discard them?`,
    discard: "Discard",
    unsavedRestored: (name: string): string => `Restored unsaved changes to ${name}`,
    /** The file was rewritten (by the Agent, most likely) while the editor was open on it. */
    changedOnDisk: "Changed on disk",
    changedOnDiskHint:
      "This file has been rewritten since you opened it — saving replaces that version with yours.",
    /** Rename and move are one action: both write the file to a new Workspace-relative path. */
    /** The composer chip's remove button, for whatever the Files panel staged there. */
    removeReference: "Remove reference",
    renameTitle: "Rename or move",
    renameLabel: "New path",
    renameHint:
      "Relative to the Workspace root; a directory in the path that does not exist is created",
    renameConfirm: "Move",
    renameTargetExists: (path: string): string => `${path} already exists, so nothing was changed.`,
    renamed: (name: string): string => `Moved to ${name}`,
    deleteTitle: "Delete file",
    deleteBody: (name: string): string => `Delete ${name}? It does not go to a trash folder.`,
    deleted: (name: string): string => `Deleted ${name}`,
    /** Both actions read the file's current version first; until it lands there is nothing to refuse an overwrite with. */
    actionVersionReading: "Reading this file's current version…",
    actionVersionFailed:
      "This file's current version could not be read, so the action is not offered.",
    /** The version precondition refused it: the Agent wrote the file while the question was on screen. */
    changedBeforeAction: (name: string): string =>
      `${name} was rewritten while you were deciding, most likely by the Agent during its turn, so nothing was changed. Refresh and try again.`,
    conflictTitle: "File changed on disk",
    conflictBody: (name: string): string =>
      `${name} was rewritten after you opened it, most likely by the Agent during its turn, so nothing was saved. Overwrite it with your version, or keep editing and copy what you need out first — either way your text is kept.`,
    overwriteAnyway: "Overwrite",
  },

  usage: usageEn,

  /** The Trace panel's own view of a Trace file (trace-file-view / timeline-chart); the standalone browsing page these once also served is gone. */
  traces: tracesEn,

  benchmark: benchmarkEn,

  /** Company mode: the organization switcher and dialogs, and the six organization pages. */
  company: companyEn,
  errors: {
    networkError: "Network error, please check your connection",
    modelCredentialMissing: (modelId: string) =>
      `Model ${modelId} has no API key yet — configure it on the Models page first`,
    noDefaultModel: "This project has no default model yet — add one on the Models page first",
    /** Localized text for the common server error codes (server error messages are English-only); looked up by ApiError.code in apiErrorText, falling back to the raw message for unmapped codes. */
    byCode: {
      invalid_credentials: "Incorrect username or password.",
      too_many_attempts: "Too many failed sign-in attempts. Try again shortly.",
      password_mismatch: "The current password is incorrect.",
      invalid_password: "Password must be at least 8 characters.",
      admin_required: "Only an admin can perform this operation.",
      desktop_single_user: "The desktop app is single-user; user management is unavailable.",
      not_found: "This resource does not exist, or you do not have access.",
      internal: "The server hit an internal error. Please try again shortly.",
      agent_not_found: "This agent no longer exists.",
      unknown_agent: "That agent does not exist in this Project.",
      agent_exists: "This agent id is already taken.",
      agent_deleting: "This agent is being deleted.",
      project_exists: "This Project id is already taken.",
      project_not_found: "This Project no longer exists, or you do not have access.",
      modelscope_refresh_failed:
        "ModelScope authorization could not be renewed after repeated attempts. Re-authorize it on the Models page.",
      cannot_delete_last_project: "This is the last Project and cannot be deleted.",
      user_exists: "This username is already taken.",
      user_not_found: "This user no longer exists.",
      cannot_delete_admin: "The built-in admin cannot be deleted.",
      member_not_found: "This user is not a member of the Project.",
      already_member: "This user is already a member of the Project.",
      already_owner: "This user is already an owner of the Project.",
      memory_import_confirm_required:
        "This import would overwrite or delete memories. Confirm it to continue.",
      schedule_exists: "A scheduled task with this name already exists.",
      schedule_not_found: "This scheduled task no longer exists.",
      unknown_skill: "This skill is not in the selected directory.",
      unknown_plugin: "This plugin is not in the plugin library.",
      goal_plugin_not_installed:
        "Goal mode needs the goal plugin — install it on this agent from the plugin library, and switch its hook package on.",
      skill_too_large: "This skill directory exceeds the import limits.",
      hook_too_large: "This hook package exceeds the import limits.",
      file_not_found: "This file no longer exists.",
      not_pending: "This steering message already reached the model and can no longer be recalled.",
      follow_up_started: "This follow-up already started and can no longer be recalled.",
      file_too_large: "The file is too large.",
      too_many_files: "Too many files attached to one message.",
      payload_too_large: "The request is too large.",
      image_too_large: "The image is too large to send inline.",
      dir_not_absolute: "The directory must be an absolute path.",
      dir_not_found: "That directory does not exist or is inaccessible.",
      not_a_dir: "That path is not a directory.",
      path_not_found: "That path does not exist.",
      reveal_failed: "Could not open the folder.",
      workspace_missing: "This Session's Workspace no longer exists.",
      workspace_not_found: "That Workspace does not exist, or is not a directory.",
      session_not_found: "This Session no longer exists, or you do not have access.",
      session_deleting: "This Session is being deleted.",
      approval_not_found: "This approval request was already answered, or is no longer valid.",
      process_not_found: "This background process already exited, or was removed.",
      process_running: "This background process is still running — stop it before removing it.",
      memory_file_not_found: "This memory file no longer exists.",
      memory_scope_not_found: "This memory scope no longer exists.",
      task_in_progress: "This Session already has a task running.",
      compacting: "This Session is compacting its context and is not accepting new input.",
      shutting_down: "The server is shutting down. Please try again shortly.",
      platform_rate_limited:
        "Too many platform authorization requests. Try again when the countdown ends.",
      // The three "cannot compact" reasons each have their own server code, so each keeps its
      // own explanation here — collapsing them into one sentence would tell a user who just
      // compacted that they have never spoken.
      compaction_not_configured: "This agent does not have context compaction configured.",
      nothing_to_compact:
        "There is nothing to compact in the current context yet (no completed conversation turn).",
      already_compacted:
        "The context was just compacted and nothing has been said since — no need to compact again.",
      version_conflict: "The snapshot's version is not newer than the current one.",
      invalid_title: "The title is invalid.",
      invalid_proxy_url:
        "Invalid proxy address — use an http(s):// or socks5:// proxy URL, or host[:port].",
      invalid_attachment_limit:
        "Invalid upload limit — use a whole number of MB inside the allowed range, with the total no lower than the per-file limit.",
      invalid_trace: "This file is not a valid Trace file.",
      trace_not_found: "This Trace file no longer exists.",
      trace_session_exists:
        "This agent already has a Session with that id; a duplicate Trace cannot be imported.",
      feishu_secret_required: "App Secret is required.",
      feishu_not_bound: "This Session has no Feishu binding yet.",
      feishu_no_chat: "No Feishu message received yet — message the bot once in Feishu first.",
      feishu_send_failed: "Sending the Feishu message failed.",
      telegram_token_required: "Bot Token is required.",
      telegram_token_invalid: "The Bot Token is malformed: it looks like <digits>:<secret>.",
      telegram_not_bound: "This Session has no Telegram binding yet.",
      telegram_no_chat:
        "No Telegram message received yet — message the bot once in Telegram first.",
      telegram_send_failed: "Sending the Telegram message failed.",
      discord_token_required: "Bot Token is required.",
      discord_token_invalid:
        "The Bot Token is malformed: it looks like three dot-separated segments, as copied from the developer portal.",
      discord_not_bound: "This Session has no Discord binding yet.",
      discord_no_chat: "No Discord message received yet — message the bot once in Discord first.",
      discord_send_failed: "Sending the Discord message failed.",
      another_channel_enabled:
        "Another channel's connection is enabled on this conversation: disable it first.",
      // Deliberately names nothing about the other conversation: it may live in a Project
      // this user cannot see, and the remedy does not depend on knowing which one it is.
      account_enabled_elsewhere:
        "This bot's connection is enabled on another conversation: turn it off there first.",
      messaging_disable_before_clear:
        "Disable this channel's connection before clearing its credential.",
      messaging_disable_before_scan:
        "Disable this channel's connection before rebinding it by scan.",
      company_mode_off: "Company mode is turned off on this server.",
      org_not_found: "This organization no longer exists.",
      org_exists: "That organization id is already taken.",
      org_invalid:
        "This organization's configuration needs repair; it accepts no changes until then.",
      invalid_org_id:
        "Invalid organization id: 2–64 characters, a lowercase letter first, then lowercase letters, digits or underscores.",
      employee_not_found: "That Agent is not an employee of this organization.",
      employee_exists: "That Agent is already an employee of this organization.",
      calendar_event_exists: "A calendar event with that name already exists.",
      calendar_event_not_found: "That calendar event no longer exists.",
      desk_unavailable: "The desk session could not be opened.",
      ticket_not_found: "That ticket no longer exists.",
      ticket_invalid: "This ticket file needs repair; it accepts no changes until then.",
      ticket_session_failed: "The ticket session could not be started.",
      handbook_file_not_found: "That document no longer exists.",
      handbook_index_required: "The handbook index (README.md) cannot be deleted.",
    },
  },
};
