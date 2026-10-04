/**
 * The plugin's one module, a web module: it contributes to the web app's
 * `ChatModule.fileRenderers` slot, which is what makes gen-ifaces place it on the web side.
 *
 * One contribution carries both halves of the rule. The data — which extensions it draws — is in
 * the manifest, so the web app knows a reply's `song.mp3` is this module's to draw without
 * running any of it; the code is the player, bound as a lazy component, so the player's chunk is
 * fetched the first time a reply links such a file, not when the app starts.
 */
import { lazy } from "react";
import type { ComponentType } from "react";
import { Bind, Module } from "@prismshadow/penguin-core/plugin";
import type { FileRendererProps } from "./file-renderer";

@Module({
  contributes: {
    "ChatModule.fileRenderers": [
      { id: "example-music.audio", extensions: ["mp3", "wav", "ogg", "m4a"] },
    ],
  },
})
export class ExampleMusic {
  @Bind("example-music.audio") audio: ComponentType<FileRendererProps> = lazy(
    () => import("./audio-file"),
  );
}
