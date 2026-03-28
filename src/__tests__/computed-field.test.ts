/**
 * Tests for computed-field challenge generation and verification.
 */

import { describe, it, expect } from "vitest";
import {
  generateComputedFieldChallenge,
  verifyComputedField,
} from "../challenges/computed-field.js";

describe("generateComputedFieldChallenge", () => {
  it("returns a computed_field challenge with expected shape", () => {
    const challenge = generateComputedFieldChallenge();

    expect(challenge.type).toBe("computed_field");
    expect(challenge.prompt).toContain("JSON object");
    expect(challenge.prompt).toContain("city");
    expect(challenge.maxTokens).toBe(100);
    expect(challenge.expectedConstraints).toHaveProperty("startLetter");
  });

  it("includes a starting letter constraint", () => {
    const challenge = generateComputedFieldChallenge();
    const letter = challenge.expectedConstraints.startLetter as string;
    expect(letter).toMatch(/^[A-Z]$/);
  });

  it("chains from a constrained_text round using entity", () => {
    const challenge = generateComputedFieldChallenge({
      roundNumber: 1,
      previousResponse: "Stars illuminate the vast galaxy beautifully",
      previousChallengeType: "constrained_text",
      extractedData: { primaryEntity: "Mars" },
    });

    // Should try to use M as starting letter (from "Mars")
    // but may pick another if no cities start with M in fallback data
    expect(challenge.expectedConstraints.startLetter).toMatch(/^[A-Z]$/);
  });
});

describe("verifyComputedField", () => {
  it("passes a correct JSON response", () => {
    // "Tokyo" → letter_count=5, ascii_sum = t(116)+o(111)+k(107)+y(121)+o(111) = 566
    const response = JSON.stringify({
      city: "Tokyo",
      country: "Japan",
      letter_count: 5,
      ascii_sum: 566,
    });

    const result = verifyComputedField(response, { startLetter: "T" });

    expect(result.passed).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
    expect(result.extractedData.city).toBe("Tokyo");
    expect(result.extractedData.country).toBe("Japan");
  });

  it("fails on invalid JSON", () => {
    const result = verifyComputedField("not json at all", { startLetter: "T" });

    expect(result.passed).toBe(false);
    const jsonCheck = result.checks.find((c) => c.name === "json_valid");
    expect(jsonCheck?.passed).toBe(false);
  });

  it("fails when required fields are missing", () => {
    const response = JSON.stringify({ city: "Tokyo", country: "Japan" });
    const result = verifyComputedField(response, { startLetter: "T" });

    expect(result.passed).toBe(false);
    const schemaCheck = result.checks.find((c) => c.name === "schema");
    expect(schemaCheck?.passed).toBe(false);
  });

  it("fails when starting letter does not match", () => {
    const response = JSON.stringify({
      city: "Paris",
      country: "France",
      letter_count: 5,
      ascii_sum: 530,
    });

    const result = verifyComputedField(response, { startLetter: "T" });

    const letterCheck = result.checks.find(
      (c) => c.name === "starting_letter"
    );
    expect(letterCheck?.passed).toBe(false);
  });

  it("fails when letter_count is wrong", () => {
    const response = JSON.stringify({
      city: "Tokyo",
      country: "Japan",
      letter_count: 7, // wrong — Tokyo has 5 letters
      ascii_sum: 566,
    });

    const result = verifyComputedField(response, { startLetter: "T" });

    const lcCheck = result.checks.find((c) => c.name === "letter_count");
    expect(lcCheck?.passed).toBe(false);
  });

  it("fails when ascii_sum is wrong", () => {
    const response = JSON.stringify({
      city: "Tokyo",
      country: "Japan",
      letter_count: 5,
      ascii_sum: 999, // wrong
    });

    const result = verifyComputedField(response, { startLetter: "T" });

    const asciiCheck = result.checks.find((c) => c.name === "ascii_sum");
    expect(asciiCheck?.passed).toBe(false);
  });

  it("allows ±2 tolerance on ascii_sum", () => {
    // Correct ascii_sum for Tokyo lowercase = 566
    const response = JSON.stringify({
      city: "Tokyo",
      country: "Japan",
      letter_count: 5,
      ascii_sum: 568, // off by 2
    });

    const result = verifyComputedField(response, { startLetter: "T" });
    const asciiCheck = result.checks.find((c) => c.name === "ascii_sum");
    expect(asciiCheck?.passed).toBe(true);
  });

  it("verifies city/country match against known data", () => {
    const response = JSON.stringify({
      city: "Tokyo",
      country: "Germany", // wrong country for Tokyo
      letter_count: 5,
      ascii_sum: 566,
    });

    const result = verifyComputedField(response, { startLetter: "T" });
    const matchCheck = result.checks.find(
      (c) => c.name === "city_country_match"
    );
    expect(matchCheck?.passed).toBe(false);
  });

  it("strips markdown code fences before parsing", () => {
    const response = '```json\n{"city":"Tokyo","country":"Japan","letter_count":5,"ascii_sum":566}\n```';
    const result = verifyComputedField(response, { startLetter: "T" });

    expect(result.passed).toBe(true);
  });

  it("soft-passes unknown cities", () => {
    // "Tbilisi" may not be in the fallback lookup
    const city = "Tbilisi";
    const letterCount = city.length; // 7
    const asciiSum = [...city.toLowerCase()].reduce(
      (s, c) => s + c.charCodeAt(0),
      0
    );

    const response = JSON.stringify({
      city,
      country: "Georgia",
      letter_count: letterCount,
      ascii_sum: asciiSum,
    });

    const result = verifyComputedField(response, { startLetter: "T" });

    const matchCheck = result.checks.find(
      (c) => c.name === "city_country_match"
    );
    // Either it matches (if in data) or soft-passes
    expect(matchCheck?.passed).toBe(true);
  });
});
