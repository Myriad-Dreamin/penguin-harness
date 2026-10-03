/**
 * The telemetry switch (Settings → General, admin only; PRFC-0008): `ServerSettings.telemetry`,
 * server-global, written by a single PUT the moment it is flipped. The row is hidden from
 * everyone else rather than shown disabled — the settings route answers an admin only, and the
 * buffer it turns on is read in the cost center's performance panel, which is admin only too.
 *
 * A flip also moves this tab's browser collector at once, so the page that just turned telemetry
 * on samples without a reload; other tabs pick it up on their next `/api/me`.
 */
import { useEffect, useState } from "react";
import { ToggleRow } from "@prismshadow/penguin-ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { setPerfSwitch } from "../../lib/perf/switch";

export function TelemetryRow() {
  /** The value the server last confirmed; null until the first read answers. */
  const [stored, setStored] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .adminGetSettings()
      .then((res) => {
        if (!cancelled) setStored(res.settings.telemetry);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(apiErrorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const flip = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.adminPutSettings({ telemetry: next });
      setStored(res.settings.telemetry);
      setPerfSwitch(res.settings.telemetry);
    } catch (e) {
      // The switch stays on what the server holds; the reason shows under it.
      setError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToggleRow
      label={S.settings.telemetry}
      info={S.settings.telemetryInfo}
      {...(error !== null ? { hint: error } : {})}
      checked={stored === true}
      disabled={stored === null || busy}
      onChange={(on) => void flip(on)}
    />
  );
}
