/**
 * Tests for session manager — lifecycle, state transitions, and queries.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createSession,
  getSession,
  startSession,
  recordRoundStart,
  recordRoundResult,
  completeSession,
  setSessionToken,
  getElapsedMs,
  getSessionSummary,
} from "../session/manager.js";
import type { ChallengeParams, ChallengeResult } from "../challenges/types.js";

const makeChallengeParams = (
  type: "constrained_text" | "computed_field" = "constrained_text"
): ChallengeParams => ({
  type,
  prompt: "test prompt",
  maxTokens: 80,
  expectedConstraints: { startLetter: "T", wordCount: 8, topic: "astronomy" },
});

const makeChallengeResult = (passed: boolean): ChallengeResult => ({
  passed,
  response: "test response",
  checks: [{ name: "test_check", passed }],
  timeMs: 50,
});

describe("session lifecycle", () => {
  it("creates a session in pending state", () => {
    const session = createSession("standard", "sampling");

    expect(session.sessionId).toBeTruthy();
    expect(session.status).toBe("pending");
    expect(session.mode).toBe("sampling");
    expect(session.config.difficulty).toBe("standard");
    expect(session.config.totalRounds).toBe(3);
    expect(session.config.timeBudgetMs).toBe(5000);
  });

  it("creates a lightweight session with correct config", () => {
    const session = createSession("lightweight", "tool_based");

    expect(session.config.difficulty).toBe("lightweight");
    expect(session.config.totalRounds).toBe(2);
    expect(session.config.timeBudgetMs).toBe(3000);
    expect(session.mode).toBe("tool_based");
  });

  it("starts a session and transitions to in_progress", () => {
    const session = createSession("standard", "sampling");
    startSession(session.sessionId);

    const updated = getSession(session.sessionId);
    expect(updated?.status).toBe("in_progress");
    expect(updated?.startedAt).toBeGreaterThan(0);
  });

  it("records round start", () => {
    const session = createSession("standard", "sampling");
    startSession(session.sessionId);

    const challenge = makeChallengeParams();
    recordRoundStart(session.sessionId, 0, challenge);

    const updated = getSession(session.sessionId)!;
    expect(updated.rounds[0]).toBeDefined();
    expect(updated.rounds[0].challengeType).toBe("constrained_text");
    expect(updated.rounds[0].startedAt).toBeGreaterThan(0);
    expect(updated.currentRound).toBe(0);
  });

  it("records round result", () => {
    const session = createSession("standard", "sampling");
    startSession(session.sessionId);

    const challenge = makeChallengeParams();
    recordRoundStart(session.sessionId, 0, challenge);

    const result = makeChallengeResult(true);
    recordRoundResult(session.sessionId, 0, "test response", result);

    const updated = getSession(session.sessionId)!;
    expect(updated.rounds[0].result?.passed).toBe(true);
    expect(updated.rounds[0].completedAt).toBeGreaterThan(0);
    expect(updated.pendingChallenge).toBeUndefined();
  });

  it("completes a session as passed", () => {
    const session = createSession("standard", "sampling");
    startSession(session.sessionId);
    completeSession(session.sessionId, true);

    const updated = getSession(session.sessionId)!;
    expect(updated.status).toBe("passed");
    expect(updated.completedAt).toBeGreaterThan(0);
  });

  it("completes a session as failed", () => {
    const session = createSession("standard", "sampling");
    startSession(session.sessionId);
    completeSession(session.sessionId, false);

    expect(getSession(session.sessionId)?.status).toBe("failed");
  });
});

describe("session token", () => {
  it("stores token and expiry", () => {
    const session = createSession("standard", "sampling");
    const expiresAt = Date.now() + 15 * 60 * 1000;
    setSessionToken(session.sessionId, "jwt.token.here", expiresAt);

    const updated = getSession(session.sessionId)!;
    expect(updated.token).toBe("jwt.token.here");
    expect(updated.tokenExpiresAt).toBe(expiresAt);
  });
});

describe("getElapsedMs", () => {
  it("returns 0 for a session that hasn't started", () => {
    const session = createSession("standard", "sampling");
    expect(getElapsedMs(session.sessionId)).toBe(0);
  });

  it("returns positive elapsed time for a started session", () => {
    const session = createSession("standard", "sampling");
    startSession(session.sessionId);

    const elapsed = getElapsedMs(session.sessionId);
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});

describe("getSessionSummary", () => {
  it("returns error for unknown session", () => {
    const summary = getSessionSummary("nonexistent-id");
    expect(summary.error).toBe("Session not found");
  });

  it("returns a complete summary for a finished session", () => {
    const session = createSession("standard", "sampling");
    startSession(session.sessionId);

    const challenge = makeChallengeParams();
    recordRoundStart(session.sessionId, 0, challenge);
    recordRoundResult(
      session.sessionId,
      0,
      "response",
      makeChallengeResult(true)
    );

    completeSession(session.sessionId, true);
    setSessionToken(session.sessionId, "tok", Date.now() + 60000);

    const summary = getSessionSummary(session.sessionId);
    expect(summary.status).toBe("passed");
    expect(summary.mode).toBe("sampling");
    expect(summary.roundsPassed).toBe(1);
    expect(summary.hasToken).toBe(true);
  });
});

describe("error handling", () => {
  it("throws when starting a nonexistent session", () => {
    expect(() => startSession("bad-id")).toThrow(/not found/);
  });

  it("throws when recording round for nonexistent session", () => {
    expect(() =>
      recordRoundStart("bad-id", 0, makeChallengeParams())
    ).toThrow(/not found/);
  });
});
