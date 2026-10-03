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

/** Path data for the settings tabs' small icons (24px viewBox, stroked like NAV_ICONS). */
const TAB_ICON_PATHS = {
  general: ICONS.gear,
  /** Two people (lucide users). Project members are humans — the Agent glyph used to stand in here. */
  members:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  /** Sliders (lucide sliders-vertical). */
  defaults: "M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6",
  /** Shield (lucide shield). */
  security: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
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
