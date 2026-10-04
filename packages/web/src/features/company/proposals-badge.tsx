/**
 * The proposals row's unread count (`SidebarModule.navBadges`), anchored on the contributed
 * proposals page's row by its renderer's name (sidebar-mode.tsx keys those rows so): the open
 * organization's unread proposal events, the way a channel row wears its unread count. The
 * pinned column draws the count with a tooltip saying what it counts; the rail, with no room for
 * the number, a dot whose name and tooltip say how many.
 */
import { S } from "../../lib/strings";
import type { NavBadge } from "../../lib/sidebar-contributions";
import { useCompany } from "./company-state";

function ProposalsUnreadCount() {
  const count = useCompany().unreadProposals;
  if (count <= 0) return null;
  return (
    <span className="ml-auto shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
      {count}
    </span>
  );
}

export const proposalsUnreadBadge: NavBadge = {
  useNote: () => {
    const count = useCompany().unreadProposals;
    return count > 0 ? S.company.proposals.unreadNote(count) : null;
  },
  Mark: ProposalsUnreadCount,
};
