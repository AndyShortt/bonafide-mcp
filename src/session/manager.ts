/**
 * Verification Session Manager
 *
 * Manages the state of verification sessions including round tracking,
 * timing, and credential issuance.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  ChallengeParams,
  ChallengeResult,
  VerificationConfig,
  ChallengeType,
} from "../challenges/types.js";
import { DIFFICULTY_CONFIG } from "../challenges/types.js";

export type SessionMode = "sampling" | "tool_based";
export type SessionStatus =
  | "pending"
  | "in_progress"
  | "passed"
  | "failed"
  | "expired";

export interface RoundRecord {
  roundIndex: number;
  challengeType: ChallengeType;
  challenge: ChallengeParams;
  response?: string;
  result?: ChallengeResult;
  startedAt?: number;
  completedAt?: number;
}

export interface VerificationSession {
  sessionId: string;
  mode: SessionMode;
  config: VerificationConfig;
  status: SessionStatus;
  rounds: RoundRecord[];
  currentRound: number;
  startedAt?: number;
  completedAt?: number;
  /** The current pending challenge (for tool-based fallback mode) */
  pendingChallenge?: ChallengeParams;
  /** JWT token (set after successful verification) */
  token?: string;
  tokenExpiresAt?: number;
}

// ── Session store ──────────────────────────────────────────────────────────

const sessions = new Map<string, VerificationSession>();

// Auto-expire sessions after 5 minutes of inactivity
const SESSION_TTL_MS = 5 * 60 * 1000;

function cleanExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    const lastActivity =
      session.completedAt ?? session.startedAt ?? now;
    if (now - lastActivity > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function createSession(
  difficulty: string,
  mode: SessionMode
): VerificationSession {
  cleanExpiredSessions();

  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.standard;
  const session: VerificationSession = {
    sessionId: uuidv4(),
    mode,
    config,
    status: "pending",
    rounds: [],
    currentRound: 0,
  };

  sessions.set(session.sessionId, session);
  return session;
}

export function getSession(
  sessionId: string
): VerificationSession | undefined {
  return sessions.get(sessionId);
}

export function startSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  session.status = "in_progress";
  session.startedAt = Date.now();
}

export function recordRoundStart(
  sessionId: string,
  roundIndex: number,
  challenge: ChallengeParams
): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  session.rounds[roundIndex] = {
    roundIndex,
    challengeType: challenge.type,
    challenge,
    startedAt: Date.now(),
  };
  session.currentRound = roundIndex;
  session.pendingChallenge = challenge;
}

export function recordRoundResult(
  sessionId: string,
  roundIndex: number,
  response: string,
  result: ChallengeResult
): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const round = session.rounds[roundIndex];
  if (!round) throw new Error(`Round ${roundIndex} not found`);

  round.response = response;
  round.result = result;
  round.completedAt = Date.now();
  session.pendingChallenge = undefined;
}

export function completeSession(
  sessionId: string,
  passed: boolean
): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  session.status = passed ? "passed" : "failed";
  session.completedAt = Date.now();
}

export function setSessionToken(
  sessionId: string,
  token: string,
  expiresAt: number
): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  session.token = token;
  session.tokenExpiresAt = expiresAt;
}

export function getElapsedMs(sessionId: string): number {
  const session = sessions.get(sessionId);
  if (!session?.startedAt) return 0;
  return Date.now() - session.startedAt;
}

export function isWithinTimeBudget(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  return getElapsedMs(sessionId) <= session.config.timeBudgetMs;
}

export function getSessionSummary(sessionId: string): Record<string, unknown> {
  const session = sessions.get(sessionId);
  if (!session) return { error: "Session not found" };

  const roundsPassed = session.rounds.filter((r) => r.result?.passed).length;

  return {
    sessionId: session.sessionId,
    status: session.status,
    mode: session.mode,
    difficulty: session.config.difficulty,
    roundsPassed,
    roundsTotal: session.config.totalRounds,
    totalTimeMs: session.completedAt && session.startedAt
      ? session.completedAt - session.startedAt
      : undefined,
    timeBudgetMs: session.config.timeBudgetMs,
    hasToken: !!session.token,
    tokenExpiresAt: session.tokenExpiresAt
      ? new Date(session.tokenExpiresAt).toISOString()
      : undefined,
  };
}
