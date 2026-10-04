/** Types for build-plugins.mjs (plain JavaScript: deploy.mjs and the desktop build run it directly). */
import type { Hash } from "node:crypto";

export interface BuiltPlugins {
  dir: string;
  files: string[];
  plugins: Array<{ name: string; version: string }>;
  tree: string;
  tarballs: string;
}
export declare function hashBuildInputs(h: Hash, root?: string): Promise<void>;
export declare function buildBuiltinPlugins(opts?: {
  log?: (m: string) => void;
}): Promise<BuiltPlugins>;
export declare function prefixLayout(built: BuiltPlugins): Map<string, { path: string }>;
export declare function stagePrefix(built: BuiltPlugins, dest: string): Promise<void>;
