# Example: an Agent that sends music

The smallest plugin that teaches the PenguinHarness web app to draw a kind of Workspace file with
browser code of its own, plus a Skill that teaches the Agent to produce one. It demonstrates:

- **A web module.** The plugin's one module (`src/module.ts`) contributes to the web app's
  `ChatModule.fileRenderers` slot, so the build places it on the web side: gen-ifaces writes
  `side: "web"` and its built file into `ifaces.json`, and `scripts/build-plugin.mjs` emits
  `dist/web/ExampleMusic.js` for the browser, with React, the kernel and the UI package left to the
  web app's own instances. The server only forwards it (`GET /api/contributions`, `webModules`);
  the web app checks it against its module tree and boots it with its own modules.
- **One contribution, both halves.** The rule — files ending in `mp3`, `wav`, `ogg` or `m4a` — is
  the contribution's data, in the manifest; the player is its code, a lazy component, so its chunk
  is fetched the first time a reply links such a file.
- **Its own stylesheet.** `src/styles.css` compiles the player's Tailwind utilities against the web
  app's theme as a reference (no preflight, no variables of its own), so the card reads the host's
  tokens and follows its theme and mode. Its classes carry the plugin's own prefix (`mp:flex`): a
  second copy of the host's `.flex` in a sheet attached later would reorder the host's cascade. The
  web app attaches it when it loads the module.
- **The Markdown is not touched.** When a paragraph of a reply links such a file in the
  Workspace — `[Evening Theme](music/tune.wav)` — the link stays a link (clicking it opens the file
  in the Files panel) and a player appears directly below that paragraph, once per file. A link
  inside a code span or block is not a link and gets nothing; a reply that is still streaming
  gets its players when it settles.
- **A Skill.** `skills/send-music/SKILL.md` teaches the Agent to synthesize a short tune to WAV with
  Python's standard library (or convert it with `ffmpeg` when one is present) and to link it in the
  reply by its Workspace-relative path.

The package is private, so it is not published, and it is not shipped with the builtin plugins
(`scripts/build-plugins.mjs` skips the `plugins/example-*` directories), so no install enables it.

## Enable the player

A plugin is loaded by its package name only, from the bundled plugin directory a build stages.
Stage the examples into it with the builtin plugins, then list the package in a Project's
`.project_config.toml` and restart the server:

```sh
PENGUIN_PLUGIN_EXAMPLES=1 node scripts/build-plugins.mjs --out packages/server/plugins
```

```toml
[plugins]
"@penguinharness/example-music" = "*"
```

What a Project lists is loaded for the whole server. Reload the web app after enabling it: the app
assembles plugin web modules once per page load. In safe mode it assembles none. The web e2e suite enables it this way
(`packages/web/e2e/run.sh`).

## Install the Skill (a separate, manual step)

Enabling the plugin does not give any Agent the Skill: a code plugin has no slot to contribute a
Skill through, and Skills reach an Agent only by being installed onto it. Install it on each Agent
that should send music, either way:

- **Upload.** Zip the skill directory so the archive holds a single top-level `send-music/`
  (`cd skills && zip -r send-music.zip send-music`), then install the zip from the Agent's
  Skills settings.
- **Copy.** Copy `skills/send-music/` into the Agent's `agent_state/skills/` directory.

Then ask the Agent for a tune.
