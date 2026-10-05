/**
 * A plugin stylesheet's class prefix (scripts/lib/plugin-classes.mjs): the build names it, the
 * author never does.
 *
 * - The prefix is derived from the package name: lower-case letters only, the same for one name,
 *   different for two names whose letters agree.
 * - The names Tailwind compiled are read back from the plain sheet — escapes resolved, the
 *   `group` marker kept, the host's `.dark` a variant names left out.
 * - The prefixed compile gets `prefix()` on the theme import and the prefixed names as its only
 *   sources; an author's sheet that names a prefix, or imports no theme, is refused.
 * - A compiled class outside the prefix is found (a hand-written rule no prefix reaches).
 * - The JSX runtime wrapper prefixes exactly those names in `className` and `…ClassName` props,
 *   leaving other tokens, other props and the caller's object as they were.
 */
import { describe, expect, it } from "vitest";
import {
  classNamesOf,
  classPrefixOf,
  classRuntimeSource,
  prefixedInput,
  unprefixedClasses,
} from "../../../scripts/lib/plugin-classes.mjs";

describe("the web stylesheet's class prefix", () => {
  it("is derived from the package name, letters only, distinct for look-alike names", () => {
    const music = classPrefixOf("@penguinharness/example-music");
    expect(music).toMatch(/^examplemusic[a-z]{4}$/);
    expect(classPrefixOf("@penguinharness/example-music")).toBe(music);
    expect(classPrefixOf("@a/foo-bar")).not.toBe(classPrefixOf("@b/foobar"));
    expect(classPrefixOf("@a/0-9")).toMatch(/^[a-z]{4}$/);
  });

  it("reads the compiled names back, with the group markers and without the host's classes", () => {
    const css =
      "@layer utilities{.flex{display:flex}.p-1\\.5{padding:.375rem}" +
      ".dark\\:text-red:where(.dark,.dark *){color:red}" +
      ".-translate-x-1\\/2{--tw-translate-x:-50%}" +
      ".has-\\[\\:focus-visible\\]\\:\\[outline\\:var\\(--ui-focus-ring\\)\\]:has(:focus-visible){outline:var(--ui-focus-ring)}" +
      "@media (hover:hover){.group-hover\\:x:is(:where(.group):hover *){opacity:.9}}}" +
      '@property --tw-translate-x{syntax:"*";inherits:false;initial-value:0}';
    expect(classNamesOf(css)).toEqual([
      "-translate-x-1/2",
      "dark:text-red",
      "flex",
      "group",
      "group-hover:x",
      "has-[:focus-visible]:[outline:var(--ui-focus-ring)]",
      "p-1.5",
    ]);
  });

  it("finds compiled classes outside the prefix, not the host classes a variant names", () => {
    const css =
      ".mp\\:flex{display:flex}.mp\\:p-1\\.5{padding:.375rem}" +
      ".mp\\:dark\\:text-red:where(.dark,.dark *){color:red}" +
      "@media (hover:hover){.mp\\:hover\\:x:hover{opacity:.9}}";
    expect(unprefixedClasses(css, "mp")).toEqual([]);
    expect(unprefixedClasses(`${css}.hidden{display:none}.mpx{color:red}`, "mp")).toEqual([
      "hidden",
      "mpx",
    ]);
  });

  it("is named on the theme import by the build, never by the author", () => {
    const author =
      '@import "tailwindcss/theme.css" layer(theme) reference;\n' +
      '@import "tailwindcss/utilities.css" layer(utilities);\n@source "./";\n';
    const { input } = prefixedInput(author, "mp", ["flex", 'content-["x"]']);
    expect(input).toContain('@import "tailwindcss/theme.css" layer(theme) reference prefix(mp);');
    expect(input).toContain('@import "tailwindcss/utilities.css" layer(utilities);');
    expect(input).not.toContain('@source "./"');
    expect(input).toContain('@source inline("mp:flex mp:content-[\\"x\\"]");');
    expect(
      prefixedInput(author.replace("reference;", "reference prefix(mp);"), "mp", []),
    ).toHaveProperty("problem");
    expect(prefixedInput('@import "tailwindcss/utilities.css";', "mp", [])).toHaveProperty(
      "problem",
    );
  });

  it("is put on exactly the compiled names in every class prop the plugin's JSX passes", () => {
    const calls: Array<[unknown, Record<string, unknown>]> = [];
    const hostJsx = (type: unknown, props: Record<string, unknown>) => {
      calls.push([type, props]);
      return null;
    };
    const body = classRuntimeSource("mp", ["flex", "hover:opacity-90", "group"])
      .replace(/^import .*$/m, "const { jsx: hostJsx, jsxs: hostJsxs, Fragment } = rt;")
      .replace(/^export \{ Fragment \};$/m, "")
      .replace(/^export /gm, "");
    const runtime = new Function("rt", `${body}\nreturn { jsx, jsxs };`)({
      jsx: hostJsx,
      jsxs: hostJsx,
      Fragment: "F",
    }) as Record<"jsx" | "jsxs", (t: unknown, p: Record<string, unknown>) => unknown>;
    const props = { className: " flex  hover:opacity-90 player-root", type: "flex", n: 1 };
    runtime.jsx("div", props);
    runtime.jsxs("Panel", { contentClassName: "group flex", className: undefined });
    expect(calls).toEqual([
      ["div", { className: " mp:flex  mp:hover:opacity-90 player-root", type: "flex", n: 1 }],
      ["Panel", { contentClassName: "mp:group mp:flex", className: undefined }],
    ]);
    // The caller's props object is left as it was, and a prop without a class is passed as is.
    expect(props.className).toBe(" flex  hover:opacity-90 player-root");
    const plain = { title: "flex" };
    runtime.jsx("span", plain);
    expect(calls[2]![1]).toBe(plain);
  });
});
