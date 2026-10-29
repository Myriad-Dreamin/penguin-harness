/**
 * The static compatibility gate a push runs BEFORE anything is sent.
 *
 * A hot push asks a running runtime to dispose the tree that is serving it and boot the
 * pushed one in its place. Most ways that can tear the receiver are already checked AT
 * BOOT — the claim the pushed platform makes on the runtime's capabilities, and the
 * resource reconciliation its create() runs: a bad push is refused and the previous
 * platform re-booted. What the pusher could not see is the same facts BEFORE the push:
 * the checks need the pushed tree and the SERVING tree, and until this gate only the
 * receiver had both.
 *
 * The gate is pure functions over two trees:
 *
 *   - runtime interface needs (capabilities.ts's HMR_INTERFACES): the push's needs must
 *     be a subset of the serving tree's — the runtime that satisfies the serving tree
 *     then also satisfies the push. A need the serving tree never declared might be a
 *     member this runtime does not publish.
 *   - the platform member face (platform.ts's PlatformApi): the push's must include the
 *     serving tree's — the shell forwards into these members, and one the runtime calls
 *     cannot be dropped.
 *   - the migration ledger (db/migrations/index.ts): the serving tree's named sequence
 *     must be a prefix of the push's, and a shared name may not flip its swap safety —
 *     the ledger is append-only by its own rules.
 *
 * A violation refuses the push (--force pushes anyway). The DECLARED_RESOURCES diff is
 * reported, not enforced: the groups this swap will not integrate are listed in the push
 * receipt, because they are exactly "what this swap will do to the target's live
 * resources". A target tree that cannot be read — a provenance this checkout's git
 * objects lack, a tree pushed from uncommitted work — is announced as NOT RUN and does
 * not block; an extractor that cannot parse a readable tree FAILS the gate, because a
 * check that cannot see is not a check that passed.
 *
 * deploy.mjs wires the gate into every push; standalone, the CLI compares a checkout
 * with a commit that must already be in its git object store:
 *
 *   node scripts/check-push-compat.mjs <pushDir> <targetCommit>
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Repo-relative paths of the four declarations the gate reads. */
const CAPABILITIES = "packages/server/src/hmr/capabilities.ts";
const PLATFORM = "packages/server/src/hmr/platform.ts";
const MIGRATIONS = "packages/server/src/db/migrations/index.ts";

/** Block comments, and `//` comments on their own line, off: the declarations carry their reasons as comments. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** The balanced interior of the bracket that opens at `openIndex`, or null when unbalanced. */
function captureBlock(source, openIndex, open, close) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close && --depth === 0) return source.slice(openIndex + 1, i);
  }
  return null;
}

/** The declared object after `marker` (its first `{` … matching `}`), or null. */
function declaredBlock(stripped, marker) {
  const at = stripped.indexOf(marker);
  if (at === -1) return null;
  const open = stripped.indexOf("{", at + marker.length);
  if (open === -1) return null;
  return captureBlock(stripped, open, "{", "}");
}

const IDENT = "[A-Za-z_$][A-Za-z0-9_$]*";

/** One entry: a plain key, or a computed `[IDENT]` key; a string, a string array, or an identifier. */
const ENTRY_RE = new RegExp(
  `(?:\\[(${IDENT})\\]|(${IDENT}))\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|\\[([^\\]]*)\\]|(${IDENT}))\\s*,?`,
  "g",
);

/** The strings of an array body; null when an element is not a string literal. */
function stringArray(body) {
  const out = [];
  for (const part of body.split(",")) {
    const s = part.trim();
    if (s.length === 0) continue;
    if (!/^"(?:[^"\\]|\\.)*"$/.test(s)) return null;
    try {
      out.push(JSON.parse(s));
    } catch {
      return null;
    }
  }
  return out;
}

/**
 * The entries of a declaration object, as key → string[]. A computed key and an identifier
 * value are resolved through `resolveIdent`; a resolution that cannot name a string fails.
 */
function parseEntries(body, resolveIdent) {
  const entries = new Map();
  for (const m of body.matchAll(ENTRY_RE)) {
    const key = m[1] !== undefined ? resolveIdent(m[1]) : m[2];
    if (key === null || key === undefined) return null;
    let value;
    if (m[3] !== undefined) {
      try {
        value = [JSON.parse(`"${m[3]}"`)];
      } catch {
        return null;
      }
    } else if (m[4] !== undefined) {
      value = stringArray(m[4]);
      if (value === null) return null;
    } else {
      const resolved = resolveIdent(m[5]);
      if (resolved === null || resolved === undefined) return null;
      value = [resolved];
    }
    if (entries.has(key)) return null;
    entries.set(key, value);
  }
  return entries;
}

