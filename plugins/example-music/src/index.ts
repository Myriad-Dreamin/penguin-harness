/**
 * @penguinharness/example-music — the smallest plugin that teaches the web app to draw a kind of
 * Workspace file, with its own browser code.
 *
 * Its one module (module.ts) is a WEB module: it contributes to the web app's
 * `ChatModule.fileRenderers` slot, so the build places it on the web side and emits it as a
 * browser module (`dist/web/ExampleMusic.js`, scripts/build-plugin.mjs). The server only forwards
 * it: GET /api/contributions lists it with the URL of its file, and the web app adds it to its
 * own module tree before it mounts. When a reply links a Workspace file with one of its
 * extensions, the player draws below the paragraph that holds the link; the link itself is left as
 * it is.
 *
 * The Agent learns to make such a file and link it from this package's `skills/send-music/`, which
 * reaches an Agent by being installed onto it by hand (README.md): a code plugin has no way to
 * contribute a Skill.
 */
import type { Plugin } from "@prismshadow/penguin-core/plugin";
import { ExampleMusic } from "./module";

const plugin: Plugin = { modules: [ExampleMusic] };
export default plugin;
