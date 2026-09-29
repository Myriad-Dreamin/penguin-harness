/**
 * Which session shells the adaptor lets through to DSH's Windows ACL runner. The unit half
 * runs everywhere (the platform is injected); the live half runs only on a Windows host whose
 * ACL chain is usable, against the real runner — the host the refusal exists for.
 */
import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { CommandSessionManager } from "@prismshadow/penguin-core";
import type { SandboxProvider } from "@prismshadow/penguin-core/plugin";
import { aclRunnerArgv, assertAclRunnerCanStart, loadDshAdaptor } from "../src/index.js";

const REFUSED = /sandbox-dsh cannot confine .* PENGUIN_SHELL=pwsh .* PENGUIN_SHELL=powershell/;

describe("assertAclRunnerCanStart", () => {
  it.each([
    "bash",
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\BASH.EXE",
    "C:\\Users\\u\\AppData\\Local\\penguin\\git\\usr\\bin\\sh.exe",
    "C:\\Windows\\System32\\bash.exe",
  ])("refuses %s on Windows, naming the setting that fixes it", (program) => {
    expect(() => assertAclRunnerCanStart([program, "-lc", "echo hi"], "win32")).toThrow(REFUSED);
  });

  it.each(["pwsh", "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "cmd"])(
    "lets %s through on Windows",
    (program) => {
      expect(() => assertAclRunnerCanStart([program, "-Command", "'hi'"], "win32")).not.toThrow();
    },
  );

  it("is Windows-only: bash is the shell every other rung runs", () => {
    expect(() => assertAclRunnerCanStart(["bash", "-lc", "echo hi"], "linux")).not.toThrow();
    expect(() => assertAclRunnerCanStart(["/bin/bash", "-lc", "echo hi"], "darwin")).not.toThrow();
  });
});

describe("aclRunnerArgv", () => {
  const PS = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0";
  const PWSH = "C:\\Program Files\\PowerShell\\7";
  const on = (files: string[], Path: string) => ({
    platform: "win32" as const,
    env: { Path },
    isFile: (file: string) => files.includes(file),
  });

  it("names the file of the first PATH entry that holds it, .exe appended", () => {
    const host = on([`${PS}\\powershell.exe`, `${PWSH}\\pwsh.exe`], `${PS};"${PWSH}"`);
    expect(aclRunnerArgv(["pwsh", "-Command", "'hi'"], host)).toEqual([
      `${PWSH}\\pwsh.exe`,
      "-Command",
      "'hi'",
    ]);
    expect(aclRunnerArgv(["powershell"], host)).toEqual([`${PS}\\powershell.exe`]);
  });

  it("never takes the current directory: a relative PATH entry is skipped", () => {
    const host = on(["pwsh.exe", ".\\pwsh.exe", `${PWSH}\\pwsh.exe`], `.;;${PWSH}`);
    expect(aclRunnerArgv(["pwsh"], host)).toEqual([`${PWSH}\\pwsh.exe`]);
  });

  it("looks a name with an extension up as it is", () => {
    const host = on([`${PWSH}\\pwsh.exe`, `${PWSH}\\pwsh.exe.exe`], PWSH);
    expect(aclRunnerArgv(["pwsh.exe"], host)).toEqual([`${PWSH}\\pwsh.exe`]);
  });

  it("refuses a name no PATH entry carries rather than leave it to the runner's search", () => {
    expect(() => aclRunnerArgv(["pwsh"], on([], PS))).toThrow(
      /cannot confine "pwsh" on Windows: no pwsh\.exe .* PATH/,
    );
    expect(() => aclRunnerArgv(["pwsh"], { platform: "win32", env: {} })).toThrow(/no pwsh\.exe/);
  });

  it("passes a program given with a directory, and every other platform, as it is", () => {
    const host = on([], PS);
    expect(aclRunnerArgv([`${PWSH}\\pwsh.exe`, "-c"], host)).toEqual([`${PWSH}\\pwsh.exe`, "-c"]);
    expect(aclRunnerArgv([".\\tool.exe"], host)).toEqual([".\\tool.exe"]);
    expect(aclRunnerArgv(["bash", "-lc", "true"], { platform: "linux" })).toEqual([
      "bash",
      "-lc",
      "true",
    ]);
  });
});

const win32 = process.platform === "win32";
const ws = mkdtempSync(path.join(tmpdir(), "penguin-dsh-shells-"));
const provider: SandboxProvider | null = win32 ? await loadDshAdaptor().catch(() => null) : null;
const usable =
  provider !== null &&
  (() => {
    try {
      provider.confine(["cmd"], { mode: "workspace-write", workspaceRoot: ws });
      return true;
    } catch {
      return false;
    }
  })();

afterAll(() => {
  rmSync(ws, { recursive: true, force: true });
});

describe.skipIf(!usable)("the real ACL runner (Windows, host-gated)", () => {
  it("the harness's default Windows shell is refused before the runner, with the fix named", () => {
    const seen: string[] = [];
    const mgr = new CommandSessionManager({
      confineSpawn: () => (argv, opts) => {
        seen.push(argv[0] ?? "");
        return provider!.confine(argv, {
          mode: "workspace-write",
          workspaceRoot: opts.workspaceDir,
        });
      },
      workspaceDir: ws,
    });
    try {
      let refusal: unknown = null;
      try {
        mgr.spawn({ cmd: "echo hi", cwd: ws }).kill();
      } catch (err) {
        refusal = err;
      }
      const name = path.win32.basename(seen[0] ?? "");
      // A host that already set PENGUIN_SHELL to a PowerShell has nothing to refuse.
      if (/^(bash|sh)(\.exe)?$/i.test(name)) {
        expect(String(refusal)).toMatch(REFUSED);
      } else {
        expect(refusal).toBeNull();
      }
    } finally {
      mgr.dispose();
    }
  });

  // What the refusal points at: both PowerShells run confined — a write inside the Workspace
  // lands, a write outside it is denied. Windows PowerShell 5.1 ships with Windows; pwsh is
  // an install, so its leg skips where it is absent.
  const pwshInstalled = win32 && spawnSync("where", ["pwsh"], { windowsHide: true }).status === 0;
  it.each([
    ["powershell", true],
    ["pwsh", pwshInstalled],
  ] as const)("%s runs confined", (shell, present) => {
    if (!present) return;
    const outside = path.join(homedir(), `penguin-dsh-shells-${shell}-${process.pid}.txt`);
    const inside = `${shell}-inside.txt`;
    try {
      const body = `Set-Content -LiteralPath ${inside} -Value ok; try { Set-Content -LiteralPath '${outside}' -Value leak -ErrorAction Stop } catch { $_.Exception.Message }`;
      const confined = provider!.confine([shell, "-NoLogo", "-NoProfile", "-Command", body], {
        mode: "workspace-write",
        workspaceRoot: ws,
      });
      const r = spawnSync(confined.argv[0]!, confined.argv.slice(1), {
        cwd: ws,
        env: { ...process.env, ...confined.env },
        encoding: "utf8",
        timeout: 60_000,
        windowsHide: true,
      });
      expect(r.status).toBe(0);
      expect(existsSync(path.join(ws, inside))).toBe(true);
      expect(existsSync(outside)).toBe(false);
      expect(r.stdout).toMatch(/access to the path .* is denied/i);
    } finally {
      rmSync(outside, { force: true });
    }
  });

  // The runner's search puts its current directory — here the Workspace — before PATH. A
  // `powershell.exe` planted there (a copy of hostname.exe, which prints no marker) must not
  // be the program the confined command starts.
  it("a same-named exe in the Workspace is not the program that starts", () => {
    const dir = mkdtempSync(path.join(ws, "planted-"));
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    copyFileSync(
      path.join(systemRoot, "System32", "HOSTNAME.EXE"),
      path.join(dir, "powershell.exe"),
    );
    const confined = provider!.confine(
      ["powershell", "-NoLogo", "-NoProfile", "-Command", "Write-Output 'started-from-PATH'"],
      { mode: "workspace-write", workspaceRoot: ws },
    );
    const r = spawnSync(confined.argv[0]!, confined.argv.slice(1), {
      cwd: dir,
      env: { ...process.env, ...confined.env },
      encoding: "utf8",
      timeout: 60_000,
      windowsHide: true,
    });
    expect(r.stdout).toContain("started-from-PATH");
    expect(r.status).toBe(0);
  });
});
