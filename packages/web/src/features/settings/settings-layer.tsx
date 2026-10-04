/**
 * The Settings dialog, mounted once beside every page (`ShellModule.layers`): it opens on a
 * request (lib/settings-request.ts) — the account menu's Settings row, the permission menu's
 * More…, or a host asking for a page — on the page the request names, else the viewer's first.
 *
 * The layer itself is only the listener. The dialog's code loads on the first request and stays
 * mounted from then on, so its closing animation and its state across openings are what they
 * were; until then the layer draws nothing.
 */
import { useEffect, useState } from "react";
import { Deferred } from "../../components/ui/deferred";
import { lazyComponent } from "../../lib/lazy-component";
import { onSettingsRequest } from "../../lib/settings-request";
import type { SettingsRequest } from "../../lib/settings-request";

const SettingsDialog = lazyComponent(() => import("./settings-dialog"), "SettingsDialog");

export function SettingsLayer() {
  const [open, setOpen] = useState(false);
  /** The last request: the page it asked for (undefined = the viewer's first) and its card. Null until the first. */
  const [request, setRequest] = useState<SettingsRequest | null>(null);
  useEffect(
    () =>
      onSettingsRequest((next) => {
        setRequest(next);
        setOpen(true);
      }),
    [],
  );
  if (request === null) return null;
  return (
    <Deferred fallback={null}>
      <SettingsDialog
        open={open}
        onClose={() => setOpen(false)}
        {...(request.section !== undefined ? { section: request.section } : {})}
        {...(request.pluginFocus !== undefined ? { pluginFocus: request.pluginFocus } : {})}
      />
    </Deferred>
  );
}
