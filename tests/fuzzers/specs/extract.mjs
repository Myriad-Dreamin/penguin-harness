#!/usr/bin/env node
/**
 * Extract penguin's own declarations into `specs/surface.json` — the metadata both fuzz legs
 * build their specs from. Nothing here is kept for the fuzzer; every entry is read off a
 * declaration the product already has:
 *
 *  - the **route table**: `@Component({ contributes: { "HttpModule.routes": [{id, prefix,
 *    auth}] } })` in each `module.ts`, joined through `@Bind(<id>)` with the factory it is
 *    filled from, then each `app.<method>("…")` call in that factory — the platform's own
 *    mount table, so a route that is served is a route that is here;
 *  - the **client endpoints**: `packages/web/src/api/endpoints.ts`, one typed wrapper per API,
 *    whose `apiFetch` call carries the method, the path template and the body's DTO name;
 *  - the **DTOs**: `packages/server/src/api/types.ts`, so a body is fuzzed field by field with
 *    the name and type the handler validates.
 *
 * The CLI leg reads no file from here: its specs come from the commander tree the CLI builds
 * (see `specs/cli/main.ts`), which is the same declaration commander parses argv with.
 *
 * Run: node tests/fuzzers/specs/extract.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const typesFile = path.join(repo, "packages/server/src/api/types.ts");
const endpointsFile = path.join(repo, "packages/web/src/api/endpoints.ts");
const outFile = path.join(here, "surface.json");

/**
 * How deep a body is followed, counted in the JSON it produces: the body's own fields are
 * level 1, an object field's members level 2, and so on. Past this, a scalar keeps the
 * request well-formed enough for the handler to reach its own validation.
 */
const MAX_DEPTH = 3;

/** The declarations a shape can be resolved against, by name (interfaces and type aliases). */
function declarationsOf(source) {
  const declarations = new Map();
  for (const statement of source.statements) {
    if (ts.isInterfaceDeclaration(statement)) {
      declarations.set(statement.name.text, { members: statement.members });
      continue;
    }
    if (ts.isTypeAliasDeclaration(statement)) {
      declarations.set(statement.name.text, { type: statement.type });
    }
  }
  return declarations;
}

/**
 * The fuzzable shape of one value at nesting `level`, or null when the declaration says
 * nothing a generator can use (a type from another package, a function, a mapped type).
 *
 * `seen` breaks cycles (`interface Node { parent?: Node }`), so a body schema is always a
 * finite tree; resolving a named type does not consume a level, because an alias occupies no
 * nesting of its own.
 */
function shapeOf(node, context, level, seen) {
  const { source, declarations } = context;
  if (level > MAX_DEPTH) return null;

  if (ts.isUnionTypeNode(node)) {
    const members = node.types;
    const literals = members.map((member) =>
      ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal) ? member.literal.text : null,
    );
    if (literals.every((value) => value !== null)) return { kind: "enum", values: literals };
    const variants = [];
    for (const member of members) {
      const shape = shapeOf(member, context, level, seen);
      if (shape === null || shape.fields === undefined) return null;
      variants.push(shape.fields);
    }
    return { kind: "object", variants };
  }
  if (ts.isArrayTypeNode(node)) {
    const element = shapeOf(node.elementType, context, level + 1, seen);
    return element !== null && element.kind === "object" ? { ...element, kind: "array" } : { kind: "array" };
  }
  if (ts.isTypeLiteralNode(node)) {
    const fields = objectOfMembers(node, context, level + 1, seen);
    return fields === null ? null : { kind: "object", fields };
  }
  if (ts.isParenthesizedTypeNode(node)) return shapeOf(node.type, context, level, seen);
  if (node.kind === ts.SyntaxKind.StringKeyword) return { kind: "string" };
  if (node.kind === ts.SyntaxKind.NumberKeyword) return { kind: "number" };
  if (node.kind === ts.SyntaxKind.BooleanKeyword) return { kind: "boolean" };
  if (ts.isLiteralTypeNode(node)) {
    if (ts.isStringLiteral(node.literal)) return { kind: "enum", values: [node.literal.text] };
    if (ts.isNumericLiteral(node.literal)) return { kind: "number" };
    return { kind: "boolean" };
  }
  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName.getText(source).replace(/^.*\./, "");
    const argument = node.typeArguments?.[0];
    if (/(Readonly)?Array$/.test(name) && argument !== undefined) {
      const element = shapeOf(argument, context, level + 1, seen);
      return element !== null && element.kind === "object"
        ? { ...element, kind: "array" }
        : { kind: "array" };
    }
    const declaration = declarations.get(name);
    if (declaration === undefined || seen.has(name)) return null;
    seen.add(name);
    const shape =
      declaration.members !== undefined
        ? namedShapeOf(declaration, context, level, seen)
        : shapeOf(declaration.type, context, level, seen);
    seen.delete(name);
    return shape;
  }
  return null;
}

