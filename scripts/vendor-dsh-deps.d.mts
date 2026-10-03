/** Types for vendor-dsh-deps.mjs, which sandbox-dsh's typechecked tests import. */
export declare function vendorDshDeps(): Promise<string>;
export declare function vendorCacheInputs(): string;
export declare function integrityMismatches(
  lock: { packages?: Record<string, { resolution?: { integrity?: string } }> },
  closure: Map<string, string>,
  npmLock: {
    packages?: Record<string, { name?: string; version?: string; integrity?: string }>;
  },
): string[];
