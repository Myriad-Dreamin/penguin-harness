/** Types for probe-sites.mjs, which the web's vite config and the server's tests import. */
export declare const PROBE_SITES_DEFINE: "__PENGUIN_PROBE_SITES__";
export declare function probeSites(dirs: string[], root?: string): Record<string, string>;
export declare function githubRepo(origin: string | null): string;
export declare function probeSitesDefine(dirs: string[]): Record<string, string>;
