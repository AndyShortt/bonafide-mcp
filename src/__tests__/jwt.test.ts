/**
 * Tests for JWT credential issuance and verification.
 */

import { describe, it, expect } from "vitest";
import { issueToken, verifyToken } from "../credentials/jwt.js";
import type { VerificationSession } from "../session/manager.js";

function makeSession(
  overrides: Partial<VerificationSession> = {}
): VerificationSession {
  return {
    sessionId: "test-session-id",
    mode: "sampling",
    config: {
      difficulty: "standard",
      totalRounds: 3,
      timeBudgetMs: 5000,
    },
    status: "passed",
    rounds: [
      {
        roundIndex: 0,
        challengeType: "constrained_text",
        challenge: {
          type: "constrained_text",
          prompt: "test",
          maxTokens: 80,
          expectedConstraints: {},
        },
        result: {
          passed: true,
          response: "test",
          checks: [],
          timeMs: 50,
        },
      },
      {
        roundIndex: 1,
        challengeType: "computed_field",
        challenge: {
          type: "computed_field",
          prompt: "test",
          maxTokens: 100,
          expectedConstraints: {},
        },
        result: {
          passed: true,
          response: "test",
          checks: [],
          timeMs: 60,
        },
      },
      {
        roundIndex: 2,
        challengeType: "constrained_text",
        challenge: {
          type: "constrained_text",
          prompt: "test",
          maxTokens: 80,
          expectedConstraints: {},
        },
        result: {
          passed: false,
          response: "test",
          checks: [],
          timeMs: 70,
        },
      },
    ],
    currentRound: 2,
    startedAt: Date.now() - 2500,
    completedAt: Date.now(),
    ...overrides,
  };
}

describe("issueToken", () => {
  it("returns a signed JWT string", () => {
    const session = makeSession();
    const { token, payload, expiresAt } = issueToken(session);

    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // header.payload.signature
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(payload.bonafide.version).toBe("1.0");
  });

  it("includes correct round counts in payload", () => {
    const session = makeSession();
    const { payload } = issueToken(session);

    // 2 of 3 rounds passed (third was set to failed)
    expect(payload.bonafide.rounds_passed).toBe(2);
    expect(payload.bonafide.rounds_total).toBe(3);
  });

  it("includes mode and difficulty in payload", () => {
    const session = makeSession();
    const { payload } = issueToken(session);

    expect(payload.bonafide.mode).toBe("sampling");
    expect(payload.bonafide.difficulty).toBe("standard");
  });

  it("sets a 15-minute expiry by default", () => {
    const session = makeSession();
    const { payload } = issueToken(session);

    const expectedExp = payload.iat + 15 * 60;
    expect(payload.exp).toBe(expectedExp);
  });

  it("uses the session ID in the subject", () => {
    const session = makeSession({ sessionId: "abc-123" });
    const { payload } = issueToken(session);

    expect(payload.sub).toBe("bonafide_session_abc-123");
  });
});

describe("verifyToken", () => {
  it("returns payload for a valid token", () => {
    const session = makeSession();
    const { token } = issueToken(session);

    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.bonafide.version).toBe("1.0");
  });

  it("returns null for a tampered token", () => {
    const session = makeSession();
    const { token } = issueToken(session);

    // Tamper with the payload section
    const parts = token.split(".");
    parts[1] = parts[1] + "tampered";
    const tamperedToken = parts.join(".");

    expect(verifyToken(tamperedToken)).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(verifyToken("not.a.jwt")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });

  it("roundtrips: issue then verify preserves payload", () => {
    const session = makeSession();
    const { token, payload: original } = issueToken(session);

    const verified = verifyToken(token);
    expect(verified?.sub).toBe(original.sub);
    expect(verified?.bonafide.rounds_passed).toBe(
      original.bonafide.rounds_passed
    );
    expect(verified?.bonafide.difficulty).toBe(original.bonafide.difficulty);
  });
});
