/** Types for plugin-sides.mjs (plain JavaScript: gen-ifaces runs it directly). */
export type Side = "server" | "web";
export interface HostTable {
  modules?: Record<string, { provides?: Record<string, string> }>;
  ifaces?: Record<string, { slots?: Record<string, unknown> }>;
}
export interface SideManifest {
  name: string;
  requires?: Record<string, { iface: string; from?: string }>;
  contributes?: Record<string, unknown>;
  side?: Side;
  source?: string;
  file?: string;
}
export interface Hosts {
  server: HostTable;
  web: HostTable;
  /** Modules of the plugin packages depended on, by name → side. */
  plugins?: Record<string, Side>;
}
export declare function hostTables(pkgDir?: string): Hosts;
export declare function assignSides(
  manifests: Record<string, SideManifest>,
  sources: ReadonlyMap<string, string>,
  pluginDecl: { modules: string[]; replaces: string[] } | null,
  hosts?: Hosts,
): string[];
export declare function decideSides(
  manifests: Record<string, SideManifest>,
  hosts: Hosts,
  replaces?: readonly string[],
): { sides: Record<string, Side>; errors: string[] };
export declare const WEB_DIR: string;
export declare function webFileOf(moduleName: string): string;
export declare function mixedFiles(
  sources: Record<string, string>,
  sides: Record<string, Side>,
): string[];
