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
  evaluateAlerts,
  validateRule,
  DEFAULT_RULES,
  SEVERITY_RANK,
  type AlertRule,
  type AlertRuleParams,
  type AlertRuleType,
  type AlertSeverity,
  type EvaluateAlertsOptions,
  type TriggeredAlert,
} from './alerts';
export { optimize, applySplits, compositions, type OptimizeOptions, type OptimizeResult, type OptimizerCandidate, type OptimizerGoal, type CandidateSplits, type ScoreBreakdown, type BlendWeights, type BlendComponents, type DeadSplit } from './optimize';
export { runMonteCarlo, computePercentiles, runSeed, type MonteCarloOptions, type MonteCarloResult, type BandPoint, type FailedTrial } from './montecarlo';
export {
  topologicalOrder,
  wouldCreateCycle,
  validateConnection,
  findOrphanedNodes,
  validateGraph,
  computeSplitPreview,
  projectDebtPayoff,
  forecastScenario,
  buildAllocationPlan,
  splitShares,
  graphFingerprint,
  type ConnectionCheck,
  type DebtPayoff,
  type ForecastOptions,
  type GenerateEventsOptions,
  type ExtraExpense,
  type GraphIssue,
  type GraphValidation,
  type SplitPreviewOutput,
  type SplitAllocation,
  type AllocationPlan,
  type SinkRoute,
} from './forecast';