/** An interface's own shape, its members one level below the value it describes. */
function namedShapeOf(declaration, context, level, seen) {
  const fields = objectOfMembers(declaration, context, level + 1, seen);
  return fields === null ? null : { kind: "object", fields };
}

function objectOfMembers(declaration, context, level, seen) {
  const fields = [];
  for (const member of declaration.members) {
    if (!ts.isPropertySignature(member) || member.name === undefined) continue;
    const name = member.name.getText(context.source).replace(/^['"]|['"]$/g, "");
    const shape = member.type === undefined ? null : shapeOf(member.type, context, level, seen);
    fields.push({
      name,
      ...(shape ?? { kind: "string" }),
      ...(member.questionToken === undefined ? {} : { optional: true }),
    });
  }
  return fields.length === 0 ? null : fields;
}

function parseTypes() {
  const source = ts.createSourceFile(
    typesFile,
    fs.readFileSync(typesFile, "utf8"),
    ts.ScriptTarget.ES2022,
    true,
  );
  const declarations = declarationsOf(source);
  const context = { source, declarations };
  const fieldsOf = (name) => {
    const declaration = declarations.get(name);
    if (declaration === undefined) return null;
    const seen = new Set([name]);
    const shape =
      declaration.members !== undefined
        ? namedShapeOf(declaration, context, 0, seen)
        : shapeOf(declaration.type, context, 1, seen);
    return shape?.fields ?? null;
  };
  return { fieldsOf, count: declarations.size };
}

/**
 * `/api/x/${encodeURIComponent(id)}/y` → `{ path: "/api/x/:id/y", params: ["id"] }`.
 *
 * A template this file cannot read as a path is `null`: a computed base
 * (`${workspaceDirBase(dir)}/content`) has no prefix here, and a query string
 * (`?path=${…}`) is not part of the route. The route table still carries those paths; this
 * pass only adds body shapes, so dropping one costs a body, never a route.
 */
function pathOf(node, source) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { path: node.text, params: [] };
  }
  if (!ts.isTemplateExpression(node)) return null;
  let text = node.head.text;
  if (!text.startsWith("/")) return null;
  const params = [];
  for (const span of node.templateSpans) {
    const expression = span.expression;
    let slot = null;
    if (ts.isIdentifier(expression)) {
      slot = expression.getText(source);
    } else if (
      ts.isCallExpression(expression) &&
      expression.expression.getText(source) === "encodeURIComponent" &&
      expression.arguments.length === 1
    ) {
      const argument = expression.arguments[0];
      if (ts.isIdentifier(argument)) slot = argument.getText(source);
    }
    // A non-slot interpolation ends the path: a query string, or a suffix built elsewhere.
    if (slot === null) return { path: text, params };
    if (!text.endsWith("/")) return { path: text, params };
    params.push(slot);
    text += `:${slot}${span.literal.text}`;
  }
  return { path: text, params };
}

