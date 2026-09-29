/**
 * The models module's public entry: everything outside this directory reaches it through here
 * (test/module-boundaries.test.ts fails on an import that goes around it).
 */
export { catalogDelta, type CatalogDelta } from "./catalog-sync";
export { loadModelGroupOrder } from "./model-group-order";
export {
  hasConfiguredKey,
  isFreeModel,
  type PeakWindows,
  promotedPricing,
  sameModelRef,
  visibleChatModels,
} from "./model-grouping";
export { ModelsPage } from "./models-page";
