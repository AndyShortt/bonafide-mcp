/**
 * Shared type definitions for challenges, results, and session configuration.
 *
 * Defines ChallengeParams (inputs to a round), ChallengeResult (outputs
 * after verification), ChainContext (data passed between rounds), and
 * DIFFICULTY_CONFIG (time budgets and round counts per difficulty level).
 */

export type ChallengeType = "constrained_text" | "computed_field";

export interface ChallengeParams {
  type: ChallengeType;
  prompt: string;
  maxTokens: number;
  /** Parameters used to generate this challenge (for verification) */
  expectedConstraints: Record<string, unknown>;
}

export interface ChallengeResult {
  passed: boolean;
  response: string;
  checks: CheckResult[];
  timeMs: number;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  expected?: string;
  actual?: string;
}

export interface ChainContext {
  roundNumber: number;
  previousResponse?: string;
  previousChallengeType?: ChallengeType;
  /** Extracted entities/data from previous response for chaining */
  extractedData?: Record<string, unknown>;
}

export interface VerificationConfig {
  difficulty: "lightweight" | "standard";
  totalRounds: number;
  timeBudgetMs: number;
}

export const DIFFICULTY_CONFIG: Record<string, VerificationConfig> = {
  lightweight: {
    difficulty: "lightweight",
    totalRounds: 2,
    timeBudgetMs: 3000,
  },
  standard: {
    difficulty: "standard",
    totalRounds: 3,
    timeBudgetMs: 5000,
  },
};
