/**
 * The web modules the enabled plugins ship, as GET /api/contributions forwards them
 * (`webModules`). The server does not read them: each entry is the web part of the package's
 * generated `ifaces.json` (scripts/gen-ifaces.mjs decides a module's side), plus where its built
 * files are served. The web app checks them against its own module tree and assembles them
 * (packages/web/src/plugins/), keying what it verified by a hash it computes itself over what
 * it checked, so nothing here carries one.
 */

/** One plugin package's web part. */
export interface WebModulePackage {
  /** The package name. */
  package: string;
  version: string;
  /** The table's interface and type entries: what the web's tree check reads besides the manifests. */
  ifaces: { ifaces: Record<string, unknown>; types: Record<string, unknown> };
  /**
   * Each web module: its manifest as the table carries it (`side: "web"`, `file`), and the URL of
   * its built file — an ES module whose default export is the module class. The URL names the
   * build's content, so a response to it never changes and is cached for good. Every web module
   * has one, a module that only contributes data included.
   */
  modules: Array<{ manifest: Record<string, unknown>; url: string }>;
  /** Stylesheets the modules' components need, attached before the modules load. */
  styles: string[];
}
