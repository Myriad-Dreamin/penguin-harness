/**
 * The Sys capability interface (src/sys): shapes only, the optionality of a world's
 * capabilities, and the fail-closed error a caller raises when the capability it needs is
 * absent. The implementation — the host default — lives on the server and is tested there
 * (`@prismshadow/penguin-server/sys`); this file pins the contract the
 * subpath ships, including that it ships nothing else.
 */
import { describe, expect, it } from "vitest";
import { localFsPort } from "../src/environment/tools/fs-port.js";
import * as contract from "../src/sys/index.js";
import { SYS_CAPABILITY_ABSENT, sysCapabilityError } from "../src/sys/index.js";
import type { Fs, Sys } from "../src/sys/index.js";

/** An `Fs` built out of the file tools' port plus the copy primitive — the shape providers implement. */
const hostLikeFs: Fs = {
  ...localFsPort,
  async copyFile() {
    throw new Error("not exercised here: this file pins the shape");
  },
};

describe("the Sys capability error", () => {
  it("names the caller and the capability it needed", () => {
    const error = sysCapabilityError("runServer", "fs");
    expect(error.message).toContain("runServer");
    expect(error.message).toContain("fs");
  });

  it("is an Error carrying the code and the capability", () => {
    const error = sysCapabilityError("startEmbeddedServer", "exec");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(SYS_CAPABILITY_ABSENT);
    expect(error.capability).toBe("exec");
  });

  it("keeps a throw site a caller can report", () => {
    try {
      throw sysCapabilityError("runServer", "listen");
    } catch (err) {
      expect((err as Error).stack).toContain("sysCapabilityError");
    }
  });
});

describe("the Sys contract", () => {
  it("ships shapes and the error factory only: the implementations live with the server", () => {
    expect(Object.keys(contract).sort()).toEqual(["SYS_CAPABILITY_ABSENT", "sysCapabilityError"]);
  });

  it("a Sys may carry none, one or all of the capabilities", () => {
    const bare: Sys = {};
    expect(bare.fs).toBeUndefined();
    expect(bare.exec).toBeUndefined();
    expect(bare.listen).toBeUndefined();

    const filesOnly: Sys = { fs: hostLikeFs };
    expect(filesOnly.fs?.sandboxed).toBe(false);
    expect(typeof filesOnly.fs?.copyFile).toBe("function");
    expect(filesOnly.exec).toBeUndefined();
  });
});
