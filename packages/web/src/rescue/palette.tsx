/**
 * The app's command palette: which actions exist, the shortcut that opens it (the
 * `palette.toggle` command, ⇧⌘P / Ctrl+Shift+P by default), and its words. The UI package's
 * CommandPalette is the mechanism; this file is the registry: an action here, never a new
 * global shortcut. An action opens an overlay over the current page rather than navigating —
 * closing it leaves the user exactly where they were.
 *
 * It is the way back when the UI breaks — the harness history rolls the harness version back —
 * so it mounts beside the shell's tree (app.tsx), not in it, and needs nothing the tree
 * provides: no router, no auth or Project context. It opens over the rescue panel, on the bare
 * routes, and over an open dialog (`palette.toggle` is the one command the dialog blocker lets
 * through, see lib/shortcuts/dispatcher.ts). A mounted page adds its own actions through
 * lib/palette-actions.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { CommandPalette } from "@prismshadow/penguin-ui";
import type { PaletteAction } from "@prismshadow/penguin-ui";
import { useAddedPaletteActions } from "../lib/palette-actions";
import { onCommand } from "../lib/shortcuts/dispatcher";
import { useShortcutLabel } from "../lib/shortcuts/use-keymap";
import { S } from "../lib/strings";
import { HarnessHistoryOverlay } from "./harness-history-overlay";
import { setSafeMode, useSafeMode } from "./safe-mode";

export function RescuePalette() {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const added = useAddedPaletteActions();
  const safe = useSafeMode();

  // The chord is the keymap's (lib/shortcuts): the window dispatcher matches it, calls this
  // handler and prevents the browser default once it is handled. A functional update reads
  // the latest `open`, so the handler registers once.
  useEffect(
    () =>
      onCommand("palette.toggle", () => {
        setOpen((o) => !o);
      }),
    [],
  );
  const toggleShortcut = useShortcutLabel("palette.toggle");

  const actions = useMemo<PaletteAction[]>(
    () => [
      ...added,
      {
        id: "harness-history",
        label: S.commandPalette.harnessHistory,
        keywords: ["harness history", "version", "hmr", "ifaces", "rollback"],
        run: () => setHistoryOpen(true),
      },
      {
        id: "safe-mode",
        label: safe ? S.rescue.leaveAction : S.rescue.enterAction,
        keywords: ["safe mode", "contributions", "plugins"],
        run: () => setSafeMode(!safe),
      },
    ],
    [added, safe],
  );
  return (
    <>
      <CommandPalette
        open={open}
        onClose={() => setOpen(false)}
        actions={actions}
        title={S.commandPalette.title}
        placeholder={S.commandPalette.placeholder}
        emptyText={S.commandPalette.noResults}
        hint={S.commandPalette.hint(toggleShortcut)}
      />
      <HarnessHistoryOverlay open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}
