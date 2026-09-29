/**
 * The semantic-id module's public entry: everything outside this directory reaches it through here
 * (test/module-boundaries.test.ts fails on an import that goes around it).
 */
export { proposalValue } from "./id-suggest-notice";
export { SemanticIdField } from "./semantic-id-field";
