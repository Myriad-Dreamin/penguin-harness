/**
 * Roadmaps in the company layout (pure, unit tested). The company-roadmaps plugin serves its own
 * page; what the app itself does with roadmaps is two things, both keyed off that page being
 * contributed (key `roadmaps`, an iframe page — the same contribution the org nav used to draw a
 * row for):
 *
 * - the sidebar's ROADMAPS section, below the channel list and apart from it: the most recently
 *   active roadmaps under discussion, five at rest, the rest behind an expand;
 * - a roadmap's room is its channel, shown by the app's own channel page, and that page puts the
 *   roadmap in a column beside the stream, drawn by the app from the plugin's answer for that
 *   roadmap (roadmap-detail.tsx; the rows it lists are {@link roadmapRows}).
 */
import type { OrgRoadmapApproval, OrgRoadmapDetail, OrgRoadmapItem } from "../../api/endpoints";

/** The contributed page's key the app knows as the roadmaps page. */
export const ROADMAPS_PAGE_KEY = "roadmaps";

/** How many roadmaps the sidebar section shows before its expand. */
export const ROADMAPS_SHOWN = 5;

/** The roadmaps page's iframe src when it is contributed; null when the plugin is not there. */
export function roadmapsPageSrc(
  pages: ReadonlyArray<{
    key: string;
    nav: string;
    renderer: { builtin: string } | { iframe: { src: string } };
  }>,
): string | null {
  for (const page of pages) {
    if (page.key !== ROADMAPS_PAGE_KEY || page.nav !== "org") continue;
    if ("iframe" in page.renderer) return page.renderer.iframe.src;
  }
  return null;
}

/**
 * Where an item stands, as its row says it: `draft` while the roadmap is still discussed,
 * `brief` once established but still waiting for its two approvals (a proposal item), and
 * `delegated` once it went out — its proposal linked, or its roadmap derived, or on the way.
 */
export type RoadmapRowStage = "draft" | "brief" | "delegated";

/** One row of the room's column: an item of the roadmap, with what became of it. */
export interface RoadmapRow {
  key: string;
  kind: "proposal" | "roadmap";
  title: string;
  brief: string;
  /** Who the row names, as principals (`agent:<id>`): a proposal item's owner, a roadmap item's employees. */
  people: string[];
  /** The proposal linked back to a proposal item, when there is one. */
  proposal: number | null;
  /** The roadmap a roadmap item derived, when there is one. */
  child: number | null;
  stage: RoadmapRowStage;
  /** A brief's two approvals (null where the row is not a brief). */
  approvals: { person: OrgRoadmapApproval | null; moderator: OrgRoadmapApproval | null } | null;
}

/**
 * The column's rows: every item of the roadmap, the proposal items first and the roadmap items
 * after them, each in the draft's own order.
 */
export function roadmapRows(r: OrgRoadmapDetail): RoadmapRow[] {
  const established = r.status === "established";
  const rows = r.items.map((item): RoadmapRow => {
    const d = r.delegations[item.key];
    const stage: RoadmapRowStage = !established
      ? "draft"
      : d !== undefined && d.stage === "brief"
        ? "brief"
        : "delegated";
    return {
      key: item.key,
      kind: item.kind,
      title: item.title,
      brief: item.brief,
      people: (item.kind === "proposal" ? [item.owner] : item.employees).map((id) => `agent:${id}`),
      proposal: item.kind === "proposal" && d?.proposal !== undefined ? d.proposal : null,
      child: item.kind === "roadmap" && d !== undefined ? d.child : null,
      stage,
      approvals:
        stage === "brief"
          ? { person: d?.approvals?.person ?? null, moderator: d?.approvals?.moderator ?? null }
          : null,
    };
  });
  return [
    ...rows.filter((x) => x.kind === "proposal"),
    ...rows.filter((x) => x.kind === "roadmap"),
  ];
}

/** A person may add their approval to a brief that does not have it yet. */
export function personMayApprove(row: RoadmapRow): boolean {
  return row.stage === "brief" && row.approvals !== null && row.approvals.person === null;
}

/** When a roadmap last moved: its latest ledger event, else when it was opened. */
export function lastActivity(r: OrgRoadmapItem): string {
  let latest = r.createdAt;
  for (const e of r.events ?? []) if (e.at > latest) latest = e.at;
  return latest;
}

/** Active: under discussion, not shelved, with a room to go to. */
export function isActiveRoadmap(r: OrgRoadmapItem): r is OrgRoadmapItem & { channelId: string } {
  return r.status === "discussing" && !r.archived && r.channelId !== null;
}

/**
 * The sidebar section's rows: the active roadmaps, most recently active first (ties: the higher
 * number first), split into the first {@link ROADMAPS_SHOWN} and the rest.
 */
export function sidebarRoadmaps(roadmaps: readonly OrgRoadmapItem[]): {
  shown: Array<OrgRoadmapItem & { channelId: string }>;
  more: Array<OrgRoadmapItem & { channelId: string }>;
} {
  const active = roadmaps
    .filter(isActiveRoadmap)
    .map((r) => ({ r, at: lastActivity(r) }))
    .sort((a, b) => (a.at === b.at ? b.r.number - a.r.number : a.at < b.at ? 1 : -1))
    .map((x) => x.r);
  return { shown: active.slice(0, ROADMAPS_SHOWN), more: active.slice(ROADMAPS_SHOWN) };
}
