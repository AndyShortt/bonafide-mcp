/**
 * Tests for constrained text challenge generation and verification.
 *
 * The embeddings module is mocked so tests don't require the ML model.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the embeddings module before importing the module under test
vi.mock("../verification/embeddings.js", () => ({
  checkTopicRelevance: vi.fn().mockResolvedValue({ passed: true, score: 0.72 }),
}));

import {
  generateConstrainedTextChallenge,
  verifyConstrainedText,
  extractEntitiesFromText,
} from "../challenges/constrained-text.js";
import { checkTopicRelevance } from "../verification/embeddings.js";

const mockedCheckTopicRelevance = vi.mocked(checkTopicRelevance);

describe("generateConstrainedTextChallenge", () => {
  it("returns a constrained_text challenge with expected shape", () => {
    const challenge = generateConstrainedTextChallenge();

    expect(challenge.type).toBe("constrained_text");
    expect(challenge.prompt).toContain("Write a single sentence");
    expect(challenge.maxTokens).toBe(80);
    expect(challenge.expectedConstraints).toHaveProperty("startLetter");
    expect(challenge.expectedConstraints).toHaveProperty("wordCount");
    expect(challenge.expectedConstraints).toHaveProperty("topic");
  });

  it("generates a valid starting letter", () => {
    const challenge = generateConstrainedTextChallenge();
    const letter = challenge.expectedConstraints.startLetter as string;
    expect(letter).toMatch(/^[A-Z]$/);
  });

  it("generates a word count between 8 and 15", () => {
    for (let i = 0; i < 20; i++) {
      const challenge = generateConstrainedTextChallenge();
      const wc = challenge.expectedConstraints.wordCount as number;
      expect(wc).toBeGreaterThanOrEqual(8);
      expect(wc).toBeLessThanOrEqual(15);
    }
  });

  it("uses chained data from computed_field (country)", () => {
    const challenge = generateConstrainedTextChallenge({
      roundNumber: 1,
      previousResponse: '{"city":"Berlin","country":"Germany","letter_count":6,"ascii_sum":609}',
      previousChallengeType: "computed_field",
      extractedData: { city: "Berlin", country: "Germany", letterCount: 6 },
    });

    expect(challenge.expectedConstraints.topic).toBe("Germany");
  });
});

describe("verifyConstrainedText", () => {
  beforeEach(() => {
    mockedCheckTopicRelevance.mockResolvedValue({ passed: true, score: 0.72 });
  });

  it("passes a valid constrained text response", async () => {
    const constraints = {
      startLetter: "T",
      wordCount: 8,
      requiredWord: "star",
      topic: "astronomy",
    };

    const response =
      "The distant star illuminates our galaxy with cosmic light";
    const result = await verifyConstrainedText(response, constraints);

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(4);
    expect(result.checks.map((c) => c.name)).toEqual([
      "starting_letter",
      "word_count",
      "required_word",
      "topic_relevance",
    ]);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("fails when starting letter is wrong", async () => {
    const constraints = {
      startLetter: "A",
      wordCount: 5,
      topic: "astronomy",
    };

    const response = "Stars burn brightly at night";
    const result = await verifyConstrainedText(response, constraints);

    const letterCheck = result.checks.find((c) => c.name === "starting_letter");
    expect(letterCheck?.passed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("fails when word count is off by more than 1", async () => {
    const constraints = {
      startLetter: "T",
      wordCount: 12,
      topic: "astronomy",
    };

    const response = "The star shines brightly";
    const result = await verifyConstrainedText(response, constraints);

    const wcCheck = result.checks.find((c) => c.name === "word_count");
    expect(wcCheck?.passed).toBe(false);
  });

  it("allows ±1 word count tolerance", async () => {
    const constraints = {
      startLetter: "T",
      wordCount: 5,
      topic: "astronomy",
    };

    // 4 words — within ±1 of 5
    const response = "The star shines brightly";
    const result = await verifyConstrainedText(response, constraints);

    const wcCheck = result.checks.find((c) => c.name === "word_count");
    expect(wcCheck?.passed).toBe(true);
  });

  it("fails when required word is missing", async () => {
    const constraints = {
      startLetter: "T",
      wordCount: 5,
      requiredWord: "planet",
      topic: "astronomy",
    };

    const response = "The bright star shines tonight";
    const result = await verifyConstrainedText(response, constraints);

    const rwCheck = result.checks.find((c) => c.name === "required_word");
    expect(rwCheck?.passed).toBe(false);
  });

  it("calls checkTopicRelevance with the response text and topic", async () => {
    const constraints = {
      startLetter: "S",
      wordCount: 5,
      topic: "marine biology",
    };

    const response = "Salty ocean waves crash here";
    await verifyConstrainedText(response, constraints);

    expect(mockedCheckTopicRelevance).toHaveBeenCalledWith(
      "Salty ocean waves crash here",
      "marine biology",
      0.4
    );
  });

  it("fails when topic relevance score is below threshold", async () => {
    mockedCheckTopicRelevance.mockResolvedValue({ passed: false, score: 0.18 });

    const constraints = {
      startLetter: "T",
      wordCount: 5,
      topic: "astronomy",
    };

    const response = "The lazy cat slept soundly";
    const result = await verifyConstrainedText(response, constraints);

    const topicCheck = result.checks.find((c) => c.name === "topic_relevance");
    expect(topicCheck?.passed).toBe(false);
    expect(topicCheck?.actual).toBe("0.180");
  });

  it("strips wrapping quotes from response", async () => {
    const constraints = {
      startLetter: "T",
      wordCount: 5,
      topic: "astronomy",
    };

    const response = '"The bright star shines tonight"';
    const result = await verifyConstrainedText(response, constraints);

    const letterCheck = result.checks.find((c) => c.name === "starting_letter");
    expect(letterCheck?.passed).toBe(true);
  });
});

describe("extractEntitiesFromText", () => {
  it("extracts capitalized words as entities", () => {
    const result = extractEntitiesFromText(
      "The ancient ruins of Rome stand near the Vatican"
    );

    expect(result.entities).toContain("Rome");
    expect(result.entities).toContain("Vatican");
  });

  it("returns word count and char count", () => {
    const result = extractEntitiesFromText("Hello world test");

    expect(result.wordCount).toBe(3);
    expect(result.charCount).toBe(16);
  });

  it("returns first letter uppercased", () => {
    const result = extractEntitiesFromText("astronomy is fascinating");

    expect(result.firstLetter).toBe("A");
  });
});
