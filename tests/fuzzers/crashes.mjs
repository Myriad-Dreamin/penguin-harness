#!/usr/bin/env node
/**
 * Crash report generation for the fuzz legs — the scanner behind the dashboard's crash view.
 *
 *   node tests/fuzzers/crashes.mjs                    # scan both legs, write <leg>/out/crashes.json
 *   node tests/fuzzers/crashes.mjs --triage=4         # replay up to N untriaged titles in the
 *                                                     # standard one-shot container, record verdicts
 *   node tests/fuzzers/crashes.mjs --root=<tree>      # scan another tree (default: repo root)
 *
 * Shape follows syzkaller's crash store: the TITLE is the dedup key (normalized one-liner —
 * digits/ids/hex gone, route template and invariant tail kept), everything else hangs off it.
 * One signature found 120 times is ONE report with 120 occurrences; file counts are internal.
 *
 * Per title the report carries:
 *   title       the dedup key
 *   description verbatim message + how it was reached (≤8 calls) + rig state + first/last seen
 *   reports     the artifact paths on this machine (kit dir, crash input, run log, summary)
 *   triage      state machine, driven by actual replays against a stated build:
 *               new → confirmed (exit 0, still finds) / stale (2, no longer) / changed (3,
 *               different finding) — plus environment and corrupted for the two degenerate kinds
 *   reproduce   the exact command; the kit IS the reproducer (input + calls + planted state)
 *
 * Triage without a build sha is meaningless — the same input passes on last week's tree and
 * crashes today — so every verdict records the tree it was taken on.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const LEGS = ["server", "cli"];
const now = () => new Date().toISOString();

for (const arg of process.argv.slice(2)) {
  if (arg === "--triage" || arg.startsWith("--triage=")) continue;
  if (arg.startsWith("--root=")) continue;
  console.error(`usage: node tests/fuzzers/crashes.mjs [--triage[=N]] [--root=<tree>]`);
  process.exit(2);
}
const triageArg = process.argv.find((a) => a === "--triage" || a.startsWith("--triage="));
const triageMax = triageArg === undefined ? 0 : triageArg === "--triage" ? 3 : Number(triageArg.split("=")[1]) || 0;

function treeSha() {
  try {
    return execFileSync("git", ["-C", root, "rev-parse", "--short=10", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/** Normalize a finding message into a stable title tail: numbers, ids and hex gone. */
export function normalize(message) {
  return message
    .replace(/\d+/g, "N")
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "UUID")
    .replace(/\b[0-9a-f]{16,}\b/gi, "HEX")
    .replace(/x{2,}/g, "X")
    .replace(/session-\S+/g, "SID")
    .replace(/fuzz-[a-z]+-N+/g, "fuzz-$1-N")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

const KIND_LINE = {
  invariant: "an invariant broke",
  crash: "a call exited outside its allowed set",
  "soft-timeout": "a call exceeded its soft time bound",
  environment: "the rig's environment failed (disk, …)",
};