/** The string a same-file `const <ident> = "…"` names, or null. */
function constString(source, ident) {
  const m = new RegExp(`(?:export\\s+)?const\\s+${ident}\\s*=\\s*"([^"\\\\]*)"`).exec(source);
  return m !== null ? m[1] : null;
}

/** A relative import specifier resolved from a repo-relative file, `.js` to `.ts`; null for package imports. */
function resolveSpecifier(fromFile, spec) {
  if (typeof spec !== "string" || !spec.startsWith(".")) return null;
  return path.posix.join(path.posix.dirname(fromFile), spec).replace(/\.(?:js|mjs)$/, ".ts");
}

/**
 * Resolves an identifier named in `fromFile`'s declaration to the string it names,
 * following at most one import and one re-export hop: same-file const → `export const` in
 * the imported file → a re-export chain from it. These declarations carry no other shape.
 */
function identResolver(read, fromFile) {
  return (ident) => {
    const stripped = stripComments(typeof read(fromFile) === "string" ? read(fromFile) : "");
    const direct = constString(stripped, ident);
    if (direct !== null) return direct;
    const imp = new RegExp(
      `import\\s+(?:type\\s+)?\\{[^}]*\\b${ident}\\b[^}]*\\}\\s*from\\s*"([^"]+)"`,
    ).exec(stripped);
    if (imp === null) return null;
    const file = resolveSpecifier(fromFile, imp[1]);
    if (file === null) return null;
    const next = stripComments(typeof read(file) === "string" ? read(file) : "");
    const def = constString(next, ident);
    if (def !== null) return def;
    const re = new RegExp(`export\\s*\\{[^}]*\\b${ident}\\b[^}]*\\}\\s*from\\s*"([^"]+)"`).exec(
      next,
    );
    if (re === null) return null;
    const file2 = resolveSpecifier(file, re[1]);
    if (file2 === null) return null;
    return constString(stripComments(typeof read(file2) === "string" ? read(file2) : ""), ident);
  };
}

/**
 * The runtime interface needs a tree declares: its family tag, and per capability name the
 * members its claimer reaches for. Null when the declaration cannot be read.
 */
export function extractHmrInterfaces(source) {
  if (typeof source !== "string") return null;
  const body = declaredBlock(stripComments(source), "export const HMR_INTERFACES");
  if (body === null) return null;
  const stripped = stripComments(source);
  const entries = parseEntries(body, (ident) => constString(stripped, ident));
  if (entries === null) return null;
  const family = entries.get("family");
  if (family === undefined || family.length !== 1) return null;
  const need = {};
  for (const [name, members] of entries) if (name !== "family") need[name] = members;
  return { family: family[0], need };
}

/**
 * The platform's own member face: the names its interface declares above its heritage
 * clause (the heritage is compared too — the runtime reaches through it). Null when the
 * interface cannot be read.
 */
export function extractPlatformApiMembers(source) {
  if (typeof source !== "string") return null;
  const stripped = stripComments(source);
  const head = new RegExp(`export interface PlatformApi\\b([^{]*)\\{`).exec(stripped);
  if (head === null) return null;
  const body = captureBlock(stripped, head.index + head[0].length - 1, "{", "}");
  if (body === null) return null;
  const members = [];
  let depth = 0;
  for (const line of body.split("\n")) {
    if (depth === 0) {
      const m = new RegExp(`^\\s*(${IDENT})\\s*[(:]`).exec(line);
      if (m !== null && !members.includes(m[1])) members.push(m[1]);
    }
    for (const ch of line) {
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
    }
  }
  const heritage = head[1].replace(/\bextends\b/, "").trim();
  return { heritage, members };
}

/**
 * The named migration ledger a tree declares, in order: each entry's name and swap
 * safety, read out of the per-step files the list imports. Null when any of it cannot
 * be read — a ledger that cannot be parsed is not a ledger that passed.
 */
export function extractMigrationsLedger(read) {
  const raw = read(MIGRATIONS);
  if (typeof raw !== "string") return null;
  const stripped = stripComments(raw);
  const marker = "export const MIGRATIONS";
  const at = stripped.indexOf(marker);
  if (at === -1) return null;
  // Past the type annotation (its own `[]` must not be taken for the list): the list
  // opens at the first `[` after the `=`.
  const eq = stripped.indexOf("=", at + marker.length);
  if (eq === -1) return null;
  const open = stripped.indexOf("[", eq + 1);
  if (open === -1) return null;
  const body = captureBlock(stripped, open, "[", "]");
  if (body === null) return null;
  const idents = body
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (idents.some((s) => !new RegExp(`^${IDENT}$`).test(s))) return null;
  const imports = new Map();
  for (const m of stripped.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    for (const name of m[1].split(",").map((s) => s.trim())) {
      if (name.length > 0) imports.set(name, resolveSpecifier(MIGRATIONS, m[2]));
    }
  }
  const ledger = [];
  for (const ident of idents) {
    const file = imports.get(ident);
    if (file === undefined || file === null) return null;
    const step = read(file);
    if (typeof step !== "string") return null;
    const decl = declaredBlock(stripComments(step), `export const ${ident}`);
    if (decl === null) return null;
    const name = /name:\s*"([^"\\]*)"/.exec(decl);
    const swapSafe = /swapSafe:\s*(true|false)/.exec(decl);
    if (name === null || swapSafe === null) return null;
    ledger.push({ name: name[1], swapSafe: swapSafe[1] === "true" });
  }
  return ledger;
}

