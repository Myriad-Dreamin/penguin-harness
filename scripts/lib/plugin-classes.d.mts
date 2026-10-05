/** Types for plugin-classes.mjs (plain JavaScript: the plugin build runs it directly). */
export declare function classPrefixOf(packageName: string): string;
export declare function classNamesOf(css: string): string[];
export declare function unprefixedClasses(css: string, prefix: string): string[];
export declare function prefixedInput(
  css: string,
  prefix: string,
  names: readonly string[],
): { input: string; problem?: undefined } | { input?: undefined; problem: string };
export declare function classRuntimeSource(prefix: string, names: readonly string[]): string;
export declare function classRuntimePlugin(
  prefix: string,
  names: readonly string[],
): { name: string; setup(build: unknown): void };
