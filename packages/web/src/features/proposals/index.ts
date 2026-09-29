/**
 * The proposals module's public entry: everything outside this directory reaches it through here
 * (test/module-boundaries.test.ts fails on an import that goes around it).
 */
export {
  PROPOSAL_COMPONENTS,
  PROPOSAL_REMARK_PLUGINS,
  PROPOSAL_VALUE_PREFIX,
  ProposalCapsule,
  remarkProposalLinks,
} from "./proposal-links";
export { OrgProposalsPage } from "./proposals-page";
