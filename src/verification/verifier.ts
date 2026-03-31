/**
 * Verification Engine
 *
 * Routes challenge responses to the appropriate verifier and
 * aggregates results for session-level pass/fail decisions.
 */

import type {
  ChallengeParams,
  ChallengeResult,
  CheckResult,
} from "../challenges/types.js";
import { verifyConstrainedText } from "../challenges/constrained-text.js";
import { verifyComputedField } from "../challenges/computed-field.js";

export async function verifyResponse(
  challenge: ChallengeParams,
  response: string,
  roundStartMs: number
): Promise<ChallengeResult> {
  const timeMs = Date.now() - roundStartMs;

  let passed: boolean;
  let checks: CheckResult[];
  let extractedData: Record<string, unknown> | undefined;

  switch (challenge.type) {
    case "constrained_text": {
      const result = await verifyConstrainedText(
        response,
        challenge.expectedConstraints
      );
      passed = result.passed;
      checks = result.checks;
      break;
    }
    case "computed_field": {
      const result = verifyComputedField(
        response,
        challenge.expectedConstraints
      );
      passed = result.passed;
      checks = result.checks;
      extractedData = result.extractedData;
      break;
    }
    default:
      passed = false;
      checks = [
        {
          name: "unknown_type",
          passed: false,
          expected: "known challenge type",
          actual: challenge.type,
        },
      ];
  }

  return {
    passed,
    response,
    checks,
    timeMs,
  };
}

/**
 * Determine session-level verdict.
 * Requires all rounds to pass and total time to be within budget.
 */
export function evaluateSession(
  rounds: Array<{ passed: boolean }>,
  totalTimeMs: number,
  timeBudgetMs: number,
  totalRounds: number
): { passed: boolean; reason?: string } {
  const roundsPassed = rounds.filter((r) => r.passed).length;

  // Must pass at least N-1 rounds (allow 1 failure for standard, 0 for lightweight)
  const minRounds = totalRounds <= 2 ? totalRounds : totalRounds - 1;

  if (roundsPassed < minRounds) {
    return {
      passed: false,
      reason: `Insufficient rounds passed: ${roundsPassed}/${totalRounds} (minimum ${minRounds})`,
    };
  }

  if (totalTimeMs > timeBudgetMs) {
    return {
      passed: false,
      reason: `Time budget exceeded: ${totalTimeMs}ms > ${timeBudgetMs}ms`,
    };
  }

  return { passed: true };
}