/**
 * The resource groups a tree declares it parks: the family tag, and per group name (the
 * machine-session group's name is a versioned constant, resolved through its import) the
 * members this build's adopters reach for. Null when the declaration cannot be read.
 */
export function extractDeclaredResources(read) {
  const raw = read(PLATFORM);
  if (typeof raw !== "string") return null;
  const body = declaredBlock(stripComments(raw), "export const DECLARED_RESOURCES");
  if (body === null) return null;
  const entries = parseEntries(body, identResolver(read, PLATFORM));
  if (entries === null) return null;
  const family = entries.get("family");
  if (family === undefined || family.length !== 1) return null;
  const groups = {};
  for (const [name, members] of entries) if (name !== "family") groups[name] = members;
  return { family: family[0], groups };
}

/**
 * The three enforced comparisons and the reported resource diff. `violations` refuse a
 * push; `doomed` names the groups the swap will not integrate, each with the reason the
 * runtime's reconciliation would give.
 */
export function compareFaces(push, target) {
  const violations = [];
  const doomed = [];

  if (push.interfaces.family !== target.interfaces.family) {
    violations.push(
      `runtime interface family: the push declares '${push.interfaces.family}', ` +
        `the serving tree '${target.interfaces.family}'`,
    );
  }
  for (const [name, members] of Object.entries(push.interfaces.need)) {
    const served = target.interfaces.need[name];
    if (served === undefined) {
      violations.push(
        `runtime capability '${name}': the push reaches for it, the serving tree never did`,
      );
      continue;
    }
    for (const member of members) {
      if (!served.includes(member)) {
        violations.push(
          `runtime capability '${name}': the push reaches for '${member}', the serving tree does not`,
        );
      }
    }
  }

  if (push.platform.heritage !== target.platform.heritage) {
    violations.push(
      `platform interface base: the push extends '${push.platform.heritage || "(nothing)"}', ` +
        `the serving tree '${target.platform.heritage || "(nothing)"}'`,
    );
  }
  for (const member of target.platform.members) {
    if (!push.platform.members.includes(member)) {
      violations.push(`platform member '${member}': the serving tree serves it, the push drops it`);
    }
  }

  const served = target.ledger;
  const pushing = push.ledger;
  for (let i = 0; i < served.length; i++) {
    const here = pushing[i];
    if (here !== undefined && here.name === served[i].name) {
      if (here.swapSafe !== served[i].swapSafe) {
        violations.push(
          `migration '${served[i].name}': the push flips its swap safety ` +
            `(the serving tree: ${served[i].swapSafe}, the push: ${here.swapSafe})`,
        );
      }
      continue;
    }
    const at = pushing.findIndex((entry) => entry.name === served[i].name);
    if (at === -1) {
      violations.push(
        `migration '${served[i].name}': the serving tree's ledger has it, the push's does not`,
      );
    } else {
      violations.push(
        `migration '${served[i].name}': the serving tree applies it as entry ${i + 1}, ` +
          `the push as entry ${at + 1} — the ledger is append-only`,
      );
    }
    break;
  }

  if (push.resources.family !== target.resources.family) {
    for (const group of Object.keys(target.resources.groups)) {
      doomed.push(`'${group}': resource family differs, nothing is handed over`);
    }
  } else {
    for (const [group, offered] of Object.entries(target.resources.groups)) {
      const need = push.resources.groups[group];
      if (need === undefined) {
        doomed.push(
          `'${group}': dropped from this build's declared resources — ` +
            "its objects are disposed and the machinery behind them started fresh",
        );
        continue;
      }
      const beyond = need.filter((member) => !offered.includes(member));
      if (beyond.length > 0) {
        doomed.push(
          `'${group}': this build reaches for ${beyond.map((m) => `'${m}'`).join(", ")} ` +
            "beyond what the serving objects carry — the delivered objects run their own code, " +
            "so the group is not adopted and is started fresh",
        );
      }
    }
  }
  return { violations, doomed };
}

/**
 * Which commit names the target's serving tree, out of its version report. The pushed
 * platform's provenance comes first — `git describe` of the checkout it was built from;
 * with no push on record the packaged platform ships with the runtime's own build, whose
 * commit the report also names. `sha: null` (with the reason) means the tree cannot be
 * identified and the gate must announce itself as not run.
 */
