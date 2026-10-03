// The vendored DSH tree is checked against pnpm-lock.yaml by content, not only by version: the
// integrity npm records for each tarball must equal the one the lockfile pins.
import { describe, expect, it } from "vitest";
import { integrityMismatches } from "../../../scripts/vendor-dsh-deps.mjs";

const lock = {
  packages: {
    "koffi@3.1.6": { resolution: { integrity: "sha512-koffi" } },
    "@koromix/koffi-linux-x64@3.1.6": { resolution: { integrity: "sha512-linux" } },
  },
};
const closure = new Map([
  ["koffi", "3.1.6"],
  ["@koromix/koffi-linux-x64", "3.1.6"],
]);
const npmLock = (linuxIntegrity: string | undefined) => ({
  packages: {
    "": { name: "stage" },
    "node_modules/koffi": { version: "3.1.6", integrity: "sha512-koffi" },
    "node_modules/@koromix/koffi-linux-x64": { version: "3.1.6", integrity: linuxIntegrity },
  },
});

describe("integrityMismatches", () => {
  it("accepts a tree whose every tarball is the locked one", () => {
    expect(integrityMismatches(lock, closure, npmLock("sha512-linux"))).toEqual([]);
  });

  it("names a package whose tarball differs from the lockfile's at the same version", () => {
    expect(integrityMismatches(lock, closure, npmLock("sha512-other"))).toEqual([
      "@koromix/koffi-linux-x64@3.1.6: npm installed sha512-other, locked sha512-linux",
    ]);
  });

  it("fails a package npm recorded no integrity for", () => {
    expect(integrityMismatches(lock, closure, npmLock(undefined))).toEqual([
      "@koromix/koffi-linux-x64@3.1.6: npm installed (no integrity), locked sha512-linux",
    ]);
  });

  it("names packages outside the closure and closure packages npm did not install", () => {
    const tree = {
      packages: {
        "node_modules/koffi": { version: "3.1.6", integrity: "sha512-koffi" },
        "node_modules/koffi/node_modules/left-pad": { version: "1.0.0", integrity: "sha512-x" },
      },
    };
    expect(integrityMismatches(lock, closure, tree)).toEqual([
      "left-pad@1.0.0: not in the locked closure",
      "@koromix/koffi-linux-x64@3.1.6: not in npm's lockfile",
    ]);
  });
});
