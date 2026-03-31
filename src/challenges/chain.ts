/**
 * Challenge sequencing and chaining between rounds.
 *
 * Defines the ordered challenge type sequence for each difficulty level and
 * generates each round's challenge using extracted data from the previous
 * response — for example, feeding a city name from a computed_field response
 * into the topic constraint of the next constrained_text round.
 */

import type { ChallengeParams, ChallengeType, ChainContext } from "./types.js";
import {
  generateConstrainedTextChallenge,
  extractEntitiesFromText,
} from "./constrained-text.js";
import { generateComputedFieldChallenge } from "./computed-field.js";

// ── Round sequence patterns ────────────────────────────────────────────────

/**
 * Define challenge type sequences for each difficulty.
 * Alternating types creates stronger chaining because the output format
 * of one type feeds naturally into the constraints of the other.
 */
const SEQUENCES: Record<string, ChallengeType[]> = {
  lightweight: ["constrained_text", "computed_field"],
  standard: ["constrained_text", "computed_field", "constrained_text"],
};

// ── Chain generation ───────────────────────────────────────────────────────

export function getSequence(difficulty: string): ChallengeType[] {
  return SEQUENCES[difficulty] ?? SEQUENCES.standard;
}

export function generateChainedChallenge(
  roundIndex: number,
  difficulty: string,
  previousResponse?: string,
  previousType?: ChallengeType
): ChallengeParams {
  const sequence = getSequence(difficulty);
  const challengeType = sequence[roundIndex];

  if (!challengeType) {
    throw new Error(
      `Round index ${roundIndex} exceeds sequence length for difficulty ${difficulty}`
    );
  }

  // Build chain context from previous response
  let chain: ChainContext | undefined;
  if (previousResponse && roundIndex > 0) {
    chain = {
      roundNumber: roundIndex,
      previousResponse,
      previousChallengeType: previousType,
      extractedData: extractDataForChaining(previousResponse, previousType),
    };
  }

  switch (challengeType) {
    case "constrained_text":
      return generateConstrainedTextChallenge(chain);
    case "computed_field":
      return generateComputedFieldChallenge(chain);
    default:
      throw new Error(`Unknown challenge type: ${challengeType}`);
  }
}

// ── Data extraction for chaining ───────────────────────────────────────────

function extractDataForChaining(
  response: string,
  previousType?: ChallengeType
): Record<string, unknown> {
  if (previousType === "computed_field") {
    // Try to parse JSON from the previous response
    try {
      let cleaned = response.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned
          .replace(/^```(?:json)?\n?/, "")
          .replace(/\n?```$/, "");
      }
      const parsed = JSON.parse(cleaned);
      return {
        city: parsed.city,
        country: parsed.country,
        letterCount: parsed.letter_count,
      };
    } catch {
      // If JSON parse fails, fall through to text extraction
      return extractEntitiesFromText(response);
    }
  }

  // Default: extract entities from text
  return extractEntitiesFromText(response);
}
