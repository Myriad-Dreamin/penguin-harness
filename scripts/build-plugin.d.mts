/** Types for build-plugin.mjs (plain JavaScript: a plugin's build runs it directly). */
export declare function buildPlugin(
  dir?: string,
  opts?: { minify?: boolean },
): Promise<{ web: string[]; server: string[] }>;
