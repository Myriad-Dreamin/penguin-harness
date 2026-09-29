/**
 * The workflows module's public entry: everything outside this directory reaches it through here
 * (test/module-boundaries.test.ts fails on an import that goes around it).
 */
export { WorkflowAppPage } from "./workflow-app-page";
export { useWorkflowTabs, WorkflowFrame, WorkflowTabStrip } from "./workflow-tabs";
