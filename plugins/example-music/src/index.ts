/**
 * @penguinharness/example-music — the smallest plugin that teaches the web app to draw a kind of
 * Workspace file, with its own browser code.
 *
 * Its one module is a WEB module (`@Module({ side: "web" })`): it contributes to the web app's
 * `ChatModule.fileRenderers` slot, and the build emits it as a browser module
 * (`dist/web/ExampleMusic.js`, scripts/build-plugin.mjs). The server only forwards it: GET
 * /api/contributions lists it with the URL of its file, and the web app loads that file and adds
 * the module to its own tree before it mounts. When a reply links a Workspace file with one of
 * its extensions, the app draws the player for it; the link itself is left as it is.
 *
 * One contribution carries both halves of the rule. The data — which extensions it draws — is
 * the contribution's manifest entry; the code is the player (player.tsx), bound as a lazy
 * component, so the player's chunk is fetched the first time a reply links such a file, not when
 * the app starts.
 *
 * The player's words follow the app's interface language, which the module `@Use`s through the
 * app's `Language` interface (wired by the interface's key, no module named) and hands to the
 * player as a prop, as the hello-page example does with its page.
 *
 * The Agent learns to make such a file and link it from this package's `skills/send-music/`, which
 * reaches an Agent by being installed onto it by hand (README.md): a code plugin has no way to
 * contribute a Skill.
 */
import { createElement, lazy } from "react";
import type { ComponentType } from "react";
import { Bind, Module, Use } from "@prismshadow/penguin-core/plugin";
import type { Plugin } from "@prismshadow/penguin-core/plugin";
import type { FileRendererProps, Language } from "@prismshadow/penguin-web/plugin-types";

@Module({
  side: "web",
  contributes: {
    "ChatModule.fileRenderers": [
      { id: "example-music.audio", extensions: ["mp3", "wav", "ogg", "m4a"] },
    ],
  },
})
export class ExampleMusic {
  @Use() language!: Language;
  @Bind("example-music.audio") audio!: ComponentType<FileRendererProps>;

  setup() {
    const language = this.language;
    this.audio = lazy(async () => {
      const { AudioFile } = await import("./player");
      return {
        default: (props: FileRendererProps) => createElement(AudioFile, { ...props, language }),
      };
    });
  }
}

const plugin: Plugin = { modules: [ExampleMusic] };
export default plugin;
