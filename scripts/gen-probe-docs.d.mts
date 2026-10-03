/** Types for gen-probe-docs.mjs, which the web's vite config and the server's tests import. */
export declare const PROBE_DOCS_DIR: string;
export declare const PROBE_DOCS_LANGS: string[];
export declare const PROBE_SUMMARIES_DEFINE: "__PENGUIN_PROBE_SUMMARIES__";
export declare function renderProbeDocs(root?: string): Record<string, string>;
export declare function probeSummaries(root?: string): Record<string, Record<string, string>>;
export declare function probeSummariesDefine(root?: string): Record<string, string>;
