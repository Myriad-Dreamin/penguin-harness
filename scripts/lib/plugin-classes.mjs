/**
 * A plugin's class names, kept apart from the host's by the build — never by the author.
 *
 * A plugin's stylesheet is compiled by Tailwind over the plugin's sources, and the web app
 * attaches it after its own. Had it a second copy of a host utility (`.flex`, `.hidden`), that
 * copy would come later than the host's and reorder the host's cascade wherever two of them meet
 * on one element. A cascade layer cannot fix it from the outside: whichever side of the host's
 * utilities the plugin's layer sits on, one side's `p-2 px-4` resolves in the wrong order. So no
 * class of a plugin's sheet may share a name with the host's — every one carries a prefix.
 *
 * The author writes plain Tailwind classes. The build:
 *
 * 1. names the prefix from the package name (classPrefixOf) — nothing in the package spells it;
 * 2. compiles the author's sheet once as written, and reads the class names it defines
 *    (classNamesOf): exactly the tokens Tailwind accepted as utilities;
 * 3. compiles it again with Tailwind's `prefix()` and those names prefixed as its only sources
 *    (prefixedInput), so the sheet it ships is the first one with every class prefixed;
 * 4. routes the web modules' `react/jsx-runtime` through a wrapper (classRuntimePlugin) that
 *    prefixes those names in every `className` (and `…ClassName`) prop the plugin's own JSX
 *    passes, whatever computed the string.
 *
 * The web app checks the prefixes of the whole enabled set when it loads them
 * (packages/web/src/plugins/assemble.ts), as the build of one package cannot.
 */
import { createHash } from "node:crypto";

/** The JSX runtime the web modules import; the wrapper's own import of it reaches the host's. */
const JSX_RUNTIME = "react/jsx-runtime";
const WRAPPER_NS = "penguin-plugin-classes";

/**
 * The class prefix of a package: the letters of its unscoped name (at most 12) and four letters
 * of a hash of the whole name. Tailwind accepts lower-case letters only. The letters keep it
 * readable in devtools; the hash keeps `@a/foo-bar` and `@b/foobar` apart.
 */
export function classPrefixOf(packageName) {
  const letters = packageName
    .replace(/^@[^/]*\//, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 12);
  const digest = createHash("sha256").update(packageName).digest();
  const hash = [...digest.subarray(0, 4)].map((b) => String.fromCharCode(97 + (b % 26))).join("");
  return letters + hash;
}

/** A CSS identifier with its escapes resolved (`hover\:p-1\.5` → `hover:p-1.5`). */
function unescapeIdent(s) {
  return s.replace(/\\([0-9a-fA-F]{1,6}) ?|\\([\s\S])/g, (_, hex, ch) =>
    hex !== undefined ? String.fromCodePoint(parseInt(hex, 16)) : ch,
  );
}

/** A selector with every parenthesised part removed; an escaped parenthesis is part of a name. */
function outsideParens(selector) {
  let out = "";
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "\\") {
      if (depth === 0) out += selector.slice(i, i + 2);
      i++;
    } else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out;
}

/**
 * The selector preludes of a compiled sheet: the text before each `{` that is not an at-rule.
 * Escapes and quoted strings are read through, so a `{` or `;` inside a name or a value is not a
 * boundary.
 */
function selectorsOf(css) {
  const out = [];
  let buf = "";
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      buf += text.slice(i, i + 2);
      i++;
    } else if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === "\\" ? 2 : 1;
      buf += text.slice(i, j + 1);
      i = j;
    } else if (ch === "{") {
      const prelude = buf.trim();
      if (prelude !== "" && !prelude.startsWith("@")) out.push(prelude);
      buf = "";
    } else if (ch === "}" || ch === ";") buf = "";
    else buf += ch;
  }
  return out;
}

/** A class selector in a selector prelude (a dot after a backslash is part of a name). */
const CLASS =
  /(?<!\\)\.((?:-?[_a-zA-Z]|\\[0-9a-fA-F]{1,6} ?|\\[\s\S])(?:[\w-]|\\[0-9a-fA-F]{1,6} ?|\\[\s\S])*)/g;

/**
 * The class names a compiled sheet defines, unescaped: each class a selector names outside
 * parentheses — what Tailwind writes for a utility it accepted — plus the `group`/`peer` markers
 * a variant names inside them. Other classes inside parentheses are the host's (`dark:` reads
 * `:where(.dark, .dark *)`) and stay as they are.
 */
