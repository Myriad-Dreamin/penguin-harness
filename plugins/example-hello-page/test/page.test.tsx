/**
 * The plugin page (src/hello-page.tsx, src/index.ts): drawn in the app's page frame, in the
 * language the app's `Language` interface answers; the module binds a loader of it, which hands
 * the page the store it `@Use`s and leaves when it loads to the app.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HelloPage } from "../src/hello-page";
import { ExampleHelloPage } from "../src/index";

/** A `Language` that never changes: what a static render reads. */
const language = (locale: "zh" | "en") => ({ get: () => locale, subscribe: () => () => {} });

describe("HelloPage", () => {
  it("draws the page's one title, its paragraph and three cards in Chinese", () => {
    const html = renderToStaticMarkup(createElement(HelloPage, { language: language("zh") }));
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("插件页面");
    expect(html).toContain("当前语言：中文");
    expect(html.match(/<li /g)).toHaveLength(3);
    // The plugin's own utilities only, besides what the app's components bring.
    expect(html).toContain('class="hp:flex hp:flex-col hp:gap-5"');
  });

  it("and in English, by what the interface answers", () => {
    const html = renderToStaticMarkup(createElement(HelloPage, { language: language("en") }));
    expect(html).toContain("Plugin page");
    expect(html).toContain("Current language: English");
    expect(html).not.toContain("插件页面");
  });
});

describe("ExampleHelloPage", () => {
  it("binds a loader of the page, which draws with the language the module was handed", async () => {
    const mod = new ExampleHelloPage();
    // Wired after construction, as the kernel does: the loader reads it when it runs.
    mod.language = language("en");
    const Page = await mod.page.load();
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("Current language: English");
  });
});
