/**
 * The page's words, in the two languages the web app ships. The page reads the app's interface
 * language through the `Language` interface (index.ts), so it follows a language switch with the
 * rest of the app.
 */

const zh = {
  title: "插件页面",
  description: "由示例插件 example-hello-page 提供。",
  intro:
    "这一页和应用自己的页面没有区别：它的路由和评估中心下的导航行由插件的模块声明，页面组件在你第一次打开它时才加载，文字跟随界面语言，颜色跟随主题。",
  /** The facts below the paragraph: a heading and one line each. */
  facts: [
    {
      icon: "puzzle",
      title: "只需声明",
      body: "路由和这一导航行是模块向应用页面槽位贡献的数据，不需要另写导航代码。",
    },
    {
      icon: "zap",
      title: "代码按需加载",
      body: "页面组件是一个独立的代码块，第一次打开页面时才请求。",
    },
    {
      icon: "globe",
      title: "跟随应用",
      body: "当前语言：中文。在设置中切换语言或主题，这一页随之改变。",
    },
  ] as ReadonlyArray<{ icon: "puzzle" | "zap" | "globe"; title: string; body: string }>,
};

export type HelloStrings = typeof zh;

const en: HelloStrings = {
  title: "Plugin page",
  description: "Provided by the example-hello-page plugin.",
  intro:
    "This page is like any of the app's own: its route and its row under the Evaluation Center are declared by the plugin's module, its component loads the first time you open it, its words follow the interface language and its colours the theme.",
  facts: [
    {
      icon: "puzzle",
      title: "Declared, not coded",
      body: "The route and this nav row are data the module contributes to the app's page slot, with no navigation code of its own.",
    },
    {
      icon: "zap",
      title: "Code on demand",
      body: "The page component is a chunk of its own, fetched the first time the page is opened.",
    },
    {
      icon: "globe",
      title: "Follows the app",
      body: "Current language: English. Switch the language or the theme in Settings and this page follows.",
    },
  ],
};

export function stringsFor(locale: string): HelloStrings {
  return locale === "zh" ? zh : en;
}
