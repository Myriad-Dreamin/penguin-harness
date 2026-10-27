/**
 * Shared result vocabulary for the three demo legs: a finding is anything the demo observed
 * that a person would want to look at (an invariant violation, a thrown request, a step that
 * outlived its soft timeout, a process.exit the exit guard caught). Legs return their steps,
 * findings, and transcript lines; run-demo aggregates and REPORT.md prints them.
 */

export interface Finding {
  /** The leg that observed it ("api" | "cli" | "core"). */
  leg: string;
  /** 1-based step number inside the leg (0 for setup-phase observations). */
  step: number;
  /** Machine-readable class, e.g. invariant_process_error / request_threw / step_timeout. */
  kind: string;
  /** One or two sentences a person can act on. */
  detail: string;
}

export interface LegSummary {
  leg: string;
  steps: number;
  /** Distinct bucketed state signatures observed (API leg only; 0 elsewhere). */
  signatures: number;
  findings: Finding[];
}
