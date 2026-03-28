/**
 * Tests for challenge chaining logic.
 */

import { describe, it, expect } from "vitest";
import { getSequence, generateChainedChallenge } from "../challenges/chain.js";

describe("getSequence", () => {
  it("returns 2 rounds for lightweight", () => {
    const seq = getSequence("lightweight");
    expect(seq).toEqual(["constrained_text", "computed_field"]);
  });

  it("returns 3 rounds for standard", () => {
    const seq = getSequence("standard");
    expect(seq).toEqual([
      "constrained_text",
      "computed_field",
      "constrained_text",
    ]);
  });

  it("defaults to standard for unknown difficulty", () => {
    const seq = getSequence("unknown");
    expect(seq).toEqual(getSequence("standard"));
  });
});

describe("generateChainedChallenge", () => {
  it("generates first round without chaining", () => {
    const challenge = generateChainedChallenge(0, "standard");

    expect(challenge.type).toBe("constrained_text");
    expect(challenge.prompt).toBeTruthy();
    expect(challenge.expectedConstraints).toBeDefined();
  });

  it("generates second round as computed_field for standard", () => {
    const challenge = generateChainedChallenge(
      1,
      "standard",
      "The stars illuminate the beautiful galaxy tonight",
      "constrained_text"
    );

    expect(challenge.type).toBe("computed_field");
  });

  it("generates third round as constrained_text for standard", () => {
    const jsonResponse = JSON.stringify({
      city: "Santiago",
      country: "Chile",
      letter_count: 8,
      ascii_sum: 849,
    });

    const challenge = generateChainedChallenge(
      2,
      "standard",
      jsonResponse,
      "computed_field"
    );

    expect(challenge.type).toBe("constrained_text");
    // Should chain from the computed_field response — topic should be the country
    expect(challenge.expectedConstraints.topic).toBe("Chile");
  });

  it("throws on out-of-bounds round index", () => {
    expect(() => generateChainedChallenge(5, "standard")).toThrow(
      /exceeds sequence length/
    );
  });

  it("chains computed_field from constrained_text entities", () => {
    const textResponse =
      "Bright telescopes observe the beautiful Mars atmosphere constantly";
    const challenge = generateChainedChallenge(
      1,
      "lightweight",
      textResponse,
      "constrained_text"
    );

    expect(challenge.type).toBe("computed_field");
    // Mars should be extracted as an entity
    expect(challenge.expectedConstraints.startLetter).toMatch(/^[A-Z]$/);
  });
});