function scanLeg(leg) {
  const outDir = path.join(here, leg, "out");
  const titles = new Map();
  const add = (record) => {
    if (!titles.has(record.title)) titles.set(record.title, record);
    else {
      const t = titles.get(record.title);
      t.occurrences += record.occurrences;
      t.lastSeen = t.lastSeen > record.lastSeen ? t.lastSeen : record.lastSeen;
      t.firstSeen = t.firstSeen < record.firstSeen ? t.firstSeen : record.firstSeen;
      t.kits.push(...record.kits.slice(0, 1));
      t.crashFiles.push(...record.crashFiles);
    }
  };

  // Finding kits: the primary source — they carry kind, message, calls and rig state.
  const kits = [];
  if (fs.existsSync(outDir)) {
    for (const name of fs.readdirSync(outDir)) {
      if (!name.includes("-finding-")) continue;
      const dir = path.join(outDir, name);
      const kitFile = path.join(dir, "kit.json");
      if (!fs.existsSync(kitFile)) continue;
      let kit;
      try {
        kit = JSON.parse(fs.readFileSync(kitFile, "utf8"));
      } catch {
        kit = { leg, kind: "corrupted", message: `kit.json unreadable in ${name}` };
      }
      kits.push({ name, dir, kit, mtime: fs.statSync(dir).mtime.toISOString() });
    }
  }
  for (const { name, dir, kit, mtime } of kits) {
    const kind = kit.kind === "invariant" || kit.kind === "crash" || kit.kind === "soft-timeout"
      ? kit.kind
      : "environment";
    const title = `${leg}/${kind}: ${normalize(kit.message ?? "")}`;
    const crashInput = path.join(outDir, `crash-${name.split("-").pop()}`);
    const state = kit.state ?? {};
    const lines = [
      KIND_LINE[kind] ?? kind,
      "",
      "Message (verbatim):",
      kit.message ?? "(none)",
      "",
      "How it was reached:",
      ...(kit.calls ?? []).slice(0, 8).map((c) => `  ${c}`),
      (kit.calls?.length ?? 0) > 8 ? `  … ${(kit.calls.length - 8)} more` : "",
      "",
      `Rig state: epoch ${state.epoch ?? "?"}, calls ${state.calls ?? "?"}, ` +
        `inputs ${state.inputs ?? "?"}, clock ${state.clock ?? "?"}`,
      `First seen ${mtime} · ${1} kit on disk · crash input ${fs.existsSync(crashInput) ? path.basename(crashInput) : "(none saved)"}`,
    ].filter((l) => l !== "");
    add({
      title,
      kind,
      occurrences: 1,
      firstSeen: mtime,
      lastSeen: mtime,
      description: lines.join("\n"),
      reports: {
        kit: path.relative(root, dir),
        crashInput: fs.existsSync(crashInput) ? path.relative(root, crashInput) : null,
        runLog: path.relative(root, path.join(outDir, "run.log")),
        summary: path.relative(root, path.join(outDir, "summary.md")),
      },
      kits: [{ name, dir }],
      crashFiles: [],
      reproduce: `node tests/fuzzers/run.mjs ${leg} --replay=${path.join("tests/fuzzers", leg, "out", name)}\n` +
        `exit 0 = same kind of finding · 2 = no longer reproduces · 3 = a different finding`,
    });
  }

  // crash-*/oom-* files without a kit: the input survived, the kit write did not (or it is an
  // oom, which libFuzzer writes on its own). Grouped by hash so the count stays honest.
  if (fs.existsSync(outDir)) {
    for (const name of fs.readdirSync(outDir)) {
      if (!name.startsWith("crash-") && !name.startsWith("oom-")) continue;
      const kind = name.startsWith("oom-") ? "environment" : "crash";
      const title = `${leg}/${kind}: ${name} — ${kind === "environment" ? "the rig hit its RSS limit" : "saved without a finding kit"}`;
      add({
        title,
        kind,
        occurrences: 1,
        firstSeen: fs.statSync(path.join(outDir, name)).mtime.toISOString(),
        lastSeen: fs.statSync(path.join(outDir, name)).mtime.toISOString(),
        description: `libFuzzer saved ${name} with no companion kit — see run.log around its mtime for the report text.`,
        reports: { crashInput: path.relative(root, path.join(outDir, name)), runLog: path.relative(root, path.join(outDir, "run.log")) },
        kits: [],
        crashFiles: [name],
        reproduce: `node tests/fuzzers/run.mjs ${leg} --runs=0 --mode=regression  # replay the corpus; the input is in it if libFuzzer kept it`,
      });
    }
  }

  // History copies: occurrences, never identities. Counted per basename from the seen index
  // if the loop keeps one, else from the directory listing.
  const historyDir = path.join(outDir, "history");
  if (fs.existsSync(historyDir)) {
    const seen = new Map();
    for (const stamp of fs.readdirSync(historyDir)) {
      const d = path.join(historyDir, stamp);
      let names;
      try {
        names = fs.readdirSync(d);
      } catch {
        continue;
      }
      for (const n of names) {
        if (n.startsWith("crash-") || n.startsWith("oom-")) seen.set(n, (seen.get(n) ?? 0) + 1);
      }
    }
    for (const [file, copies] of seen) {
      const kind = file.startsWith("oom-") ? "environment" : "crash";
      const title = `${leg}/${kind}: ${file} — ${kind === "environment" ? "the rig hit its RSS limit" : "saved without a finding kit"}`;
      const t = titles.get(title);
      if (t) {
        t.occurrences += copies;
        t.crashFiles.push(file);
      } else {
        add({
          title, kind, occurrences: copies,
          firstSeen: copies > 0 ? "?" : "?", lastSeen: "?",
          description: `${copies} history copies of ${file}, no kit on disk — predates the kit writer.`,
          reports: { history: path.relative(root, historyDir) },
          kits: [], crashFiles: [file],
          reproduce: `node tests/fuzzers/run.mjs ${leg} --runs=0 --mode=regression`,
        });
      }
    }
  }
  return titles;
}

