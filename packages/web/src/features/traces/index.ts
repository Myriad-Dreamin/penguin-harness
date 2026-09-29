/**
 * The traces module's public entry: everything outside this directory reaches it through here
 * (test/module-boundaries.test.ts fails on an import that goes around it).
 */
export { packToolLanes } from "./lane-packing";
export { TracePanel } from "./trace-panel";
