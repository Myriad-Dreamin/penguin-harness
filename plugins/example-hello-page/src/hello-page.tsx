/**
 * The plugin's page: the app's own page frame and header (the UI package's `PageFrame` and
 * `PageHeader`, shared with the app at run time), a paragraph, and three facts as cards. The cards
 * are drawn with plain Tailwind utilities over the app's theme tokens (styles.css), so they follow the theme, the mode and the accent like the app's own cards.
 *
 * Its words follow the app's `Language`, read with React's `useSyncExternalStore`: the page
 * re-renders when the person switches the language, with nothing of its own to keep in step.
 */
import { useSyncExternalStore } from "react";
import { GlyphIcon, ICONS, ICON_SIZE, PageFrame, PageHeader } from "@prismshadow/penguin-ui";
import type { Language } from "@prismshadow/penguin-web/plugin-types";
import { stringsFor } from "./strings";

export function HelloPage({ language }: { language: Language }) {
  // The third argument is the snapshot for server rendering, which the tests use.
  const locale = useSyncExternalStore(language.subscribe, language.get, language.get);
  const S = stringsFor(locale);
  return (
    <PageFrame width="sm">
      <PageHeader title={S.title} description={S.description} />
      <div data-example-hello className="flex flex-col gap-5">
        <p className="max-w-prose text-sm leading-relaxed text-fg">{S.intro}</p>
        <ul className="grid gap-3 sm:grid-cols-3">
          {S.facts.map((fact) => (
            <li
              key={fact.icon}
              className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-accent-muted text-accent">
                <GlyphIcon d={ICONS[fact.icon]} size={ICON_SIZE.iconButton} />
              </span>
              <h2 className="text-sm font-medium text-fg-emphasis">{fact.title}</h2>
              <p className="text-xs leading-relaxed text-fg-muted">{fact.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </PageFrame>
  );
}
