# PRFC-0005 Depend on mechanisms, not implementations

- Feature Name: `mechanisms-not-implementations`
- Start Date: 2026-09-02
- PRFC PR: [Prism-Shadow/penguin-harness-design#109](https://github.com/Prism-Shadow/penguin-harness-design/pull/109)
- Implementation PR: [Prism-Shadow/penguin-harness#546](https://github.com/Prism-Shadow/penguin-harness/pull/546)
- Depends on: PRFC-0001 "Module"

## Summary
[summary]: #summary

Nodes in the module tree depend only on **mechanisms**—interface classes that carry signatures and nothing else—not on the components that implement those mechanisms. Tooling enforces the rule: a `@Use` field whose type is a component is an error. Three things follow: test doubles become a second implementation of a mechanism instead of a bag of options, the tree is divided into groups that export only what should be exported, and either a whole group or a single node can be replaced by a foreign extension.

## Motivation
[motivation]: #motivation

### The tree exists, but it describes "who news whom"

After PRFC-0001 organized the server into a tree of Modules, `ifaces.json` made dependency relationships countable for the first time. The count was not pretty:

Before the change, counting against the then-current `ifaces.json`, **more than half of all `requires` pointed at implementation classes**—`UsersRepo`, `SessionsRepo`, `ProjectConfigService` and the like—while fewer than half pointed at interfaces. In other words, the tree recorded "who news whom," not "who needs which mechanism." `AuthService` was saying "I want the `UsersRepo` on sqlite" when what it actually meant was "I want a `Users`."

A single node exported ten unrelated things. One node, `RuntimeModule`, offered config, db, channels, proxy, hmr, desktop, authState, overrides, log, and resourceGroups all at once. Some twenty nodes required its `Config`, the vast majority of them using only the single field `config.root`; what required its `Db` was every repo.

**The ugliest finding of all: a dozen-plus nodes depended on `Overrides`.** That is test injection—`now`, `passwordHashCost`, `feishuSdk`, `qqTransport`—marching brazenly through the production dependency graph. To give tests a fake clock, production code had to admit to carrying a swappable clock pocket.

### There is also a shape problem

Once the tree was built, everything became a node, and nodes were flat with respect to one another: no grouping, no visibility, anyone could be depended on by anyone. The question "who depends on this module" thereby lost its meaning—every module appeared to have no dependents, because what everyone depended on were interfaces, and interfaces belonged to no module.

## Guide-level explanation
[guide-level-explanation]: #guide-level-explanation

### Three rules

**Nodes depend only on interface classes.** The type of a `@Use()` field must be an interface class—either decorated with `@Interface()`, or one that `extends Interface<T>()`. The generator treats "the type is a component" as an error, so this rule is structural and does not rely on reviewers remembering it.

**A mechanism is declared by its owner; an implementation is just a component.** The `Users` interface belongs to the identity mechanism; the sqlite-backed `UsersRepo` is one implementation of it, written `class UsersRepo implements Users`. Consumers always `import type { Users }` and never import the repo file—the `import` path itself says that the dependency is on the mechanism, not on the storage technology.

**A component declares what it implements.** The generator reads the `implements` clause and records the interface into that node's `provides`; wiring prefers declared provides and falls back to structure only when that fails. TypeScript checks the shape, the generator checks the signature projection, the launcher checks runtime existence—three layers of one and the same rule.

Consumers may also declare narrower interfaces in place (the Go way): if auth needs only three config fields, it declares an `AuthPolicy` right next to itself and lets whoever satisfies it plug in—no need to wait for the owner to slice the big interface finer first.

### Test doubles are a second implementation of the mechanism

`BuildDepsOverrides` is deleted. Each of its former items becomes one interface plus two implementations:

| Former Overrides field | Mechanism | Production implementation | Test implementation |
| --- | --- | --- | --- |
| `now` | `Clock` | `SystemClock` | `FakeClock` |
| `passwordHashCost` | `PasswordHasher` | `ScryptHasher` | the low-cost one |
| `feishuSdk`, `qqTransport`, etc. | each connector's `Transport` | the real network | fake |
| `machines`, `updateCheck` | `MachineEffects`, `UpdateCheckTransport` | real ssh / fetch | fake |

Tests put doubles into the tree with `bootAppDeps(config, [[SystemClock, { now }]])`, and the doubles are validated just like the nodes themselves. The "runtime reads a bag of options" shape disappears; every double is a node in the tree with a name and a signature, visible in `ifaces.json`.

### The tree gets a shape

Under the root, nodes are grouped by mechanism, each group being a `@Module({ children, exports })`. **Exported interfaces are re-exported by the child that declares them, and the group's other nodes are visible only within the group**—visibility is lexical: siblings, and the siblings of ancestors, but not the ancestors themselves.

A whole group can be replaced, and so can any single node within a group. Startup order follows **the exported child**, not the group itself; otherwise the identity group and the projects group, each needing one of the other's children, would form a cycle. The generator statically resolves every `requires` to the module that provides it and records that in `from`—"who depends on whom" becomes visible again, and it is counted out of the table, not carried in anyone's memory.

## Reference-level explanation
[reference-level-explanation]: #reference-level-explanation

### Where interfaces live

All in one place: `src/mechanisms/<group>.ts`, abstract classes only, one per mechanism, with full signatures; the sqlite implementations stay in `db/repos/*.ts` and `implements` them. This is one revision to the original design—interfaces were originally to be scattered across per-owner directories, but in practice one place proved easier to read. Narrow interfaces declared by consumers still sit right next to their consumers.

The result is that **not a single `@Use` field points at an implementation**, and the generator makes such a field an error—so this is not the achievement of a one-off cleanup, it is a rule that holds.

### Opaque identity

A hosted type is written `<declaring package>#<name>`, never a bare name: `@types/node#Request`, `@prismshadow/penguin-core#Resources`. Mapped types (`Pick<…>`, `Record<…>`) are projected by their expanded shape; an alias that carries methods is projected as an interface under its own name. The manifest records each node's kind, and the page marks components, modules, and export groups accordingly.

### Hot replacement by foreign extensions

An extension is `{ modules?, replaces? }`. `package.json#penguin.replaces` lists the stand-ins keyed by **the name of the replaced node**—what gets replaced can be a component, a module, or an entire group with children and exports.

When a stand-in goes in, the original class is not consulted; once everything is in place, the entire assembled tree is validated before any node runs: requires resolve by signature, exports land on some child, provides genuinely exist on the instance. A stand-in that provides less than its consumers need is **rejected by name**. Two extensions replacing the same node is a load-time conflict.

Production code and test helpers alike read the tree through a group's exports, and never reach for an implementation node by name.

## Drawbacks
[drawbacks]: #drawbacks

**The number of interfaces more than doubled.** The batch of mechanism interfaces collected in one place, plus the narrow interfaces consumers declare themselves, are all things that must be maintained; changing a method signature now touches both the interface and the implementation.

**Collecting them in one place is a trade-off.** `src/mechanisms/` is easy to read, but it is also a directory that everyone edits, prone to becoming a conflict point, and interfaces now sit far from their implementations.

**Lexical visibility is a new rule**, and readers of the code must know that "visible within the group, invisible to ancestors"—otherwise they will be puzzled why some node cannot reach something that appears to sit right next to it.

## Rationale and alternatives
[rationale-and-alternatives]: #rationale-and-alternatives

**Enforce the rule by review**—agree that "@Use takes interfaces only" and leave the generator alone. The pre-change majority of implementation dependencies was itself the outcome of that path: conventions are the first thing to fail under deadline pressure. Make the tool turn it into an error, and only then is the rule structural.

**Keep `Overrides` but narrow it**—retain only the items that genuinely need injection. It is still the same defect: the production dependency graph carries a pocket that exists for tests, and no boundary can say which items count as "genuinely needed."

**No grouping, stay flat**—saves the whole layer of visibility and export forwarding. The cost is that any node can depend on any node, "who depends on whom" is forever unanswerable, and there is no granularity of replacement: to swap out an entire block you have to go node by node.

**Register stand-ins by name outside the tree**—a global replacement table. Stand-ins then escape whole-tree validation; a stand-in missing a method is discovered only at call time—precisely the class of failure PRFC-0001 set out to eliminate.

## Prior art
[prior-art]: #prior-art

**Go's narrow-interface convention**—"the interface belongs to the consumer, not to the implementer"—is the source of the "consumers may declare narrower interfaces in place" rule. This design adds a layer Go does not have: the owner declares one too, because replacement across hot-push boundaries needs something both sides name explicitly.

**OSGi's service visibility** did the same grouping and exporting: a bundle explicitly exports its packages, and the rest stays invisible to the outside. The difference is that OSGi enforces this with ClassLoaders, whereas we enforce it with a lexical rule plus validation.

**Dependency injection containers** (NestJS, Spring) usually allow injection by concrete class as well as by interface; both are legal, so in practice things always slide toward concrete classes. Here, "injecting by implementation" is made an error outright—deliberately leaving no opening for that slippery slope.

## Unresolved questions
[unresolved-questions]: #unresolved-questions

`ProjectConfig` could be sliced further per consumer—the scheduler needs only `getModels` and `getPricing`, access control needs only `getName`—but where the slicing should stop is unsettled. Slice too fine and there end up being more interfaces than methods.

Whether `src/mechanisms/` collecting everything in one place will become a conflict hotspot can only be known after several people have edited it at the same time; if it truly becomes a problem, retreating to per-owner directories is reversible.

## Future possibilities
[future-possibilities]: #future-possibilities

Group replaceability gives deployers a road that nobody has walked yet: swap an entire group for their own implementation—for example, replace the identity group with one backed by an enterprise directory service—without touching the rest of the platform. The entrance to this road already exists (`replaces` accepts an entire group); what is missing is the documentation and examples that should come with it once someone actually needs it.