/** Triage one kit: replay it in the standard one-shot container and read the exit code. */
function triageKit(leg, kitName) {
  const kitDir = `/work/tests/fuzzers/${leg}/out/${kitName}`;
  const cmd =
    `mkdir -p /tmp/t && node run.mjs ${leg} --no-build --replay=${kitDir}; ` +
    `code=$?; echo TRIAGE_EXIT=$code; exit 0`;
  let stdout = "";
  try {
    stdout = execFileSync(
      "docker",
      ["run", "--rm", "--network", "none", "--cpus=2", "--memory=4g", "--user", "1007:1007",
       "-e", "HOME=/tmp", "-e", "LANG=C.UTF-8", "-e", "LC_ALL=C.UTF-8", "-e", "TMPDIR=/tmp/t",
       "-v", `${root}:/work`, "-w", "/work/tests/fuzzers", "node:24-trixie-slim", "bash", "-lc", cmd],
      { encoding: "utf8", timeout: 600_000 },
    );
  } catch (err) {
    return { state: "corrupted", detail: `replay run failed: ${String(err).slice(0, 200)}`, build: treeSha(), checkedAt: now() };
  }
  const m = stdout.match(/TRIAGE_EXIT=(\d+)/);
  const code = m ? Number(m[1]) : -1;
  const outcome = stdout.match(/\[replay\] outcome: ([^\n]*)/)?.[1] ?? "";
  const state = code === 0 ? "confirmed" : code === 2 ? "stale" : code === 3 ? "changed" : "corrupted";
  return { state, exit: code, outcome, build: treeSha(), checkedAt: now() };
}

const result = { generatedAt: now(), build: treeSha(), titles: [] };
for (const leg of LEGS) {
  for (const t of scanLeg(leg).values()) {
    t.kits = t.kits.slice(0, 3).map((k) => k.name);
    result.titles.push(t);
  }
}
result.titles.sort((a, b) => b.occurrences - a.occurrences || (a.firstSeen < b.firstSeen ? -1 : 1));

// Triage state persists across runs; `--triage=N` replays up to N titles still in `new`.
const stateFile = path.join(here, "server", "out", "crashes-state.json");
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};
let budget = triageMax;
for (const t of result.titles) {
  const prev = state[t.title];
  if (prev?.build === result.build) t.triage = prev;
  if (triageMax > 0 && !t.triage && budget > 0 && t.kits.length > 0) {
    console.error(`[triage] replaying ${t.kits[0]} — ${t.title}`);
    t.triage = triageKit(t.title.split("/")[0], t.kits[0]);
    state[t.title] = t.triage;
    budget -= 1;
  }
}
fs.writeFileSync(stateFile, JSON.stringify(state, null, 1));

for (const leg of LEGS) {
  const out = path.join(here, leg, "out", "crashes.json");
  const mine = result.titles.filter((t) => t.title.startsWith(`${leg}/`));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ ...result, titles: mine }, null, 1));
  const total = mine.reduce((s, t) => s + t.occurrences, 0);
  console.log(`[crashes] ${leg}: ${mine.length} title(s), ${total} occurrence(s) → ${path.relative(root, out)}`);
  for (const t of mine.slice(0, 12)) {
    console.log(`  ${String(t.occurrences).padStart(6)}× [${t.triage?.state ?? "new"}] ${t.title}`);
  }
  if (mine.length > 12) console.log(`  … ${mine.length - 12} more`);
}
