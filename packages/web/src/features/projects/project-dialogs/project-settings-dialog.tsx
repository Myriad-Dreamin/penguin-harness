/**
 * Project settings, opened from the sidebar's Project switcher: the dialog routes its tabs, and
 * each tab's page (general, members, chat defaults, security policy) is a file of its own.
 */
import { useEffect, useState } from "react";
import { ICONS, InfoPopover, Modal, NavList, NavRow } from "@prismshadow/penguin-ui";
import { S } from "../../../lib/strings";
import { useProject } from "../../../state/project";
import { useAuth } from "../../../state/auth";
import { GeneralSection } from "./general-section";
import { MembersSection } from "./members-section";
import { ChatDefaultsSection } from "./chat-defaults-section";
import { SecurityPolicySection } from "./security-policy-section";

/** The settings tabs' small icons (stroked like NAV_ICONS). */
const TAB_ICON_PATHS = {
  general: ICONS.gear,
  /** Two people: Project members are humans, so the Agent glyph does not stand in here. */
  members: ICONS.users,
  /** Three sliders set at different heights. */
  defaults: ICONS.sliders,
  /** The shield with a check: the policy that guards the Project. */
  security: ICONS.shieldCheck,
} as const;

type SettingsTab = keyof typeof TAB_ICON_PATHS;

/**
 * Project settings dialog: a left tab rail (General / Members / Defaults / Security
 * policy) with a row-styled content pane per tab; on narrow screens the rail degrades to a
 * horizontally scrollable strip above the content. Members does not exist in the
 * single-user desktop app (the server answers desktop_single_user on those routes), so the
 * tab is hidden there outright. Each page component owns its data and save flow; the
 * dialog only routes tabs, resetting to General per open.
 */
export function ProjectSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { desktopMode } = useAuth();
  const { currentProject } = useProject();
  const [tab, setTab] = useState<SettingsTab>("general");

  useEffect(() => {
    if (open) setTab("general");
  }, [open]);

  const projectId = currentProject?.projectId;
  const isOwner = currentProject?.role === "owner";
  if (!currentProject || !projectId) return null;

  // `info` is the page's semantic explanation, disclosed by a "?" beside the pane heading —
  // the only title these pages have, since each section renders its rows without repeating it.
  const tabs: { key: SettingsTab; label: string; info?: string }[] = [
    { key: "general", label: S.project.settingsTabGeneral },
    ...(!desktopMode ? [{ key: "members" as const, label: S.project.settingsTabMembers }] : []),
    { key: "defaults", label: S.project.settingsTabDefaults },
    {
      key: "security",
      label: S.project.settingsTabSecurity,
      info: S.project.commandPolicyInfo,
    },
  ];
  const active = tabs.find((t) => t.key === tab) ?? tabs[0]!;

  return (
    <Modal open={open} title={S.project.settingsTitle} onClose={onClose} widthClass="sm:max-w-3xl">
      <div className="flex flex-col gap-3 sm:min-h-[26rem] sm:flex-row sm:gap-0">
        <NavList
          label={S.project.settingsTitle}
          orientation="responsive"
          className="shrink-0 sm:w-44 sm:border-r sm:border-line-muted sm:pr-3"
        >
          {tabs.map((t) => (
            <NavRow
              key={t.key}
              label={t.label}
              glyph={TAB_ICON_PATHS[t.key]}
              active={active.key === t.key}
              onClick={() => setTab(t.key)}
            />
          ))}
        </NavList>
        <section className="min-w-0 flex-1 sm:pl-5">
          <h3 className="flex items-center gap-1.5 text-base font-semibold">
            {active.label}
            {active.info !== undefined && (
              <InfoPopover label={active.label}>{active.info}</InfoPopover>
            )}
          </h3>
          <div className="mt-2">
            {active.key === "general" && (
              <GeneralSection projectId={projectId} isOwner={isOwner} onClose={onClose} />
            )}
            {active.key === "members" && <MembersSection projectId={projectId} isOwner={isOwner} />}
            {active.key === "defaults" && (
              <ChatDefaultsSection projectId={projectId} isOwner={isOwner} />
            )}
            {active.key === "security" && (
              <SecurityPolicySection projectId={projectId} isOwner={isOwner} />
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
