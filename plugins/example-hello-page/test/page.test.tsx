/**
 * The plugin page (src/hello-page.tsx, src/module.ts): drawn in the app's page frame, in the
 * language the app's `Language` interface answers, and loaded lazily by the module.
 */
import { createElement, Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerenderToNodeStream } from "react-dom/static";
import { describe, expect, it } from "vitest";
import { HelloPage } from "../src/hello-page";
import { ExampleHelloPage } from "../src/module";

const language = (locale: "zh" | "en") => ({ current: () => locale });

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
  it("binds a lazy page that draws with the language it was handed", async () => {
    const mod = new ExampleHelloPage();
    mod.language = language("en");
    mod.setup();
    // A React.lazy component: nothing loaded until it is first drawn.
    expect((mod.page as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.lazy"));
    const { prelude } = await prerenderToNodeStream(
      createElement(Suspense, { fallback: "loading" }, createElement(mod.page)),
    );
    let html = "";
    for await (const chunk of prelude) html += String(chunk);
    expect(html).toContain("Current language: English");
  });
});
