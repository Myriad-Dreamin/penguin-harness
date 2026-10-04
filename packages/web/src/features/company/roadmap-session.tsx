/**
 * "Open session" beside a roadmap's title in its room's column (roadmap-detail.tsx): a link into
 * the Claude Code session that continues the roadmap, when the claude-code plugin's mapping names
 * one (`GET …/claude-code/sessions`). The link is that plugin's own route,
 * `/api/claude-code/open?org=&project=&roadmap=`, which finds the session and opens it as the
 * mapped employee — so the app learns only whether there is one, never the session id.
 *
 * Without the claude-code plugin (its console page is not among the contributed pages) nothing
 * is asked; a failed read is no button. Nothing here is load-bearing for the column.
 */
import { useEffect, useState } from "react";
import { buttonClass } from "@prismshadow/penguin-ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { machineForOrg } from "../../lib/org-machines";
import { useOrgPages } from "./use-org-pages";

/** The roadmap's session as the column shows it: where the link goes, and as whom. */
export interface RoadmapSession {
  href: string;
  agentId: string;
}

/** The claude-code plugin's console page key: present exactly when that plugin is installed. */
const CLAUDE_CODE_PAGE_KEY = "claude-code";

/**
 * The open-by-roadmap link. An organization on another machine is asked there, through this
 * server's `/server/<machine>/`, with `machine=` riding along so the redirect names it.
 */
export function roadmapSessionHref(
  projectId: string,
  orgId: string,
  number: number,
  machine: string | null,
): string {
  const params = new URLSearchParams({ org: orgId, project: projectId, roadmap: String(number) });
  if (machine !== null) params.set("machine", machine);
  const base = machine === null ? "" : `/server/${encodeURIComponent(machine)}`;
  return `${base}/api/claude-code/open?${params}`;
}

/** The roadmap's session, once the mapping is read; null without one (or without the plugin). */
export function useRoadmapSession(
  projectId: string,
  orgId: string,
  number: number,
): RoadmapSession | null {
  const pages = useOrgPages();
  const enabled = pages.some((p) => p.key === CLAUDE_CODE_PAGE_KEY && p.nav === "org");
  const key = `${projectId}/${orgId}/${number}`;
  const [found, setFound] = useState<{ key: string; agentId: string } | null>(null);
  useEffect(() => {
    setFound(null);
    if (!enabled) return;
    let live = true;
    api
      .listOrgClaudeSessions(projectId, orgId)
      .then((res) => {
        const hit = res.roadmaps.find((r) => r.roadmap === number);
        if (live && hit !== undefined) setFound({ key, agentId: hit.agentId });
      })
      .catch(() => {
        // No mapping to read: no button.
      });
    return () => {
      live = false;
    };
  }, [enabled, projectId, orgId, number, key]);
  if (!enabled || found === null || found.key !== key) return null;
  return {
    href: roadmapSessionHref(projectId, orgId, number, machineForOrg(projectId, orgId)),
    agentId: found.agentId,
  };
}

/** The link itself, in the secondary button's look; `name` is the employee as the column names it. */
export function RoadmapSessionLink({ session, name }: { session: RoadmapSession; name: string }) {
  return (
    <a
      href={session.href}
      title={S.company.roadmaps.openSessionTitle(name)}
      className={`${buttonClass("secondary", "sm")} ml-auto focus-visible:[outline:var(--ui-focus-ring)] focus-visible:[outline-offset:var(--ui-focus-ring-offset)]`}
      data-roadmap-session=""
    >
      {S.company.roadmaps.openSession}
    </a>
  );
}