export function classNamesOf(css) {
  const out = new Set();
  for (const selector of selectorsOf(css)) {
    for (const [, name] of outsideParens(selector).matchAll(CLASS)) out.add(unescapeIdent(name));
    for (const [, name] of selector.matchAll(CLASS)) {
      const plain = unescapeIdent(name);
      if (/^(group|peer)(\/[\w-]+)?$/.test(plain)) out.add(plain);
    }
  }
  return [...out].sort();
}

/**
 * The class selectors of a compiled sheet not under `prefix` — Tailwind writes a prefixed one as
 * `.mp\:flex`; what sits inside parentheses is dropped first (see classNamesOf). Empty for a sheet
 * prefixedInput compiled, unless the author's sheet holds a hand-written class rule, which no
 * prefix reaches.
 */
export function unprefixedClasses(css, prefix) {
  const out = new Set();
  for (const selector of selectorsOf(css)) {
    for (const [, name] of outsideParens(selector).matchAll(CLASS)) {
      if (!unescapeIdent(name).startsWith(`${prefix}:`)) out.add(unescapeIdent(name));
    }
  }
  return [...out];
}

const THEME_IMPORT = /@import\s+["']tailwindcss(?:\/theme(?:\.css)?)?["'][^;]*/;

/**
 * The author's sheet rewritten for the prefixed compile (`{ input }`), or why it cannot be
 * (`{ problem }`):
 * `prefix(<prefix>)` on its Tailwind theme import, its `@source` lines replaced by the prefixed
 * names inline — the sources were read by the first compile, and under a prefix Tailwind would
 * ignore their unprefixed tokens anyway.
 */
export function prefixedInput(css, prefix, names) {
  const theme = THEME_IMPORT.exec(css);
  if (theme === null)
    return {
      problem:
        'it imports no Tailwind theme — write `@import "tailwindcss/theme.css" layer(theme) reference;`',
    };
  if (/\bprefix\(/.test(theme[0]))
    return {
      problem:
        "its Tailwind theme import names a prefix — the build names it from the package name; drop `prefix(…)` and write plain classes",
    };
  const withPrefix =
    css.slice(0, theme.index + theme[0].length) +
    ` prefix(${prefix})` +
    css.slice(theme.index + theme[0].length);
  const inline = names
    .map((n) => `${prefix}:${n}`)
    .join(" ")
    .replace(/[\\"]/g, "\\$&");
  return { input: `${withPrefix.replace(/@source\s+[^;]*;/g, "")}\n@source inline("${inline}");\n` };
}

/** The JSX runtime wrapper's source: the host's runtime, with the names prefixed in class props. */
export function classRuntimeSource(prefix, names) {
  return `import { jsx as hostJsx, jsxs as hostJsxs, Fragment } from ${JSON.stringify(JSX_RUNTIME)};
const PREFIX = ${JSON.stringify(`${prefix}:`)};
const NAMES = new Set(${JSON.stringify(names)});
const CLASS_PROP = /^className$|ClassName$/;
const seen = new Map();
function prefixed(value) {
  let out = seen.get(value);
  if (out === undefined) {
    out = value.split(/(\\s+)/).map((t) => (NAMES.has(t) ? PREFIX + t : t)).join("");
    // Bounded: a class string computed per render must not grow the cache without end.
    if (seen.size < 2000) seen.set(value, out);
  }
  return out;
}
function props(p) {
  let out = p;
  for (const key in p) {
    if (typeof p[key] === "string" && CLASS_PROP.test(key)) {
      if (out === p) out = { ...p };
      out[key] = prefixed(p[key]);
    }
  }
  return out;
}
export function jsx(type, p, key) { return hostJsx(type, props(p), key); }
export function jsxs(type, p, key) { return hostJsxs(type, props(p), key); }
export { Fragment };
`;
}

/**
 * The esbuild plugin that routes the web modules' JSX runtime through classRuntimeSource. Its
 * own import of the runtime falls through to the next plugin (lib/web-shared.mjs's, the host's
 * instance).
 */
export function classRuntimePlugin(prefix, names) {
  return {
    name: "penguin-plugin-classes",
    setup(build) {
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, (args) =>
        args.namespace === WRAPPER_NS ? undefined : { path: JSX_RUNTIME, namespace: WRAPPER_NS },
      );
      build.onLoad({ filter: /.*/, namespace: WRAPPER_NS }, () => ({
        contents: classRuntimeSource(prefix, names),
        resolveDir: process.cwd(),
        loader: "js",
      }));
    },
  };
}
