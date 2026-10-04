/**
 * The plugin's page: the app's own page frame and header (the UI package's `PageFrame` and
 * `PageHeader`, shared with the app at run time), a paragraph, and three facts as cards. The cards
 * are drawn with the app's theme tokens through the plugin's own prefixed utilities (styles.css),
 * so they follow the theme, the mode and the accent like the app's own cards.
 */
import { GlyphIcon, ICONS, ICON_SIZE, PageFrame, PageHeader } from "@prismshadow/penguin-ui";
import type { Language } from "@prismshadow/penguin-web/plugin-types";
import { stringsFor } from "./strings";

export function HelloPage({ language }: { language: Language }) {
  const S = stringsFor(language.current());
  return (
    <PageFrame width="sm">
      <PageHeader title={S.title} description={S.description} />
      <div data-example-hello className="hp:flex hp:flex-col hp:gap-5">
        <p className="hp:max-w-prose hp:text-sm hp:leading-relaxed hp:text-fg">{S.intro}</p>
        <ul className="hp:grid hp:gap-3 hp:sm:grid-cols-3">
          {S.facts.map((fact) => (
            <li
              key={fact.icon}
              className="hp:flex hp:flex-col hp:gap-2 hp:rounded-xl hp:border hp:border-line hp:bg-surface hp:p-4"
            >
              <span className="hp:flex hp:size-8 hp:items-center hp:justify-center hp:rounded-full hp:bg-accent-muted hp:text-accent">
                <GlyphIcon d={ICONS[fact.icon]} size={ICON_SIZE.iconButton} />
              </span>
              <h2 className="hp:text-sm hp:font-medium hp:text-fg-emphasis">{fact.title}</h2>
              <p className="hp:text-xs hp:leading-relaxed hp:text-fg-muted">{fact.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </PageFrame>
  );
}
