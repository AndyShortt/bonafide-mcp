/**
 * Constrained Text Challenge — generation and verification.
 *
 * Generates prompts requiring a single sentence that satisfies four
 * simultaneous constraints: starting letter, exact word count, a required
 * keyword, and topical coherence. Verification checks all four, with topic
 * relevance measured via cosine similarity (all-MiniLM-L6-v2, threshold ≥ 0.4).
 */

import type { ChallengeParams, ChainContext, CheckResult } from "./types.js";
import { checkTopicRelevance } from "../verification/embeddings.js";

// ── Seed data ──────────────────────────────────────────────────────────────

/**
 * Topic descriptions used for both prompt generation and cosine similarity
 * comparison. Using descriptive phrases (rather than bare keywords) produces
 * higher-quality embeddings and more accurate relevance scoring.
 */
const TOPIC_DESCRIPTIONS: Record<string, string> = {
  astronomy: "astronomy, the scientific study of stars, planets, galaxies, and the universe",
  "marine biology": "marine biology, the study of ocean ecosystems, coral reefs, and sea life",
  architecture: "architecture, the art and science of designing buildings and structures",
  "ancient history": "ancient history, the study of early civilizations, empires, and archaeological artifacts",
  "renewable energy": "renewable energy, including solar power, wind turbines, and sustainable technology",
  "music theory": "music theory, the study of harmony, melody, rhythm, and musical composition",
  glaciology: "glaciology, the study of glaciers, ice sheets, and polar environments",
  photography: "photography, the art of capturing images using cameras, lenses, and light",
  "volcanic geology": "volcanic geology, the study of volcanoes, lava flows, and tectonic activity",
  "classical literature": "classical literature, including novels, epic poetry, and literary criticism",
  robotics: "robotics, the engineering of autonomous machines, sensors, and control systems",
  meteorology: "meteorology, the study of weather patterns, storms, and atmospheric science",
  "culinary arts": "culinary arts, the practice of cooking, flavor development, and gastronomy",
  cartography: "cartography, the science of mapmaking, terrain analysis, and geographic visualization",
  "quantum physics": "quantum physics, the study of subatomic particles, wave-particle duality, and quantum fields",
  typography: "typography, the design of fonts, letterforms, and the art of arranging type",
  mycology: "mycology, the study of fungi, mushrooms, spores, and fungal ecosystems",
  aviation: "aviation, the science and practice of flight, aircraft design, and piloting",
  paleontology: "paleontology, the study of fossils, dinosaurs, and prehistoric life",
  cryptography: "cryptography, the science of encoding and decoding secret messages and secure communication",
};

const TOPICS = Object.keys(TOPIC_DESCRIPTIONS);

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

export async function verifyConstrainedText(
  response: string,
  constraints: Record<string, unknown>
): Promise<{ passed: boolean; checks: CheckResult[] }> {
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

  // Check 4: Topic relevance via cosine similarity (all-MiniLM-L6-v2, threshold ≥ 0.55)
  // Uses the full topic description for a higher-quality embedding anchor.
  const topic = constraints.topic as string;
  const topicDescription = TOPIC_DESCRIPTIONS[topic] ?? topic;
  const SIMILARITY_THRESHOLD = 0.55;
  const { passed: topicPassed, score } = await checkTopicRelevance(
    text,
    topicDescription,
    SIMILARITY_THRESHOLD
  );
  checks.push({
    name: "topic_relevance",
    passed: topicPassed,
    expected: `cosine similarity ≥ ${SIMILARITY_THRESHOLD} (topic: "${topic}")`,
    actual: score.toFixed(3),
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
