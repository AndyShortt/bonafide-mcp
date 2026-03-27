/**
 * Computed-Field Structured Output Challenge
 *
 * Requires a JSON response where some fields need world knowledge
 * (a real city, its country) and other fields are mathematical
 * derivations of those knowledge-based fields (letter count, ASCII sum).
 *
 * Prior art: MoltCaptcha SMHL (mathematical constraints on text),
 * academic literature on structured output verification.
 * Contribution: Delivery via MCP Sampling within a persistent session.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { ChallengeParams, ChainContext, CheckResult } from "./types.js";

// ── City data ──────────────────────────────────────────────────────────────

interface CityEntry {
  city: string;
  country: string;
  continent: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let CITIES: CityEntry[];
try {
  const dataPath = join(__dirname, "../../data/cities.json");
  CITIES = JSON.parse(readFileSync(dataPath, "utf-8")) as CityEntry[];
} catch {
  // Fallback if file not found (e.g., during testing)
  CITIES = [
    { city: "Santiago", country: "Chile", continent: "South America" },
    { city: "Stockholm", country: "Sweden", continent: "Europe" },
    { city: "Seoul", country: "South Korea", continent: "Asia" },
    { city: "Munich", country: "Germany", continent: "Europe" },
    { city: "Tokyo", country: "Japan", continent: "Asia" },
    { city: "Paris", country: "France", continent: "Europe" },
    { city: "Berlin", country: "Germany", continent: "Europe" },
    { city: "London", country: "United Kingdom", continent: "Europe" },
    { city: "Rome", country: "Italy", continent: "Europe" },
    { city: "Dublin", country: "Ireland", continent: "Europe" },
  ];
}

// Build lookup maps
const CITY_MAP = new Map<string, CityEntry>();
for (const entry of CITIES) {
  CITY_MAP.set(entry.city.toLowerCase(), entry);
}

const LETTERS_WITH_CITIES = [
  ...new Set(CITIES.map((c) => c.city[0].toUpperCase())),
];

// ── Generation ─────────────────────────────────────────────────────────────

export function generateComputedFieldChallenge(
  chain?: ChainContext
): ChallengeParams {
  let startLetter: string;
  let continent: string | undefined;

  if (chain?.extractedData?.primaryEntity) {
    // Chain from a constrained text round: use first letter of entity
    const entity = chain.extractedData.primaryEntity as string;
    startLetter = entity[0]?.toUpperCase() ?? "S";
    // Only use this letter if we have cities starting with it
    if (!LETTERS_WITH_CITIES.includes(startLetter)) {
      startLetter =
        LETTERS_WITH_CITIES[
          Math.floor(Math.random() * LETTERS_WITH_CITIES.length)
        ];
    }
  } else if (chain?.extractedData?.country) {
    // Chain from another computed-field: use a different letter
    const country = chain.extractedData.country as string;
    // Pick a letter different from the country's first letter
    const available = LETTERS_WITH_CITIES.filter(
      (l) => l !== country[0]?.toUpperCase()
    );
    startLetter =
      available[Math.floor(Math.random() * available.length)] ??
      LETTERS_WITH_CITIES[
        Math.floor(Math.random() * LETTERS_WITH_CITIES.length)
      ];
  } else {
    startLetter =
      LETTERS_WITH_CITIES[
        Math.floor(Math.random() * LETTERS_WITH_CITIES.length)
      ];
  }

  // Optionally constrain by continent
  const continents = [
    ...new Set(
      CITIES.filter(
        (c) => c.city[0].toUpperCase() === startLetter
      ).map((c) => c.continent)
    ),
  ];
  if (continents.length > 1 && Math.random() > 0.5) {
    continent = continents[Math.floor(Math.random() * continents.length)];
  }

  const continentClause = continent ? ` in ${continent}` : "";
  const prompt = `Respond with ONLY a JSON object (no markdown, no explanation): {"city": "<a real city starting with '${startLetter}'${continentClause}>", "country": "<the country>", "letter_count": <number of letters in the city name, spaces excluded>, "ascii_sum": <sum of ASCII values of the lowercase city name, spaces excluded>}. Ensure the computed fields are mathematically correct.`;

  return {
    type: "computed_field",
    prompt,
    maxTokens: 100,
    expectedConstraints: {
      startLetter,
      continent,
    },
  };
}

// ── Verification ───────────────────────────────────────────────────────────

export function verifyComputedField(
  response: string,
  constraints: Record<string, unknown>
): { passed: boolean; checks: CheckResult[]; extractedData: Record<string, unknown> } {
  const checks: CheckResult[] = [];
  const extractedData: Record<string, unknown> = {};

  // Strip markdown code fences if present
  let cleaned = response.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  // Check 1: JSON validity
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
    checks.push({ name: "json_valid", passed: true });
  } catch {
    checks.push({
      name: "json_valid",
      passed: false,
      expected: "valid JSON",
      actual: "parse error",
    });
    return { passed: false, checks, extractedData };
  }

  // Check 2: Required fields present
  const requiredFields = ["city", "country", "letter_count", "ascii_sum"];
  const missingFields = requiredFields.filter((f) => !(f in parsed));
  checks.push({
    name: "schema",
    passed: missingFields.length === 0,
    expected: requiredFields.join(", "),
    actual: missingFields.length > 0 ? `missing: ${missingFields.join(", ")}` : "all present",
  });
  if (missingFields.length > 0) {
    return { passed: false, checks, extractedData };
  }

  const city = String(parsed.city);
  const country = String(parsed.country);
  const letterCount = Number(parsed.letter_count);
  const asciiSum = Number(parsed.ascii_sum);

  extractedData.city = city;
  extractedData.country = country;
  extractedData.letterCount = letterCount;

  // Check 3: Starting letter
  const expectedLetter = (constraints.startLetter as string).toUpperCase();
  checks.push({
    name: "starting_letter",
    passed: city[0]?.toUpperCase() === expectedLetter,
    expected: expectedLetter,
    actual: city[0]?.toUpperCase() ?? "",
  });

  // Check 4: Letter count (spaces excluded)
  const actualLetterCount = city.replace(/\s/g, "").length;
  checks.push({
    name: "letter_count",
    passed: letterCount === actualLetterCount,
    expected: String(actualLetterCount),
    actual: String(letterCount),
  });

  // Check 5: ASCII sum (lowercase, spaces excluded)
  const actualAsciiSum = [...city.toLowerCase().replace(/\s/g, "")].reduce(
    (sum, ch) => sum + ch.charCodeAt(0),
    0
  );
  // Allow ±2 tolerance for minor encoding differences
  checks.push({
    name: "ascii_sum",
    passed: Math.abs(asciiSum - actualAsciiSum) <= 2,
    expected: String(actualAsciiSum),
    actual: String(asciiSum),
  });

  // Check 6: City plausibility (check against our dataset)
  const knownCity = CITY_MAP.get(city.toLowerCase());
  if (knownCity) {
    // If we know the city, verify the country matches
    checks.push({
      name: "city_country_match",
      passed: knownCity.country.toLowerCase() === country.toLowerCase(),
      expected: knownCity.country,
      actual: country,
    });
  } else {
    // Unknown city — soft pass (we can't verify every city in the world)
    checks.push({
      name: "city_country_match",
      passed: true,
      actual: `${city} not in lookup table — accepted`,
    });
  }

  const passed = checks.every((c) => c.passed);
  return { passed, checks, extractedData };
}