export function targetTreeCommit(report) {
  if (typeof report !== "object" || report === null) return { sha: null, why: "no version report" };
  const harness = report.harness;
  if (harness !== null && typeof harness === "object") {
    const revision = harness.source?.revision;
    if (typeof revision === "string" && revision.length > 0) {
      if (revision.endsWith("-dirty")) {
        return {
          sha: null,
          why: `the serving platform was pushed from uncommitted work ('${revision}')`,
        };
      }
      const m = /-g([0-9a-f]{7,40})$/.exec(revision);
      if (m === null) {
        return {
          sha: null,
          why: `cannot read a commit out of the serving platform's provenance ('${revision}')`,
        };
      }
      return { sha: m[1], why: "" };
    }
    return { sha: null, why: "the serving platform was pushed without provenance" };
  }
  if (
    typeof report.commit === "string" &&
    /^[0-9a-f]{40}$/.test(report.commit) &&
    report.dirty !== true
  ) {
    return { sha: report.commit, why: "" };
  }
  if (report.dirty === true) {
    return { sha: null, why: "the running build was stamped from uncommitted work" };
  }
  return { sha: null, why: "the report names neither pushed provenance nor a build commit" };
}

/** The `recovered` of a failed push's 400 body: true — back on the previous platform; false — the recovery failed too. */
export function recoveredFromRefusal(text) {
  try {
    const body = JSON.parse(text);
    const recovered = body?.error?.recovered;
    return typeof recovered === "boolean" ? recovered : null;
  } catch {
    return null;
  }
}

/**
 * The gate: both trees as `read(repoRelPath) → source | null` providers. An unreadable or
 * unparseable tree FAILS the gate (one violation naming it) — a check that cannot see is
 * not a check that passed; only a target that cannot be identified at all is "not run",
 * which is the caller's `ran: false` case, decided before this runs.
 */
export function checkPushCompat({ readPush, readTarget }) {
  const sides = [
    ["push", readPush],
    ["the serving tree", readTarget],
  ];
  const faces = sides.map(([side, read]) => {
    const interfaces = extractHmrInterfaces(read(CAPABILITIES));
    const platform = extractPlatformApiMembers(read(PLATFORM));
    const ledger = extractMigrationsLedger(read);
    const resources = extractDeclaredResources(read);
    return { interfaces, platform, ledger, resources, side };
  });
  const names = [
    ["the runtime interface declaration", "interfaces"],
    ["the platform member face", "platform"],
    ["the migration ledger", "ledger"],
    ["the declared resources", "resources"],
  ];
  for (const tree of faces) {
    for (const [what, key] of names) {
      if (tree[key] === null) {
        return {
          ran: true,
          why: "",
          violations: [
            `${tree.side}: cannot read ${what} — the gate cannot see, so it does not pass`,
          ],
          doomed: [],
        };
      }
    }
  }
  return { ran: true, why: "", ...compareFaces(faces[0], faces[1]) };
}

/** A checkout's files, as the gate reads them. */
function localReader(root) {
  return (rel) => {
    try {
      return fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      return null;
    }
  };
}

/** A committed tree's files, out of this checkout's git object store. */
function gitReader(root, commit) {
  return (rel) => {
    try {
      return execFileSync("git", ["-C", root, "show", `${commit}:${rel}`], {
        encoding: "utf8",
        // git's own "fatal: path … does not exist" is noise here: the null IS the answer.
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null;
    }
  };
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const [pushDir, commit] = process.argv.slice(2);
  if (commit === undefined) {
    console.error("Usage: node scripts/check-push-compat.mjs <pushDir> <targetCommit>");
    process.exit(2);
  }
  const root = path.resolve(pushDir);
  let resolved = null;
  try {
    resolved = execFileSync("git", ["-C", root, "rev-parse", "--verify", `${commit}^{commit}`], {
      encoding: "utf8",
    })
      .toString()
      .trim();
  } catch {
    /* fall through */
  }
  if (resolved === null) {
    console.error(
      `[compat] cannot read the target tree: '${commit}' is not a commit in ${root}'s git objects`,
    );
    process.exit(2);
  }
  const result = checkPushCompat({
    readPush: localReader(root),
    readTarget: gitReader(root, resolved),
  });
  for (const line of result.doomed) console.log(`[compat] ${line}`);
  if (result.doomed.length > 0) {
    console.log(
      "[compat] the groups above are what this swap will NOT integrate; " +
        "structural shape checks stay at boot.",
    );
  }
  for (const line of result.violations) console.error(`[compat] ${line}`);
  if (result.violations.length > 0) {
    console.error("[compat] the static compatibility gate FAILED.");
    process.exitCode = 1;
  } else {
    console.log(
      "[compat] static compatibility gate: clean (interfaces, platform member face, migration ledger).",
    );
  }
}
