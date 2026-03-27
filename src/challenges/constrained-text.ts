/**
 * Constrained Text Generation Challenge
 *
 * Inspired by MoltCaptcha's SMHL (Semantic-Mathematical Hybrid Lock) approach.
 * Requires simultaneous satisfaction of semantic and structural constraints.
 *
 * Prior art: MoltCaptcha (SMHL), Clawptcha (timing constraints)
 * Contribution: Delivery via MCP Sampling within a persistent session.
 */

import type { ChallengeParams, ChainContext, CheckResult } from "./types.js";

// ── Seed data ──────────────────────────────────────────────────────────────

const TOPICS = [
  "astronomy",
  "marine biology",
  "architecture",
  "ancient history",
  "renewable energy",
  "music theory",
  "glaciology",
  "photography",
  "volcanic geology",
  "classical literature",
  "robotics",
  "meteorology",
  "culinary arts",
  "cartography",
  "quantum physics",
  "typography",
  "mycology",
  "aviation",
  "paleontology",
  "cryptography",
];

const REQUIRED_WORDS: Record<string, string[]> = {
  astronomy: ["star", "orbit", "planet", "galaxy", "solar", "telescope", "light", "cosmic"],
  "marine biology": ["ocean", "coral", "fish", "deep", "marine", "wave", "reef", "tide"],
  architecture: ["building", "design", "structure", "arch", "tower", "space", "column", "facade"],
  "ancient history": ["empire", "ancient", "civilization", "dynasty", "ruin", "artifact", "temple", "era"],
  "renewable energy": ["solar", "wind", "energy", "power", "turbine", "green", "clean", "sustainable"],
  "music theory": ["chord", "melody", "rhythm", "harmony", "note", "scale", "tempo", "key"],
  glaciology: ["ice", "glacier", "frozen", "arctic", "melt", "polar", "snow", "cold"],
  photography: ["lens", "light", "exposure", "focus", "frame", "capture", "shutter", "image"],
  "volcanic geology": ["lava", "eruption", "magma", "volcanic", "crater", "ash", "tectonic", "molten"],
  "classical literature": ["novel", "author", "prose", "narrative", "literary", "chapter", "verse", "epic"],
  robotics: ["robot", "sensor", "motor", "circuit", "program", "machine", "servo", "control"],
  meteorology: ["storm", "cloud", "rain", "wind", "weather", "pressure", "forecast", "climate"],
  "culinary arts": ["flavor", "recipe", "cook", "spice", "taste", "dish", "chef", "ingredient"],
  cartography: ["map", "terrain", "compass", "scale", "legend", "border", "route", "chart"],
  "quantum physics": ["particle", "quantum", "wave", "energy", "field", "atom", "photon", "spin"],
  typography: ["font", "serif", "letter", "type", "print", "text", "style", "glyph"],
  mycology: ["fungus", "spore", "mushroom", "growth", "colony", "soil", "decay", "mycelium"],
  aviation: ["flight", "wing", "aircraft", "pilot", "altitude", "runway", "air", "engine"],
  paleontology: ["fossil", "dinosaur", "bone", "ancient", "extinct", "specimen", "layer", "age"],
  cryptography: ["cipher", "key", "encrypt", "code", "hash", "secure", "decode", "secret"],
};

const STARTING_LETTERS = "ABCDEFGHIJKLMNOPRSTW".split("");

// ── Generation ─────────────────────────────────────────────────────────────

export function generateConstrainedTextChallenge(
  chain?: ChainContext
): ChallengeParams {
  let topic: string;
  let startLetter: string;
  let wordCount: number;
  let requiredWord: string;

  if (chain?.extractedData?.country) {
    // Chained from a computed-field round: write about the country
    topic = chain.extractedData.country as string;
    startLetter = topic[0].toUpperCase();
    wordCount = 8 + Math.floor(Math.random() * 6); // 8-13
    requiredWord = ""; // no required word when topic is a country
  } else if (chain?.extractedData?.city) {
    topic = chain.extractedData.city as string;
    startLetter =
      STARTING_LETTERS[Math.floor(Math.random() * STARTING_LETTERS.length)];
    wordCount = 8 + Math.floor(Math.random() * 6);
    requiredWord = "";
  } else {
    topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    startLetter =
      STARTING_LETTERS[Math.floor(Math.random() * STARTING_LETTERS.length)];
    wordCount = 8 + Math.floor(Math.random() * 8); // 8-15
    const topicWords = REQUIRED_WORDS[topic] ?? [];
    requiredWord =
      topicWords.length > 0
        ? topicWords[Math.floor(Math.random() * topicWords.length)]
        : "";
  }

  const requiredWordClause = requiredWord
    ? `, and includes the word '${requiredWord}'`
    : "";

  const prompt = `Write a single sentence about ${topic} that starts with the letter '${startLetter}', contains exactly ${wordCount} words${requiredWordClause}. Respond with ONLY the sentence, no explanation.`;

  return {
    type: "constrained_text",
    prompt,
    maxTokens: 80,
    expectedConstraints: {
      startLetter,
      wordCount,
      requiredWord: requiredWord || undefined,
      topic,
    },
  };
}

// ── Verification ───────────────────────────────────────────────────────────

export function verifyConstrainedText(
  response: string,
  constraints: Record<string, unknown>
): { passed: boolean; checks: CheckResult[] } {
  const text = response.trim().replace(/^["']|["']$/g, ""); // strip wrapping quotes
  const checks: CheckResult[] = [];

  // Check 1: Starting letter
  const expectedLetter = (constraints.startLetter as string).toUpperCase();
  const actualLetter = text[0]?.toUpperCase() ?? "";
  checks.push({
    name: "starting_letter",
    passed: actualLetter === expectedLetter,
    expected: expectedLetter,
    actual: actualLetter,
  });

  // Check 2: Word count
  const expectedCount = constraints.wordCount as number;
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const actualCount = words.length;
  // Allow ±1 tolerance for edge cases (hyphenated words, contractions)
  checks.push({
    name: "word_count",
    passed: Math.abs(actualCount - expectedCount) <= 1,
    expected: String(expectedCount),
    actual: String(actualCount),
  });

  // Check 3: Required word (if any)
  const requiredWord = constraints.requiredWord as string | undefined;
  if (requiredWord) {
    const found = text.toLowerCase().includes(requiredWord.toLowerCase());
    checks.push({
      name: "required_word",
      passed: found,
      expected: requiredWord,
      actual: found ? requiredWord : "(not found)",
    });
  }

  // Check 4: Non-trivial (not just repeating the same word)
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  checks.push({
    name: "non_trivial",
    passed: uniqueWords.size >= Math.min(4, words.length),
    expected: "≥4 unique words",
    actual: String(uniqueWords.size),
  });

  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

// ── Entity extraction for chaining ─────────────────────────────────────────

export function extractEntitiesFromText(
  text: string
): Record<string, unknown> {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  // Find capitalized words (potential proper nouns), excluding sentence start
  const entities = words
    .slice(1)
    .filter((w) => /^[A-Z]/.test(w) && w.length > 2)
    .map((w) => w.replace(/[.,;:!?'"]/g, ""));

  return {
    text: text.trim(),
    wordCount: words.length,
    charCount: text.trim().length,
    firstLetter: text.trim()[0]?.toUpperCase() ?? "",
    entities,
    primaryEntity: entities[0] ?? "",
  };
}
