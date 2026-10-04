/** Types for host-keys.mjs (plain JavaScript: gen-ifaces runs it directly). */
export declare function adoptHostKeys(
  manifests: Record<
    string,
    {
      name: string;
      side?: string;
      provides?: Record<string, string>;
      requires?: Record<string, { iface: string; from?: string }>;
    }
  >,
  ifaces: Record<string, unknown>,
  host: {
    modules?: Record<string, { provides?: Record<string, string> }>;
    ifaces?: Record<string, unknown>;
  },
): string[];