function parseEndpoints(types) {
  const source = ts.createSourceFile(
    endpointsFile,
    fs.readFileSync(endpointsFile, "utf8"),
    ts.ScriptTarget.ES2022,
    true,
  );
  const out = [];
  const visit = (node) => {
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true
    ) {
      for (const declaration of node.declarationList.declarations) {
        const init = declaration.initializer;
        if (init === undefined || !ts.isArrowFunction(init)) continue;
        let call = null;
        const walkCall = (child) => {
          if (ts.isCallExpression(child) && child.expression.getText(source) === "apiFetch") {
            call = child;
            return;
          }
          ts.forEachChild(child, walkCall);
        };
        walkCall(init.body);
        if (call === null || call.arguments.length === 0) continue;
        const where = pathOf(call.arguments[0], source);
        if (where === null || !where.path.startsWith("/")) continue;
        const options = call.arguments[1];
        let method = "GET";
        let bodyType = null;
        if (options !== undefined && ts.isObjectLiteralExpression(options)) {
          for (const property of options.properties) {
            if (ts.isShorthandPropertyAssignment(property)) {
              // `{ method: "POST", body }` — the wrapper's own parameter carries the DTO.
              if (property.name.getText(source) !== "body") continue;
              for (const parameter of init.parameters) {
                if (parameter.name.getText(source) !== "body" || parameter.type === undefined) {
                  continue;
                }
                bodyType = parameter.type.getText(source).replace(/\s+/g, " ");
              }
              continue;
            }
            if (!ts.isPropertyAssignment(property)) continue;
            const key = property.name.getText(source);
            if (key === "method" && ts.isStringLiteral(property.initializer)) {
              method = property.initializer.text;
            }
            if (key === "body") {
              const value = property.initializer;
              if (ts.isIdentifier(value)) {
                for (const parameter of init.parameters) {
                  const name = parameter.name.getText(source);
                  if (name !== value.text || parameter.type === undefined) continue;
                  bodyType = parameter.type.getText(source).replace(/\s+/g, " ");
                }
              } else {
                bodyType = value.getText(source);
              }
            }
          }
        }
        out.push({
          fn: declaration.name.getText(source),
          method,
          ...where,
          bodyType,
          fields: bodyType === null ? [] : (types.fieldsOf(bodyType) ?? []),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const types = parseTypes();
const endpoints = parseEndpoints(types);

/**
 * The HTTP surface, from the platform's own route metadata:
 *
 *   @Component({ contributes: { "HttpModule.routes": [{ id, prefix, auth, order }] } })
 *   class X { @Bind("<id>") routes!: Hono; setup() { this.routes = <factory>(deps) } }
 *   <factory> file: app.get("/path", …), app.post(…), …
 *
 * The same declarations the platform mounts routes from, so a route cannot exist without
 * appearing here. `HttpModule.routes` is the only contribution key read.
 */
function parseRoutes() {
  const root = path.join(repo, "packages/server/src");
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) files.push(full);
    }
  };
  walk(root);

  /**
   * Registrations whose path is computed rather than written out — a factory that takes a
   * `base` and registers `base + "/move"` (workspace-files.ts does exactly this for the two
   * ways a caller names a directory). A literal scan cannot see those paths; they are counted
   * and reported so the gap is visible, and the client's endpoint table (below) is the second
   * source that carries the ones the web client calls.
   */
  const computed = [];

  const sourceOf = (file) =>
    ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);

  /** `{id, prefix, auth}` entries of the HttpModule.routes contribution in this file. */
  function contributionsOf(source) {
    const groups = [];
    const visit = (node) => {
      if (ts.isDecorator(node)) {
        const call = node.expression;
        if (ts.isCallExpression(call) && call.arguments.length === 1) {
          const argument = call.arguments[0];
          if (ts.isObjectLiteralExpression(argument)) {
            for (const property of argument.properties) {
              if (!ts.isPropertyAssignment(property)) continue;
              if (property.name.getText(source).replace(/['"]/g, "") !== "contributes") continue;
              if (!ts.isObjectLiteralExpression(property.initializer)) continue;
              for (const inner of property.initializer.properties) {
                if (!ts.isPropertyAssignment(inner)) continue;
                if (inner.name.getText(source).replace(/['"]/g, "") !== "HttpModule.routes") {
                  continue;
                }
                if (!ts.isArrayLiteralExpression(inner.initializer)) continue;
                for (const item of inner.initializer.elements) {
                  if (!ts.isObjectLiteralExpression(item)) continue;
                  const fields = {};
                  for (const field of item.properties) {
                    if (!ts.isPropertyAssignment(field)) continue;
                    const key = field.name.getText(source).replace(/['"]/g, "");
                    if (ts.isStringLiteral(field.initializer)) {
                      fields[key] = field.initializer.text;
                    }
                  }
                  if (typeof fields.id === "string" && typeof fields.prefix === "string") {
                    groups.push({ id: fields.id, prefix: fields.prefix, auth: fields.auth ?? "user" });
                  }
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return groups;
  }

  /** `@Bind("<id>") prop` → prop, and `this.prop = <callee>(…)` → callee name. */
  function boundFactory(source, id) {
    let property = null;
    const visitBind = (node) => {
      if (ts.isPropertyDeclaration(node)) {
        for (const decorator of ts.getDecorators(node) ?? []) {
          const call = decorator.expression;
          if (
            ts.isCallExpression(call) &&
            call.expression.getText(source) === "Bind" &&
            call.arguments.length === 1 &&
            ts.isStringLiteral(call.arguments[0]) &&
            call.arguments[0].text === id
          ) {
            property = node.name.getText(source);
          }
        }
      }
      ts.forEachChild(node, visitBind);
    };
    visitBind(source);
    if (property === null) return null;
    let factory = null;
    const visitAssign = (node) => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        node.left.getText(source) === `this.${property}` &&
        ts.isCallExpression(node.right)
      ) {
        factory = node.right.expression.getText(source);
      }
      ts.forEachChild(node, visitAssign);
    };
    visitAssign(source);
    return factory;
  }

  /** Local import name → resolved file (through the source file's own import specifier). */
  function importMap(source, file) {
    const map = new Map();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue;
      const specifier = statement.moduleSpecifier;
      if (!ts.isStringLiteral(specifier) || !specifier.text.startsWith(".")) continue;
      const base = path.resolve(path.dirname(file), specifier.text.replace(/\.js$/, ".ts"));
      const names = statement.importClause.namedBindings;
      if (names === undefined || !ts.isNamedImports(names)) continue;
      for (const element of names.elements) {
        map.set(element.name.text, base);
      }
    }
    return map;
  }

  /**
   * The names a file's handlers read out of the query string: `c.req.query("limit")`.
   *
   * Per file, not per handler, because a route factory routinely hands its `Context` to a
   * helper (`messagesPageQuery(c)`) and the helper is where the reads are. Attributing to the
   * nearest registration would then miss exactly the paging and filtering reads that carry the
   * most branches, so the union of the file travels with every route it registers — a route
   * that ignores one of the names pays one branch for the extra parameter and nothing else.
   *
   * Destructured reads (`const { limit } = c.req.query()`) are not named here: the names are
   * pattern keys, not strings, and the routes in this repo read them one by one.
   */
  function queryNamesOf(scope) {
    const names = new Set();
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        // `getText()` without the SourceFile: the scope handed in is a node, not a file.
        const method = node.expression.name.getText();
        const receiver = node.expression.expression.getText();
        if (method === "query" && receiver.endsWith(".req")) {
          const first = node.arguments[0];
          if (first !== undefined && ts.isStringLiteral(first)) names.add(first.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(scope);
    return [...names].sort();
  }

  /** `app.<method>("literal")` registrations in a route factory file. */
  function pathsOf(file, factory = null) {
    const source = sourceOf(file);
    const out = [];
    // A factory defined in the same file as its contribution scopes the scan: one file often
    // holds several groups (`projectsRoutes` and `membersRoutes`), and their paths must not
    // be attributed to each other's prefix.
    let scope = source;
    if (factory !== null) {
      const visitScope = (node) => {
        if (
          (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)) &&
          node.getText(source).includes(factory)
        ) {
          if (ts.isFunctionDeclaration(node) && node.name?.getText(source) === factory) scope = node;
          if (ts.isVariableStatement(node)) {
            for (const declaration of node.declarationList.declarations) {
              if (declaration.name.getText(source) === factory) scope = node;
            }
          }
        }
        ts.forEachChild(node, visitScope);
      };
      visitScope(source);
    }
    const query = queryNamesOf(scope);
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.getText(source);
        const receiver = node.expression.expression.getText(source);
        if (["get", "post", "put", "patch", "delete", "all"].includes(method) && receiver === "app") {
          const first = node.arguments[0];
          if (first !== undefined && ts.isStringLiteral(first)) {
            out.push({ method: method.toUpperCase(), path: first.text, query });
          } else if (first !== undefined) {
            const where = `${path.relative(repo, file)}:${source.getLineAndCharacterOfPosition(first.getStart(source)).line + 1}`;
            computed.push(`${where} ${method.toUpperCase()} ${first.getText(source).slice(0, 60)}`);
          }
        }
        if (method === "route" && receiver === "app") {
          const first = node.arguments[0];
          if (first !== undefined && ts.isStringLiteral(first)) {
            out.push({ method: "ALL", path: `${first.text.replace(/\/$/, "")}/*`, query });
          } else if (first !== undefined) {
            const where = `${path.relative(repo, file)}:${source.getLineAndCharacterOfPosition(first.getStart(source)).line + 1}`;
            computed.push(`${where} ROUTE ${first.getText(source).slice(0, 60)}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(scope);
    return out;
  }

  const routes = [];
  for (const file of files) {
    const source = sourceOf(file);
    const text = source.getFullText();
    if (!text.includes("HttpModule.routes")) continue;
    const imports = importMap(source, file);
    for (const group of contributionsOf(source)) {
      const factory = boundFactory(source, group.id);
      if (factory === null) continue;
      // Imported from another module, or defined in this very file (the core groups are).
      const imported = imports.get(factory);
      const local = new RegExp(`(function|const)\\s+${factory}\\b`).test(text);
      const target = imported ?? (local ? file : undefined);
      if (target === undefined) continue;
      for (const registration of pathsOf(target, imported === undefined ? factory : null)) {
        const prefix = group.prefix.replace(/\/$/, "");
        const suffix = registration.path === "/" ? "" : registration.path;
        routes.push({
          group: group.id,
          auth: group.auth,
          method: registration.method,
          path: `${prefix}${suffix}` || "/",
          // The names the factory reads out of the query string; the decoder fills them.
          query: registration.query,
        });
      }
    }
  }
  return { routes, computed };
}

const { routes, computed } = parseRoutes();

const payload = {
  // Regenerated by `node tests/fuzzers/specs/extract.mjs`; the fuzzer never edits it.
  source: {
    types: path.relative(repo, typesFile),
    endpoints: path.relative(repo, endpointsFile),
    routes: "packages/server/src/**/module.ts (HttpModule.routes + @Bind)",
  },
  endpoints,
  routes,
  /**
   * Registrations a literal scan cannot name (`base + "/move"`). Empty is not implied: the
   * client's endpoint table carries the ones the web client calls, and that is why this list
   * is data rather than a comment.
   */
  computed,
};
fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const withBody = endpoints.filter((endpoint) => endpoint.fields.length > 0);
const fieldCount = withBody.reduce((sum, endpoint) => sum + endpoint.fields.length, 0);
const groups = new Set(routes.map((route) => route.group));
console.log(
  `[specs] ${endpoints.length} client endpoints (${withBody.length} with a typed body, ${fieldCount} top-level fields); ` +
    `${routes.length} server routes in ${groups.size} contribution groups, ${computed.length} path(s) computed at run time; ` +
    `${types.count} DTOs → ${path.relative(repo, outFile)}`,
);
for (const entry of computed) console.log(`[specs] computed: ${entry}`);
