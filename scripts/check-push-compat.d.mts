/**
 * Types for check-push-compat.mjs. The module is plain JavaScript because scripts/deploy.mjs
 * loads it directly; this lets packages/server's typechecked test import the same functions
 * the push uses instead of re-stating the rules.
 */

/** A tree's files: repo-relative path → source text, or null when the tree has no such file. */
export type TreeReader = (rel: string) => string | null;

export interface HmrInterfacesFace {
  family: string;
  need: Record<string, readonly string[]>;
}

export interface PlatformApiFace {
  heritage: string;
  members: readonly string[];
}

export interface LedgerEntry {
  name: string;
  swapSafe: boolean;
}

export interface DeclaredResourcesFace {
  family: string;
  groups: Record<string, readonly string[]>;
}

export interface TreeFaces {
  interfaces: HmrInterfacesFace;
  platform: PlatformApiFace;
  ledger: readonly LedgerEntry[];
  resources: DeclaredResourcesFace;
}

export interface FaceComparison {
  violations: string[];
  doomed: string[];
}

export interface GateResult extends FaceComparison {
  ran: boolean;
  why: string;
}

export declare function extractHmrInterfaces(source: string | null): HmrInterfacesFace | null;
export declare function extractPlatformApiMembers(source: string | null): PlatformApiFace | null;
export declare function extractMigrationsLedger(read: TreeReader): readonly LedgerEntry[] | null;
export declare function extractDeclaredResources(read: TreeReader): DeclaredResourcesFace | null;
export declare function compareFaces(push: TreeFaces, target: TreeFaces): FaceComparison;
export declare function targetTreeCommit(report: unknown): { sha: string | null; why: string };
export declare function recoveredFromRefusal(text: string): boolean | null;
export declare function checkPushCompat(options: {
  readPush: TreeReader;
  readTarget: TreeReader;
}): GateResult;
