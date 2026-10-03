/**
 * @penguinharness/sandbox-dsh — the DeepSeek Harness sandbox ecosystem
 * behind this harness's own sandbox interface.
 *
 * A PLUGIN PACKAGE, not part of the platform: a Project asks for it on the Plugins page
 * and the harness resolves it from the installation (see the server's plugin/loader.ts).
 * The DSH dependencies live HERE, in this package — the harness itself does not depend
 * on them, which is what "plugins are configuration, not built-in capability" means in
 * dependency terms.
 *
 * `@deepseek-ai/dsh-sandbox-local` carries the platform chain (dsh-bwrap → Landlock on
 * Linux, Seatbelt on macOS, the ACL restricted-token runner on Windows) and probes them
 * functionally; this file translates between its vocabulary and ours. Because DSH's
 * policy vocabulary governs file-write effects only, the adaptor declares exactly
 * `fs-write` — the service therefore never routes a network / mask-paths policy here,
 * and the adaptor never has to drop a dimension it cannot honor.
 *
 * Everything DSH loads behind the dynamic imports below, and that is load-bearing for
 * hot push (see scripts/deploy.mjs): the package reaches native-adjacent modules that a
 * pushed single-file bundle resolves from the installation, so an installation missing
 * them fails THIS load — reported fail-closed by the service — instead of failing the
 * whole platform bundle's import.
 */
import { lstatSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Bind, Component } from "@prismshadow/penguin-core/plugin";
import type {
  ConfinedArgv,
  Plugin,
  SandboxLimit,
  SandboxProvider,
  SandboxProviderSource,
} from "@prismshadow/penguin-core/plugin";

/**
 * Programs the Windows ACL restricted-token runner cannot start — and they include the harness's
 * Windows default session shell (Git for Windows' bash, or the `sh.exe` of the MinGit the
 * Windows package bundles). Measured on windows-latest (fork CI run 36607002547): a bare `bash`
 * reaches System32's WSL launcher before PATH ("Error code:
 * Bash/Service/CreateInstance/E_ACCESSDENIED"), and an MSYS bash or sh named by path aborts
 * under the write-restricted token ("fatal error - couldn't create signal pipe, Win32 error
 * 5" / "CreateFileMapping …, Win32 error 5"). In the same run both PowerShells ran confined,
 * writing inside the Workspace and denied outside it: pwsh 7.6.6 and Windows PowerShell 5.1.
 *
 * The abort is the MSYS runtime's (msys-2.0.dll, shared by Git for Windows and MSYS2), not
 * bash's, so it is refused by runtime: the POSIX shells those distributions ship, by name, and
 * any program in an MSYS `usr\bin` — the directory where every binary links that runtime.
 */
const MSYS_SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "mksh", "fish", "git-bash"]);

/** What the backend reads of the harness's session shell (core's `ShellInvocation`). */
export interface SessionShell {
  /** Executable name or path the harness spawns commands with. */
  command: string;
}

const unstartable = (program: string): boolean => {
  const segments = program.toLowerCase().split(/[\\/]+/);
  const base = (segments.at(-1) ?? "").replace(/\.exe$/i, "");
  return MSYS_SHELLS.has(base) || (segments.at(-3) === "usr" && segments.at(-2) === "bin");
};

/** The one setting that fixes an MSYS-runtime session shell, as every refusal of it words it. */
const SESSION_SHELL_FIX =
  "Set PENGUIN_SHELL=pwsh (PowerShell 7) — or PENGUIN_SHELL=powershell (Windows PowerShell " +
  "5.1) where PowerShell 7 is not installed — in the harness's environment and restart it";

/**
 * Fail this backend's load on Windows when the harness's session shell is one its ACL runner
 * cannot start. A backend whose load fails is not mounted: the sandbox service reports it with
 * this reason (the Session view's `unavailableBackends`), so the confining tier shows as
 * unavailable with the fix, rather than selectable and then refusing every command. `null` is
 * a host core that does not export the session shell (an older runtime): nothing is checked,
 * and `assertAclRunnerCanStart` still refuses per command.
 */
export function assertSessionShellConfinable(
  shell: SessionShell | null,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== "win32" || shell === null || !unstartable(shell.command)) return;
  throw new Error(
    `sandbox-dsh cannot confine commands on Windows under the session shell "${shell.command}": ` +
      "its ACL runner does not start bash, sh or any other MSYS-runtime program (Git for " +
      "Windows, the bundled MinGit, MSYS2). " +
      `${SESSION_SHELL_FIX}.`,
  );
}

