/**
 * Key helpers the check and the runtime booter share: how a manifest reference names an
 * interface-table entry, and how a contribution key names a slot. No dependencies, so the
 * arktype-free runtime entry (./runtime.ts) carries them.
 */

/** The iface-table key a manifest reference resolves to. */
export function ifaceKey(moduleName: string, ref: string): string {
  return ref.includes("#") ? ref : `${moduleName}#${ref}`;
}

/** `<module>.<slot>` → its two halves. */
export function splitSlotKey(key: string): { module: string; slot: string } | null {
  const at = key.lastIndexOf(".");
  if (at <= 0 || at === key.length - 1) return null;
  return { module: key.slice(0, at), slot: key.slice(at + 1) };
}
