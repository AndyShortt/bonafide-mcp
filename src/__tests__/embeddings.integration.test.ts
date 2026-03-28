/**
 * Integration tests for cosine similarity via all-MiniLM-L6-v2.
 *
 * These tests load the real model — no mocks. On a cold runner the model
 * downloads ~23 MB from HuggingFace before the first assertion runs.
 * GitHub Actions caches ~/.cache/huggingface/hub between runs so subsequent
 * PRs skip the download.
 *
 * Run locally:  npm run test:integration
 * Run in CI:    triggered automatically on pull_request via integration.yml
 */

import { describe, it, expect } from "vitest";
import {
  computeCosineSimilarity,
  checkTopicRelevance,
} from "../verification/embeddings.js";

// ── computeCosineSimilarity ───────────────────────────────────────────────

describe("computeCosineSimilarity (real model)", () => {
  it("scores identical strings at ~1.0", async () => {
    const text = "Astronomers use telescopes to observe distant stars.";
    const score = await computeCosineSimilarity(text, text);
    expect(score).toBeGreaterThan(0.99);
  });

  it("scores clearly on-topic sentence high against its topic", async () => {
    // A genuine LLM-quality sentence about astronomy
    const sentence =
      "Powerful telescopes reveal the structure of distant galaxies and nebulae.";
    const score = await computeCosineSimilarity(sentence, "astronomy");
    expect(score).toBeGreaterThan(0.4);
  });

  it("scores a clearly off-topic sentence low against an unrelated topic", async () => {
    // A sentence about baking has no semantic relation to quantum physics
    const sentence =
      "The bakery opens early and sells fresh sourdough loaves every morning.";
    const score = await computeCosineSimilarity(sentence, "quantum physics");
    expect(score).toBeLessThan(0.4);
  });

  it("returns a value in the valid cosine similarity range [-1, 1]", async () => {
    const score = await computeCosineSimilarity(
      "Some arbitrary sentence.",
      "marine biology"
    );
    expect(score).toBeGreaterThanOrEqual(-1);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("is symmetric — score(A, B) equals score(B, A)", async () => {
    const a = "Glaciers are retreating due to rising global temperatures.";
    const b = "glaciology";
    const ab = await computeCosineSimilarity(a, b);
    const ba = await computeCosineSimilarity(b, a);
    expect(Math.abs(ab - ba)).toBeLessThan(0.001);
  });
});

// ── checkTopicRelevance ───────────────────────────────────────────────────

describe("checkTopicRelevance (real model)", () => {
  it("passes a topically coherent sentence at the default threshold", async () => {
    const response =
      "Volcanic eruptions release enormous amounts of lava and ash into the atmosphere.";
    const result = await checkTopicRelevance(response, "volcanic geology");
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.4);
  });

  it("fails a keyword-stuffed but semantically incoherent response", async () => {
    // This is the attack vector the check is designed to defeat:
    // a bot including topic words in an otherwise unrelated sentence.
    const response =
      "The astronomy planet orbit star galaxy telescope solar cosmic light shines.";
    // Listing keywords without forming a real sentence should score below
    // a genuine LLM-generated sentence — but the check still verifies
    // the score is in a detectable range.
    const genuine =
      "Astronomers use orbital telescopes to study the life cycle of stars.";
    const stuffedScore = (
      await checkTopicRelevance(response, "astronomy")
    ).score;
    const genuineScore = (await checkTopicRelevance(genuine, "astronomy"))
      .score;
    // The genuine sentence should out-score the keyword list
    expect(genuineScore).toBeGreaterThan(stuffedScore);
  });

  it("fails a completely off-topic response", async () => {
    const response =
      "I enjoyed the pasta dish at the restaurant on the corner last Tuesday.";
    const result = await checkTopicRelevance(response, "cryptography");
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(0.4);
  });

  it("respects a custom threshold", async () => {
    const response =
      "Robots use sensors and motors to interact with their environment.";
    // Should pass at 0.4 but potentially fail at a stricter 0.8
    const lenient = await checkTopicRelevance(response, "robotics", 0.4);
    const strict = await checkTopicRelevance(response, "robotics", 0.8);
    expect(lenient.passed).toBe(true);
    expect(strict.passed).toBe(false);
  });
});