/**
 * Refuse, before the runner is involved, a spawn whose program the ACL runner cannot start.
 * Without this every confined command still fails closed, but with the runner's error — which
 * names WSL or an MSYS internal, not the setting that fixes it. The same `confine()` carries a
 * stdio MCP Server's launch command, which `PENGUIN_SHELL` does not choose: only a program that
 * IS the session shell is pointed at that setting. A `sessionShell` of `null` (a host core that
 * does not export it) cannot tell the two apart and keeps the session shell's wording.
 */
export function assertAclRunnerCanStart(
  argv: readonly string[],
  platform: NodeJS.Platform = process.platform,
  sessionShell: SessionShell | null = null,
): void {
  const program = argv[0];
  if (platform !== "win32" || program === undefined || !unstartable(program)) return;
  if (sessionShell === null || sessionShell.command.toLowerCase() === program.toLowerCase()) {
    throw new Error(
      `sandbox-dsh cannot confine "${program}" on Windows: its ACL runner does not start bash, ` +
        `sh or any other MSYS-runtime program (Git for Windows, the bundled MinGit, MSYS2). ` +
        `${SESSION_SHELL_FIX}; refusing to run the ` +
        "command unconfined.",
    );
  }
  throw new Error(
    `sandbox-dsh cannot confine "${program}" on Windows: its ACL runner does not start bash, ` +
      "sh or any other MSYS-runtime program (Git for Windows, the bundled MinGit, MSYS2, or " +
      "System32's WSL launcher); start the program " +
      "directly, or through PowerShell; refusing to run it unconfined.",
  );
}

/** What `aclRunnerArgv` reads of the running process; injectable for tests. */
export interface AclRunnerHost {
  platform?: NodeJS.Platform;
  /** The environment the program is spawned with; the harness's own when absent. */
  env?: Readonly<Record<string, string | undefined>>;
  isFile?: (file: string) => boolean;
}

/** The two `node:fs` calls {@link isProgramFile} makes; injectable for tests. */
export interface ProgramFileFs {
  statSync: (file: string) => { isFile(): boolean; isDirectory(): boolean };
  lstatSync: (file: string) => { isFile(): boolean; isSymbolicLink(): boolean };
}

/**
 * Whether `file` is a program PATH can name. An App Execution Alias — what
 * `%LOCALAPPDATA%\Microsoft\WindowsApps` holds for a Store install of PowerShell 7 — is a
 * reparse point that `stat` cannot follow (it throws, or reports something other than a file),
 * so the entry itself is accepted when `lstat` sees a file or a link there.
 */
export function isProgramFile(file: string, fs: ProgramFileFs = { statSync, lstatSync }): boolean {
  try {
    const stat = fs.statSync(file);
    if (stat.isFile()) return true;
    if (stat.isDirectory()) return false;
  } catch {
    // Fall through to the entry itself.
  }
  try {
    const entry = fs.lstatSync(file);
    return entry.isFile() || entry.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * `argv` with a bare program name replaced by the file PATH names — the PATH of the environment
 * the program is spawned with (`host.env`), the harness's own when the caller passes none. The ACL
 * runner starts its command with CreateProcessAsUserW and no application name, and for a bare
 * name Windows then searches, in order: the directory of the runner's own executable (the
 * harness's node, or the desktop app's Electron), the runner's current directory — the
 * session's working directory, so the Workspace or a directory inside it — System32, the
 * 16-bit system directory, the Windows directory, and PATH last. A `pwsh.exe` written into
 * the Workspace, by the Agent or by a cloned repository, would therefore start in place of
 * PowerShell (still under the restricted token), and a name System32 also carries shadows
 * PATH: a bare `bash` reached the WSL launcher (fork CI run 36579953129). An absolute path
 * leaves the runner nothing to search. The lookup is Windows' own for a name without a
 * directory — `.exe` appended when it has no extension — over PATH's absolute entries only,
 * so neither the current directory nor a relative entry such as `.` takes part; a name PATH
 * does not carry is refused, never handed back to the runner's search (naming the `.cmd` or
 * `.bat` PATH carries under that name, when there is one). The path the runner
 * gets is also the one its spawn error names ("command: …"). A program given with a
 * directory, relative or absolute, is passed on as it is.
 */
