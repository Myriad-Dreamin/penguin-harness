/**
 * The company module's public entry: everything outside this directory reaches it through here
 * (test/module-boundaries.test.ts fails on an import that goes around it).
 */
export { BetaBadge, markBetaNoticeShown, shouldShowBetaNotice } from "./beta-badge";
export { CalendarPage } from "./calendar-page";
export { channelDraftKey, loadChannelDraft, storeChannelDraft } from "./channel-draft";
export { channelBadgeCounts } from "./channel-list";
export { ChannelMessageBody, ChannelReaderProvider } from "./channel-markdown";
export { ChannelRailRows, ChannelSidebar } from "./channel-sidebar";
export { ChannelView } from "./channel-view";
export {
  COMPANY_NAV_KEYS,
  isOrgRoute,
  ORG_PAGE_RENDERERS,
  orgContributedPagePath,
  orgKey,
  orgPagePath,
  orgPageRows,
  orgProposalPath,
  parseOrgKey,
  type WorkMode,
} from "./company-nav";
export { COMPANY_NAV_ICONS, ORG_PAGE_ICONS } from "./company-nav-icons";
export { switchDeskModel } from "./desk-model";
export { EmployeeAvatar } from "./employee-avatar";
export { FinancePage } from "./finance-page";
export { HandbookPage } from "./handbook-page";
export { OrgChartPage } from "./org-chart-page";
export {
  OrgEmptyLine,
  OrgIndexRedirect,
  OrgLayout,
  OrgPage,
  OrgSection,
  useOrg,
} from "./org-layout";
export { DeskRailRows, OrgSessionGroups } from "./org-session-groups";
export { withDeskMessagingChannel } from "./org-sessions";
export { NoOrganizationsSidebar, OrgSwitcher } from "./org-switcher";
export { OverviewPage } from "./overview-page";
export { dismissHint, hintKey, isHintDismissed } from "./page-hints";
export { ErrorLine, JumpButton, PrincipalChip, principalLabel, TitleButton } from "./shared";
export { TicketsPage } from "./tickets-page";
