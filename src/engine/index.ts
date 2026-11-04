/**
 * index.ts — public engine API.
 *
 * The UI imports ONLY from this module (and types). Monte Carlo and the
 * optimizer land here in later milestones; the deterministic forecast,
 * recurrence, RNG, and validation are the milestone-1 surface.
 */
export * from './types';
export * from './dates';
export * from './recurrence';
export * from './rng';
export * from './explain';
export { forecast, generateEvents } from './forecast';
export {
  topologicalOrder,
  wouldCreateCycle,
  validateConnection,
  findOrphanedNodes,
  validateGraph,
  computeSplitPreview,
  projectDebtPayoff,
  type ConnectionCheck,
  type DebtPayoff,
  type ForecastOptions,
  type GraphIssue,
  type GraphValidation,
  type SplitPreviewOutput,
} from './forecast';
