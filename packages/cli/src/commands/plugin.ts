/**
 * `penguin plugin check` — the review of the CLI's command contributions.
 *
 *   penguin plugin check
 *
 * One report, three problem classes, and the faults that kept a source out of the
 * discovery: keys two or more packages contribute (ambiguous — the invocation is the
 * moment that reports them, this is the standing overview), registrations the ownership
 * rules refused (reserved roots, a foreign subtree its owner did not open, a package's
 * own duplicate, a malformed entry — ignored by help and dispatch, so this is the only
 * place they surface), and skill texts that call an ambiguous command (a skill saying
 * `penguin x y` fixes no ambiguity by being written down; the line is listed so the
 * author can switch it to `penguin exec <package> x y`). Exit code: 0 when nothing was
 * found, 1 when anything was — a script's way to gate on the report.
 *
 * The skills scan reads every plugin package the closure resolved, contributing commands
 * or not: a plugin whose skill calls another package's ambiguous key is exactly the case
 * worth catching. Each package's `skills` tree (every SKILL.md in it) is read line by
 * line; the scanner takes the words after a `penguin` token (options skipped), and
 * reports the line when an ambiguous key is a prefix of them.
 */
import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import type { Messages } from "../i18n.js";
import { cliContext } from "../context.js";
import { discoverCliCommands, keyMatches, type InvalidReason } from "../contributions.js";

/** One reason an invalid registration was refused, rendered in the report's language. */
function reasonText(reason: InvalidReason, t: Messages): string {
  switch (reason.kind) {
    case "reserved":
      return t.pluginCheck.reasonReserved(reason.root);
    case "foreign-subtree":
      return t.pluginCheck.reasonForeign(reason.prefix, reason.owner);
    case "duplicate":
      return t.pluginCheck.reasonDuplicate();
    case "malformed":
      return t.pluginCheck.reasonMalformed(reason.detail);
  }
}

/** Every `SKILL.md` under `<dir>/skills`, recursively; absent directories read as none. */
function skillFiles(dir: string): string[] {
  const root = path.join(dir, "skills");
  const out: string[] = [];
  const walk = (current: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return; // absent or unreadable: no skills to scan here
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name === "SKILL.md") out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

/** The command words a line hands `penguin`, or none when it names none. */
function commandWords(line: string): string[] {
  const words: string[] = [];
  for (const token of line.split(/\s+/)) {
    // Backticks, quotes and trailing punctuation ride next to the words in prose; strip
    // the leading/trailing run of them so `penguin a b` and (penguin a b) both read.
    const word = token.replace(/^[`('"]+|[`'").,;:!?]+$/g, "");
    if (word === "penguin") {
      words.length = 0; // start over at the invocation
      continue;
    }
    if (words.length === 0) continue; // before any `penguin`: not a command call
    if (word.startsWith("-")) continue; // an option: not a command word
    if (!/^[a-z][a-z0-9-]*$/.test(word)) break; // prose: the command words are over
    words.push(word);
  }
  return words;
}

/** One hit: the skill file (relative to its package) and the line number. */
export interface SkillHit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/**
 * Scans one skill file's lines for calls of the ambiguous keys. Pure over its inputs, so a
 * test drives it with text, a display path and the discovery's ambiguous list.
 */
export function scanSkillText(
  text: string,
  file: string,
  ambiguous: readonly string[],
): SkillHit[] {
  const hits: SkillHit[] = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const words = commandWords(lines[index]!);
    if (words.length === 0 || words[0] === "exec" || words[0] === "help") continue;
    if (ambiguous.some((key) => keyMatches(key, words))) {
      hits.push({ file, line: index + 1, text: lines[index]!.trim() });
    }
  }
  return hits;
}

/** Registers the host's `plugin` command with its `check` subcommand. */
export function registerPluginCommand(
  program: Command,
  t: Messages,
  opts: { language: "en" | "zh" },
): void {
  const plugin = program
    .command("plugin")
    .description(t.pluginCheck.desc)
    .action(() => {
      plugin.outputHelp();
    });
  plugin
    .command("check")
    .description(t.pluginCheck.checkDesc)
    .action(async () => {
      const ctx = cliContext({ language: opts.language });
      const discovery = await discoverCliCommands({ root: ctx.root });
      let problems = 0;
      const section = (title: string): void => {
        if (problems === 0) process.stdout.write("\n");
        process.stdout.write(`${title}\n`);
        problems++;
      };

      if (discovery.ambiguous.length > 0) {
        section(t.pluginCheck.ambiguousSection);
        for (const key of discovery.ambiguous) {
          const pkgs: string[] = [];
          for (const cmd of discovery.commands) {
            if (cmd.entry.key === key && !pkgs.includes(cmd.pkg)) pkgs.push(cmd.pkg);
          }
          process.stdout.write(`${t.pluginCheck.ambiguousLine(key, pkgs)}\n`);
        }
      }

      if (discovery.invalid.length > 0) {
        section(t.pluginCheck.invalidSection);
        for (const reg of discovery.invalid) {
          process.stdout.write(
            `${t.pluginCheck.invalidLine(reg.pkg, reg.id, reg.key, reasonText(reg.reason, t))}\n`,
          );
        }
      }

      const skillHits: SkillHit[] = [];
      if (discovery.ambiguous.length > 0) {
        const scanned = new Set<string>();
        for (const { dir } of discovery.pluginPackages.values()) {
          if (scanned.has(dir)) continue; // two specifiers may resolve to one package
          scanned.add(dir);
          for (const file of skillFiles(dir)) {
            let text: string;
            try {
              text = fs.readFileSync(file, "utf8");
            } catch {
              continue; // unreadable: the review reads what it can
            }
            skillHits.push(...scanSkillText(text, path.relative(dir, file), discovery.ambiguous));
          }
        }
      }
      if (skillHits.length > 0) {
        section(t.pluginCheck.skillsSection);
        for (const hit of skillHits) {
          process.stdout.write(`${t.pluginCheck.skillLine(hit.file, hit.line)}\n`);
        }
      }

      if (discovery.faults.length > 0) {
        section(t.pluginCheck.faultsSection);
        for (const fault of discovery.faults) {
          process.stdout.write(`  ${fault}\n`);
        }
      }

      if (problems === 0) {
        process.stdout.write(`${t.pluginCheck.clean()}\n`);
        return;
      }
      process.exitCode = 1;
    });
}