export function aclRunnerArgv(argv: readonly string[], host: AclRunnerHost = {}): string[] {
  const [program, ...rest] = argv;
  const platform = host.platform ?? process.platform;
  if (platform !== "win32" || program === undefined || /[\\/:]/.test(program)) return [...argv];
  const env = host.env ?? process.env;
  const exists = host.isFile ?? isProgramFile;
  // Windows spells the variable `Path`; whichever key the environment has is the one read.
  const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH");
  const bare = path.win32.extname(program) === "";
  const file = bare ? `${program}.exe` : program;
  const dirs = (key === undefined ? "" : (env[key] ?? ""))
    .split(";")
    .map((entry) => entry.trim().replace(/^"(.*)"$/, "$1"))
    .filter((dir) => path.win32.isAbsolute(dir));
  for (const dir of dirs) {
    const candidate = path.win32.join(dir, file);
    if (exists(candidate)) return [candidate, ...rest];
  }
  // A stdio MCP Server's launch command comes through here too, and `npx` or `uvx` is a batch
  // file on Windows: name the one PATH carries, so a missing .exe does not read as a missing
  // install. The lookup stays .exe-only — this changes what the refusal says, not what starts.
  const batch = bare
    ? dirs
        .flatMap((dir) => [".cmd", ".bat"].map((ext) => path.win32.join(dir, program + ext)))
        .find((candidate) => exists(candidate))
    : undefined;
  if (batch !== undefined) {
    throw new Error(
      `sandbox-dsh cannot confine "${program}" on Windows: no ${file} in a directory on its ` +
        `PATH, which carries the batch file ${batch}; a bare name is looked up as ` +
        `.exe only, so to hand over the batch file, name it with its extension ` +
        `("${path.win32.basename(batch)}"); refusing to run the command unconfined.`,
    );
  }
  throw new Error(
    `sandbox-dsh cannot confine "${program}" on Windows: no ${file} in a directory on its ` +
      "PATH, and its ACL runner would otherwise search the Workspace for it; name " +
      "the program by its absolute path, or put its directory on PATH; refusing to run the " +
      "command unconfined.",
  );
}

/**
 * The host's plugin contract, named by a variable so this package's bundle leaves the import to
 * run time: tsup inlines `@prismshadow/penguin-core/plugin` for the decorators (a literal
 * specifier), and a second, bundled copy of the session shell would be this package's
 * resolution, not the harness's. Resolved where the plugin runs — from the installation, or
 * lent by the host to a plugin store entry (the server's plugin/activation.ts).
 */
const HOST_CORE: string = "@prismshadow/penguin-core/plugin";

/**
 * The harness's session shell, from the host's core; `null` when that core does not export
 * `sessionShell` (it arrived after the runtimes a hot push may still be running on) or cannot
 * be reached. Read by namespace, never as a static named import: a missing export must not
 * fail this module's linking. `load` is injectable for tests.
 */
export async function hostSessionShell(
  load: () => Promise<unknown> = () => import(HOST_CORE),
): Promise<SessionShell | null> {
  let core: { sessionShell?: unknown };
  try {
    core = (await load()) as { sessionShell?: unknown };
  } catch {
    return null;
  }
  return typeof core.sessionShell === "function" ? (core.sessionShell() as SessionShell) : null;
}

/** What `loadDshAdaptor` reads of the running process; injectable for tests. */
export interface DshLoadHost {
  platform?: NodeJS.Platform;
  /** The session shell, `null` for a host core without one; read from the host when absent. */
  sessionShell?: SessionShell | null;
}

/**
 * The rung DSH's chain selected, by the program its wrap starts: on Linux bubblewrap when it
 * passed the chain's probe, else the Landlock launcher; one rung each on macOS and Windows.
 */
export function rungName(platform: NodeJS.Platform, runner: string | undefined): string {
  if (platform === "darwin") return "Seatbelt";
  if (platform === "win32") return "the Windows ACL runner";
  return runner === "bwrap" ? "bubblewrap" : "Landlock";
}

/**
 * What the rung leaves open, for the settings card. DSH's policy takes the mode and the
 * Workspace and nothing more, so no rung grants the Session's scratchpad (SandboxPolicy
 * .writableRoots). Landlock grants the host's own /tmp; on a kernel older than Landlock ABI 5
 * the launcher governs only part of the file accesses, and says so on every run (dropped from
 * the command's stderr, see the core's ConfinedSpawn.runnerLines).
 */
export function rungLimits(rung: string, enforcement: "full" | "partial"): SandboxLimit[] {
  const limits: SandboxLimit[] = [
    {
      text: `${rung}: under Workspace Write the Session scratchpad is not writable — DSH's policy takes the Workspace alone — so commands cannot write the plan, goal or attachment files kept there.`,
      textZh: `${rung}：仅工作区可写下 Session scratchpad 不可写（DSH 的策略只接受工作区），命令无法写入其中的计划、目标与附件文件。`,
    },
  ];
  if (rung !== "Landlock") return limits;
  limits.push({
    text: "Landlock: under Workspace Write the temporary directory is the host's shared /tmp, writable by every confined command; it cannot be closed or made private here.",
    textZh:
      "Landlock：仅工作区可写下，临时目录就是宿主共享的 /tmp，每条受限命令都可写；本机无法关闭它，也无法让它私有。",
  });
  if (enforcement === "partial") {
    limits.push({
      text: "Landlock (partial): this kernel's Landlock ABI is older than 5 (Linux 6.10), so ioctl on device files outside the Workspace is not restricted; below ABI 3 (Linux 6.2) truncating a file outside the Workspace is not restricted either.",
      textZh:
        "Landlock（partial）：本机内核的 Landlock ABI 低于 5（Linux 6.10），工作区外设备文件上的 ioctl 不受限制；低于 ABI 3（Linux 6.2）时，截断工作区外的文件也不受限制。",
    });
  }
  return limits;
}

