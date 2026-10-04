/**
 * The unified pipeline every Markdown surface renders through.
 *
 * Shared so the five renderers cannot drift: a bare URL has to end at the same place, and a formula
 * has to render the same way, in a chat message, a Trace event, a benchmark case and a workspace
 * file preview. The lists are module constants rather than array literals at the call sites because
 * a fresh array is a new prop identity, and react-markdown rebuilds its whole processor when the
 * plugin list changes — per commit, on a path that already had to be memoized to stop an O(n²)
 * re-parse of the transcript while a reply streams.
 *
 * ## Math
 *
 * Three delimiter pairs are accepted, which is what it takes to cover what models actually emit:
 * `$$…$$` and `\[…\]` render as display math, `\(…\)` as inline. `remark-math` brings the dollar
 * form, `remarkMathBrackets` the TeX bracket forms (see its module comment for why those cannot be
 * a text-node rewrite), and `remarkMathDollars` makes a `$$…$$` pair display wherever it is written
 * rather than only when it stands alone on its own lines.
 *
 * **Single-dollar inline math is off.** It is the one delimiter whose cost is paid by text that was
 * never meant to be math, and in this product that text is everywhere: `$PATH`, `$HOME`, prices.
 * `remark-math` rejects a span that starts or ends with whitespace, which saves a lone `$5`, but
 * two dollars in a sentence are enough and agent transcripts are full of pairs. Measured against
 * this repo's own idiom, with single-dollar math enabled:
 *
 *     Set $PATH and $HOME before running.  ->  Set <math>PATH and </math>HOME before running.
 *     It costs $5 and $10 in total.        ->  It costs <math>5 and </math>10 in total.
 *     The range is $5-$10 per seat.        ->  The range is <math>5-</math>10 per seat.
 *     echo $PATH; echo $HOME               ->  echo <math>PATH; echo </math>HOME
 *     Prices: $1,200 and $3,400.           ->  Prices: <math>1,200 and </math>3,400.
 *
 * Each of those loses its dollar signs, its spacing and its meaning. The failure in the other
 * direction is that someone writing `$x^2$` sees `$x^2$` — the source, legible, and re-typable as
 * `\(x^2\)`. Corrupting prose that was already correct is the worse trade, so the dollar pair is
 * reserved for `$$…$$`, which no shell variable or price produces by accident.
 *
 * ## KaTeX loads with the first formula
 *
 * KaTeX and its stylesheet are a quarter of a megabyte that most conversations never use, so the
 * rehype stage that typesets math (math-stage.ts) is not imported here: `useRehypePlugins` loads it
 * the first time a text that may hold a formula is rendered, once for the whole page, and until it
 * has arrived the formula shows its own TeX source — the same markup a streaming reply shows (see
 * NO_REHYPE_PLUGINS), so the upgrade changes the formula and nothing around it. A failed load
 * leaves the source in place and is asked again by the next text that needs it.
 */
import { useEffect, useSyncExternalStore } from "react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Options } from "react-markdown";
import { remarkAutolinkBoundary } from "./remark-autolink-boundary";
import { remarkMathBrackets } from "./remark-math-brackets";
import { remarkMathDollars } from "./remark-math-dollars";

/** react-markdown's own plugin-list type, taken from its props so `unified` need not be a dep. */
type PluginList = NonNullable<Options["remarkPlugins"]>;

/** The remark (Markdown -> mdast) stage. */
export const REMARK_PLUGINS: PluginList = [
  remarkGfm,
  remarkAutolinkBoundary,
  [remarkMath, { singleDollarTextMath: false }],
  remarkMathBrackets,
  remarkMathDollars,
];

/**
 * The rehype stage for a message that is still streaming: nothing, so the remark stage's own
 * `math-*` elements reach the DOM carrying the TeX source, and the formula is typeset once on the
 * settle render.
 *
 * KaTeX itself is cheap — ~0.3ms for a typical formula. What is not cheap is the rest of the stage
 * around it: `rehype-katex` re-parses KaTeX's ~2.5KB of markup per formula back into hast, and
 * React then builds several hundred elements from it. Measured through this pipeline with
 * `renderToStaticMarkup` on a 3.6KB reply carrying 60 formulas: 16ms for gfm alone, 13ms with the
 * math parsed but not rendered, 284ms for the full stage. Streamed in 40 deltas — chat bodies
 * re-parse on every delta, ~8 times a second — that is 196ms of total work without the rehype
 * stage and 2352ms with it, and it grows with the square of the reply's length. One oversized
 * formula shows the same shape on its own: a 16KB formula is 885ms per render, and a 20KB
 * paragraph accidentally wrapped by an unmatched `\[ … \]` is 856ms.
 *
 * Memoizing the produced hast per formula was measured too and is not enough: it cannot help the
 * formula that is still growing, which is the one being re-rendered, and it left 1853ms of the
 * 2352ms in place. This is the same trade as `highlight={!streaming}` for code blocks — the settle
 * render re-parses the message anyway, so it is where the expensive stage belongs.
 */
export const NO_REHYPE_PLUGINS: RehypeList = [];

/** react-markdown's rehype plugin-list type. */
type RehypeList = NonNullable<Options["rehypePlugins"]>;

/** The typesetting stage once loaded; null until then. */
let mathStage: RehypeList | null = null;
let mathLoad: Promise<RehypeList> | null = null;
const mathListeners = new Set<() => void>();

/** Loads the typesetting stage (KaTeX and its stylesheet) once per page; a failed load is forgotten. */
export function loadMathStage(): Promise<RehypeList> {
  mathLoad ??= import("./math-stage").then(
    (module) => {
      mathStage = module.MATH_REHYPE_PLUGINS;
      for (const listener of mathListeners) listener();
      return mathStage;
    },
    (error: unknown) => {
      mathLoad = null;
      throw error;
    },
  );
  return mathLoad;
}

/**
 * Whether a text may hold a formula: one of the three delimiters is in it. A superset of what the
 * remark stage reads as math (a `\(` inside a code span counts here), which costs at most loading
 * the stage for nothing; it never misses one.
 */
export function mayHoldMath(text: string): boolean {
  return /\$\$|\\[[(]/.test(text);
}

const subscribeMath = (listener: () => void) => {
  mathListeners.add(listener);
  return () => mathListeners.delete(listener);
};
const currentMath = () => mathStage;
// A text without a formula does not listen at all: the stage's arrival re-renders only the texts
// that wait for it, not every message of a long transcript.
const subscribeNothing = () => () => {};
const noStage = () => null;

/**
 * The rehype stage for a Markdown text: the typesetting stage once the text settles, if it may
 * hold a formula and the stage has loaded; nothing otherwise. A text that may hold one starts the
 * load as soon as it is seen — while it still streams too, so the settle usually finds it there —
 * and re-renders when it arrives. The returned lists are module constants, so react-markdown
 * rebuilds its processor only on that one change.
 */
export function useRehypePlugins(text: string, streaming = false): RehypeList {
  const wanted = mayHoldMath(text);
  const stage = useSyncExternalStore(
    wanted ? subscribeMath : subscribeNothing,
    wanted ? currentMath : noStage,
    wanted ? currentMath : noStage,
  );
  useEffect(() => {
    // The source stays on screen if this fails; the next text that needs the stage asks again.
    if (wanted && stage === null) loadMathStage().catch(() => undefined);
  }, [wanted, stage]);
  return !streaming && wanted && stage !== null ? stage : NO_REHYPE_PLUGINS;
}
