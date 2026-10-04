/**
 * What the web app hands a file renderer — the code half of a `ChatModule.fileRenderers`
 * contribution (packages/web/src/features/chat/iface.ts `FileRendererProps`). Restated here
 * rather than imported: the web app is not a package a plugin can depend on, and the slot's code
 * half is a component contract the kernel does not check at run time.
 *
 * TODO(web-plugin-types): import it once the web app publishes its plugin-facing types; until
 * then a change to the web's props must be mirrored here by hand.
 */
export interface FileRendererProps {
  /** Where the file is fetched from (the Workspace file URL of the open conversation). */
  url: string;
  /** The file's Workspace-relative path. */
  path: string;
  /** Its last path segment. */
  name: string;
  /** The web app's interface language. */
  locale: "zh" | "en";
}
