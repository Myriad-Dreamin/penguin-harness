/** Types for build-plugin.mjs (plain JavaScript: a plugin's build runs it directly). */
export declare function buildPlugin(
  dir?: string,
  opts?: { minify?: boolean },
): Promise<{ web: string[]; server: string[] }>;
export declare function stylePrefixOf(css: string): string | null;
export declare function unprefixedClasses(css: string, prefix: string): string[];
export declare function prefixClashes(prefixes: Iterable<[string, string]>): string[];
