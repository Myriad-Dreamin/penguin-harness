/**
 * @penguinharness/example-music — the smallest plugin that teaches the web app to draw a kind of
 * Workspace file, with its own browser code.
 *
 * Its one module is a WEB module: it contributes to the web app's `ChatModule.fileRenderers`
 * slot, so the build places it on the web side and emits it as a browser module
 * (`dist/web/ExampleMusic.js`, scripts/build-plugin.mjs). The server only forwards it: GET
 * /api/contributions lists it with the URL of its file, and the web app loads that file and adds
 * the module to its own tree before it mounts. When a reply links a Workspace file with one of
 * its extensions, the player draws below the paragraph that holds the link; the link itself is
 * left as it is.
 *
 * One contribution carries both halves of the rule. The data — which extensions it draws — is
 * the contribution's manifest entry; the code is the player (player.tsx), bound as a lazy
 * component, so the player's chunk is fetched the first time a reply links such a file, not when
 * the app starts.
 *
 * The Agent learns to make such a file and link it from this package's `skills/send-music/`, which
 * reaches an Agent by being installed onto it by hand (README.md): a code plugin has no way to
 * contribute a Skill.
 */
import { lazy } from "react";
import type { ComponentType } from "react";
import { Bind, Module } from "@prismshadow/penguin-core/plugin";
import type { Plugin } from "@prismshadow/penguin-core/plugin";
import type { FileRendererProps } from "@prismshadow/penguin-web/plugin-types";

@Module({
  contributes: {
    "ChatModule.fileRenderers": [
      { id: "example-music.audio", extensions: ["mp3", "wav", "ogg", "m4a"] },
    ],
  },
})
export class ExampleMusic {
  @Bind("example-music.audio") audio: ComponentType<FileRendererProps> = lazy(
    () => import("./player"),
  );
}

const plugin: Plugin = { modules: [ExampleMusic] };
export default plugin;