/**
 * Mount the stock DSH chain on a bare cordis Context — exactly how DSH's own tests mount it —
 * after checking, on Windows, that its ACL runner can start the session shell at all.
 */
export async function loadDshAdaptor(host: DshLoadHost = {}): Promise<SandboxProvider | null> {
  const platform = host.platform ?? process.platform;
  const shell =
    platform !== "win32"
      ? null
      : host.sessionShell !== undefined
        ? host.sessionShell
        : await hostSessionShell();
  assertSessionShellConfinable(shell, platform);
  const { Context } = await import("@deepseek-ai/cordis");
  const { LocalSandboxProvider } = await import("@deepseek-ai/dsh-sandbox-local");
  const ctx = new Context();
  // `ctx.plugin` is cordis's own API name, not this repo's vocabulary.
  await ctx.plugin(LocalSandboxProvider, {});
  const dsh = ctx.sandbox;
  // The chain picks its rung on the first confine; do that here, so the settings card can name
  // the rung that serves. On Linux, whose chain has two rungs, that is the chain's functional
  // probes (DSH keeps the verdict for the provider's lifetime), and a host where neither works
  // fails this load with DSH's reason instead of mounting a backend that refuses every command.
  // macOS and Windows have a single rung, which DSH selects unprobed: this proves nothing there.
  const probe = dsh.confine([process.execPath], { mode: "read-only", workspaceRoot: tmpdir() });
  const rung = rungName(platform, probe.argv[0]);
  return {
    // DSH's own words: "Network and process visibility are outside this vocabulary." Nor can it
    // close the temporary directory (`closed-temp`): every rung grants one under workspace-write.
    dimensions: ["fs-write"],
    mechanism: rung + (probe.enforcement === "partial" ? " (partial)" : ""),
    limits: rungLimits(rung, probe.enforcement),
    confine(argv, policy, spawn): ConfinedArgv {
      if (policy.mode === "danger-full-access") {
        // Unreachable: this backend implements only fs-write, so the service never hands it a
        // full-access policy (which only ever arrives with a network/mask dimension it lacks).
        throw new Error("dsh-local does not implement full filesystem access with confinement");
      }
      assertAclRunnerCanStart(argv, platform, shell);
      // PATH is the spawn's own (a stdio MCP Server's entry env, a command's vault); an
      // embedder that does not pass it leaves the harness's.
      const program = aclRunnerArgv(argv, {
        platform,
        ...(spawn?.env !== undefined ? { env: spawn.env } : {}),
      });
      const confined = dsh.confine(program, {
        mode: policy.mode,
        workspaceRoot: policy.workspaceRoot,
      });
      return {
        argv: confined.argv,
        enforcement: confined.enforcement,
        denialSignatures: confined.denialSignatures,
        runnerFailureRules: confined.runnerFailureRules,
      };
    },
  };
}

/**
 * The plugin's one module: a provider on the sandbox slot, the code half of the
 * contribution the decorator declares (its manifest is generated into ifaces.json from
 * here). Created per App, so a hot swap gets a fresh provider.
 */
@Component({
  contributes: {
    "WebModule.quickStarts": [
      {
        id: "sandbox-dsh.quick-start",
        prompt:
          "Test the sandbox your commands run under. Run three separate commands: write a file inside this Workspace, write a file in your home directory outside it, and fetch https://example.com. Report which succeeded and which were denied; if all three succeed, the sandbox is off (Settings → Plugins → Sandbox).",
        promptZh:
          "测试你执行命令时所处的沙盒。分三条命令执行：在当前工作区内写一个文件、在工作区外的家目录写一个文件、访问 https://example.com。报告哪些成功、哪些被拒；如果三条都成功，说明沙盒处于关闭状态（设置 → 插件 → 沙盒）。",
      },
    ],
    "SandboxModule.providers": [
      { id: "sandbox-dsh.provider", name: "dsh-local", dimensions: ["fs-write"] },
    ],
  },
})
export class SandboxDsh {
  @Bind("sandbox-dsh.provider") provider!: SandboxProviderSource;

  setup() {
    this.provider = loadDshAdaptor();
  }
}

const plugin: Plugin = { modules: [SandboxDsh] };
export default plugin;
