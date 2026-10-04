/** Types for web-shared.mjs (plain JavaScript: the plugin build runs it directly). */
export declare const SHARED_GLOBAL: string;
export declare const SHARED: Readonly<Record<string, string>>;
export declare const UI_SURFACE: string;
export declare function uiSurfaceNames(file?: string): string[];
export declare function sharedPlugin(opts?: { uiNames?: readonly string[] }): {
  name: string;
  setup(build: unknown): void;
};
export declare function foreignCopies(inputs: readonly string[]): string[];
