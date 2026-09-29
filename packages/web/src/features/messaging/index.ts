/**
 * The messaging module's public entry: everything outside this directory reaches it through here
 * (test/module-boundaries.test.ts fails on an import that goes around it).
 */
export { MessagingBindingModal } from "./messaging-binding-modal";
export { MessagingPanel } from "./messaging-panel";
