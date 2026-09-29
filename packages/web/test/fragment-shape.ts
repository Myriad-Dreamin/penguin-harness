/**
 * Every leaf path of a dictionary fragment, with a function's arity standing in for its value —
 * the type annotation alone accepts an en function that takes fewer parameters than its zh twin.
 * Each module's strings test compares its zh and en fragments with it.
 */
export function fragmentShape(value: unknown, path = ""): string[] {
  if (typeof value === "function") return [`${path}()/${value.length}`];
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .flatMap((key) =>
        fragmentShape((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key),
      );
  }
  return [path];
}
