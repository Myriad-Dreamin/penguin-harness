/**
 * Which Claude Code session continues which roadmap of an organization: a file in the
 * organization's directory, written by whoever creates or enters those sessions (not by this
 * plugin), read here by the open link and by the roadmap page's "Open session" button.
 *
 *   <root>/<projectId>/organizations/<orgId>/claude-sessions.json
 *   { "roadmaps": { "<n>": { "sessionId": "<claude session id>", "agentId": "<employee>" } } }
 *
 * It is a pointer only — no session content. It is read strictly: a file that is missing, is
 * not JSON, or is not of that shape counts as no mapping at all, and so does an entry with a key
 * that is not a roadmap number, an id that could not name a session or an employee, or a field
 * of its own; the entries around it still count.
 */
import fsp from "node:fs/promises";
import path from "node:path";
import { CLAUDE_SESSION_ID } from "./runs.js";

/** The file's name in the organization's directory. */
export const ROADMAP_SESSIONS_FILE = "claude-sessions.json";

/** An employee id as the mapping may name one. */
const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

/** A roadmap number as a key: a positive integer, written plainly. */
const ROADMAP_KEY = /^[1-9][0-9]{0,8}$/;

/** One roadmap's session: the Claude Code session id, and the employee it is continued as. */
export interface RoadmapSession {
  sessionId: string;
  agentId: string;
}

/** `<root>/<projectId>/organizations/<orgId>/claude-sessions.json`. */
export function roadmapSessionsPath(root: string, projectId: string, orgId: string): string {
  return path.join(root, projectId, "organizations", orgId, ROADMAP_SESSIONS_FILE);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The file's text read as a mapping, roadmap number → session; anything off-shape is left out. */
export function parseRoadmapSessions(text: string): Map<number, RoadmapSession> {
  const out = new Map<number, RoadmapSession>();
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return out;
  }
  if (!isRecord(doc) || Object.keys(doc).some((k) => k !== "roadmaps")) return out;
  const roadmaps = doc.roadmaps;
  if (!isRecord(roadmaps)) return out;
  for (const [key, entry] of Object.entries(roadmaps)) {
    if (!ROADMAP_KEY.test(key) || !isRecord(entry)) continue;
    const keys = Object.keys(entry);
    if (keys.length !== 2 || !keys.includes("sessionId") || !keys.includes("agentId")) continue;
    const { sessionId, agentId } = entry;
    if (typeof sessionId !== "string" || !CLAUDE_SESSION_ID.test(sessionId)) continue;
    if (typeof agentId !== "string" || !AGENT_ID.test(agentId)) continue;
    out.set(Number(key), { sessionId, agentId });
  }
  return out;
}

/** The organization's mapping; empty when there is no file or it cannot be read. */
export async function readRoadmapSessions(
  root: string,
  projectId: string,
  orgId: string,
): Promise<Map<number, RoadmapSession>> {
  let text: string;
  try {
    text = await fsp.readFile(roadmapSessionsPath(root, projectId, orgId), "utf8");
  } catch {
    return new Map();
  }
  return parseRoadmapSessions(text);
}
