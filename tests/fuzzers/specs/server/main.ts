/**
 * The API leg's calls, read from `specs/server/http.txt`.
 *
 * The description says what each route takes — its path slots, its query knobs, its body — and
 * this module only puts a call together: fill the path, add the one knob a deliberately damaged
 * request carries, build the body. Which routes exist, and which are driven, is not decided
 * here; a route that is not described is not called, and `specs/generate.ts --check` fails when
 * the text and the product disagree.
 */
import type { Choices } from "../../server/src/choices.js";
import type { Pools, Variant } from "../decode.js";
import { objectOf, stringOf, valueOf } from "../eval.js";
import { RESOURCES } from "../generated/resources.js";
import { ROUTES } from "../generated/server.js";
import type { ArgDescr, RouteDescr } from "../types.js";

export interface HttpSpec {
  id: string;
  method: string;
  /** The template with `:param` slots, as the route declares it. */
  path: string;
  /** Query-string knobs this route reads, each with its declared type. */
  queryArgs: readonly ArgDescr[];
  /** The request path, each `:param` filled by its own type. */
  url(variant: Variant, choices: Choices, text: string, pools: Pools): string;
  /** The request body, field by field, when the contract declares one. */
  body?: (
    variant: Variant,
    choices: Choices,
    text: string,
    pools: Pools,
  ) => Record<string, unknown>;
}

/** The resource names a response can hand the next call (`captureIds` keys on these). */
export function resources(): ReadonlySet<string> {
  return RESOURCES;
}

/**
 * Fill the path. A slot's value comes from its declared type — an `id` from the pool the run
 * has collected, an `int32` inside its range — so a mutation that changes which value is drawn
 * changes exactly one segment.
 */
function renderPath(
  route: RouteDescr,
  variant: Variant,
  choices: Choices,
  text: string,
  pools: Pools,
): string {
  return route.path
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) return segment;
      // `/handbook/files/:path{.+}` — the braced part is Hono's own pattern for the slot.
      const name = segment.slice(1).replace(/\{[^}]*\}$/, "");
      const arg = route.pathArgs.find((candidate) => candidate.name === name);
      if (arg === undefined) return segment;
      return encodeURIComponent(stringOf(valueOf(arg.t, variant, choices, text, pools)));
    })
    .join("/");
}

/**
 * `?limit=abc` — the query string a deliberately damaged call carries: one knob, with a value
 * its declared type forbids. Empty for every other variant.
 *
 * The ok path is covered by the setup's query sweep instead (see `server/src/fuzz.ts`): drawn per
 * call, an ok value spends the call on a guess at a domain the decoder cannot know, and a refusal
 * costs the deep path the bare request would have taken. A hostile value carries no such cost:
 * the call is already meant to be refused, and the parse failure is the branch with the bugs in
 * it.
 */
function hostileQuery(
  route: RouteDescr,
  variant: Variant,
  choices: Choices,
  text: string,
  pools: Pools,
): string {
  if (variant !== "bad" || route.queryArgs.length === 0) return "";
  const arg = choices.pick(route.queryArgs);
  const value = stringOf(valueOf(arg.t, "bad", choices, text, pools));
  return value === "" ? "" : `?${encodeURIComponent(arg.name)}=${encodeURIComponent(value)}`;
}

export function httpSpecs(): HttpSpec[] {
  return ROUTES.map((route): HttpSpec => ({
    id: route.id,
    method: route.method,
    path: route.path,
    queryArgs: route.queryArgs,
    url: (variant, choices, text, pools) =>
      `${renderPath(route, variant, choices, text, pools)}${hostileQuery(route, variant, choices, text, pools)}`,
    // No declared body → no structured body. The raw-body flag still sends the payload as the
    // body, which is how a body-parsing failure is reached on any route.
    ...(route.body === null
      ? {}
      : {
          body: (variant, choices, text, pools) =>
            objectOf(route.body ?? [], variant, choices, text, pools),
        }),
  })).sort((a, b) => a.id.localeCompare(b.id));
}
