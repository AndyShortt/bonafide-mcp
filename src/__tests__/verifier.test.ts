/**
 * Tests for the verification engine — response routing and session evaluation.
 */

import { describe, it, expect, vi } from "vitest";

// Mock embeddings so constrained_text verification doesn't need the ML model
vi.mock("../verification/embeddings.js", () => ({
  checkTopicRelevance: vi.fn().mockResolvedValue({ passed: true, score: 0.72 }),
}));

import { verifyResponse, evaluateSession } from "../verification/verifier.js";
import type { ChallengeParams } from "../challenges/types.js";

describe("verifyResponse", () => {
  it("routes constrained_text to the correct verifier", async () => {
    const challenge: ChallengeParams = {
      type: "constrained_text",
      prompt: "test",
      maxTokens: 80,
      expectedConstraints: {
        startLetter: "T",
        wordCount: 5,
        topic: "astronomy",
      },
    };

    const result = await verifyResponse(
      challenge,
      "The bright star shines tonight",
      Date.now()
    );

    expect(result.checks.some((c) => c.name === "starting_letter")).toBe(true);
    expect(result.checks.some((c) => c.name === "topic_relevance")).toBe(true);
    expect(result.timeMs).toBeGreaterThanOrEqual(0);
  });

  it("routes computed_field to the correct verifier", async () => {
    const challenge: ChallengeParams = {
      type: "computed_field",
      prompt: "test",
      maxTokens: 100,
      expectedConstraints: { startLetter: "T" },
    };

    const response = JSON.stringify({
      city: "Tokyo",
      country: "Japan",
      letter_count: 5,
      ascii_sum: 566,
    });

    const result = await verifyResponse(challenge, response, Date.now());

    expect(result.checks.some((c) => c.name === "json_valid")).toBe(true);
    expect(result.checks.some((c) => c.name === "ascii_sum")).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("returns failure for unknown challenge type", async () => {
    const challenge: ChallengeParams = {
      type: "unknown_type" as any,
      prompt: "test",
      maxTokens: 80,
      expectedConstraints: {},
    };

    const result = await verifyResponse(challenge, "anything", Date.now());

    expect(result.passed).toBe(false);
    expect(result.checks[0].name).toBe("unknown_type");
  });
});

describe("evaluateSession", () => {
  it("passes when all rounds pass within time budget", () => {
    const rounds = [{ passed: true }, { passed: true }, { passed: true }];
    const result = evaluateSession(rounds, 2000, 5000, 3);

    expect(result.passed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("passes standard difficulty with N-1 rounds (allows 1 failure)", () => {
    const rounds = [{ passed: true }, { passed: false }, { passed: true }];
    const result = evaluateSession(rounds, 3000, 5000, 3);

    expect(result.passed).toBe(true);
  });

  it("fails standard difficulty with 2 failures", () => {
    const rounds = [{ passed: false }, { passed: false }, { passed: true }];
    const result = evaluateSession(rounds, 3000, 5000, 3);

    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Insufficient rounds");
  });

  it("fails lightweight difficulty if any round fails (no tolerance)", () => {
    const rounds = [{ passed: true }, { passed: false }];
    const result = evaluateSession(rounds, 2000, 3000, 2);

    expect(result.passed).toBe(false);
  });

  it("fails when time budget is exceeded", () => {
    const rounds = [{ passed: true }, { passed: true }, { passed: true }];
    const result = evaluateSession(rounds, 6000, 5000, 3);

    expect(result.passed).toBe(false);
    expect(result.reason).toContain("Time budget exceeded");
  });

  it("passes lightweight when both rounds pass", () => {
    const rounds = [{ passed: true }, { passed: true }];
    const result = evaluateSession(rounds, 2500, 3000, 2);

    expect(result.passed).toBe(true);
  });
});
