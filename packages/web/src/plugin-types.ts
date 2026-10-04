/**
 * What a plugin's web module may name of the web app at compile time: the props a slot's code
 * half is handed, and the interfaces the app's modules provide for a plugin module to `@Use`.
 * Declared here, and only here — the app's own modules import them from this file too — so a
 * plugin's types are the app's, not a copy kept in step by hand.
 *
 * A plugin imports this file for its TYPES only (`import type`), through a path its tsconfig maps
 * (`@prismshadow/penguin-web/plugin-types`, see plugins/example-music/tsconfig.json): the web app
 * is not a package a plugin depends on at run time, and its build refuses a value import of it
 * (scripts/lib/web-shared.mjs). So this file imports nothing but the kernel's `Interface` marker,
 * which every plugin already has: a plugin's typecheck reads it, and nothing it would pull in.
 *
 * An interface class here is keyed by this package (`@prismshadow/penguin-web#<Name>`, as every
 * interface of the app is), and so is a plugin's requirement of it: the plugin's tree wires to
 * the providing module by that exact key, with no `from` and no copy of the interface.
 *
 * TODO(web-plugin-types): a plugin outside this repository has no path to map; publish this
 * file as a types-only package once the first external web plugin needs it.
 */
import { Interface } from "@prismshadow/penguin-core/kernel";

/** What a `ChatModule.fileRenderers` component is handed. */
export interface FileRendererProps {
  /** Where the file is fetched from: the open conversation's Workspace file URL. */
  url: string;
  /** The file's Workspace-relative path. */
  path: string;
  /** Its last path segment. */
  name: string;
  /** The interface language, for the renderer's own words. */
  locale: "zh" | "en";
}

/**
 * The interface language the person picked (Settings → General), for a component's own words.
 * Read while rendering: a language switch remounts the whole tree (state/locale.tsx), so every
 * component reads it again — there is nothing to subscribe to. Provided by the settings module.
 */
@Interface()
export abstract class Language {
  abstract current(): "zh" | "en";
}
