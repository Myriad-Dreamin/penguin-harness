/** Types for plugin-sides.mjs (plain JavaScript: gen-ifaces runs it directly). */
export type Side = "server" | "web";
export interface HostTable {
  modules?: Record<string, { provides?: Record<string, string> }>;
  ifaces?: Record<string, unknown>;
}
export interface SideManifest {
  name: string;
  requires?: Record<string, { iface: string; from?: string }>;
  provides?: Record<string, string>;
  children?: unknown[];
  contributes?: Record<string, unknown>;
  side?: Side;
  source?: string;
  file?: string;
}
export interface Hosts {
  server?: HostTable;
  web?: HostTable;
}
export declare const SIDES: readonly Side[];
export declare const WEB_DIR: string;
export declare function webFileOf(moduleName: string): string;
export declare function readHostTables(root?: string): Hosts;
export declare function assignSides(
  manifests: Record<string, SideManifest>,
  sources: ReadonlyMap<string, string>,
  declared: ReadonlyMap<string, string>,
  opts?: { pkgName?: string; replaces?: readonly string[]; hosts?: Hosts },
): string[];
export declare function foreignKeys(
  manifests: Record<string, SideManifest>,
  sides: Record<string, Side>,
  pkgName?: string,
): string[];
export declare function misplaced(
  manifests: Record<string, SideManifest>,
  sides: Record<string, Side>,
  hosts: Hosts,
  replaces?: readonly string[],
): string[];
export declare function mixedFiles(
  sources: Record<string, string>,
  sides: Record<string, Side>,
): string[];
