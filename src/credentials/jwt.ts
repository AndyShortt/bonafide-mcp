/**
 * JWT Credential Issuance
 *
 * Issues signed JWT tokens after successful verification.
 * Tokens can be exposed as MCP Resources for federated trust propagation.
 */

import jwt from "jsonwebtoken";
import type { VerificationSession } from "../session/manager.js";

// In production, this should be an environment variable or secret manager
const DEFAULT_SECRET = process.env.BONAFIDE_JWT_SECRET ?? "bonafide-mcp-dev-secret-change-in-production";
const DEFAULT_ISSUER = process.env.BONAFIDE_ISSUER ?? "bonafide.localhost";
const DEFAULT_LIFETIME_SECONDS = 15 * 60; // 15 minutes

export interface BonafideTokenPayload {
  sub: string;
  iss: string;
  iat: number;
  exp: number;
  bonafide: {
    version: string;
    rounds_passed: number;
    rounds_total: number;
    total_time_ms: number;
    mode: string;
    difficulty: string;
  };
}

export function issueToken(session: VerificationSession): {
  token: string;
  payload: BonafideTokenPayload;
  expiresAt: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + DEFAULT_LIFETIME_SECONDS;

  const roundsPassed = session.rounds.filter((r) => r.result?.passed).length;
  const totalTimeMs =
    session.completedAt && session.startedAt
      ? session.completedAt - session.startedAt
      : 0;

  const payload: BonafideTokenPayload = {
    sub: `bonafide_session_${session.sessionId}`,
    iss: DEFAULT_ISSUER,
    iat: now,
    exp,
    bonafide: {
      version: "1.0",
      rounds_passed: roundsPassed,
      rounds_total: session.config.totalRounds,
      total_time_ms: totalTimeMs,
      mode: session.mode,
      difficulty: session.config.difficulty,
    },
  };

  const token = jwt.sign(payload, DEFAULT_SECRET, {
    algorithm: "HS256",
  });

  return {
    token,
    payload,
    expiresAt: exp * 1000, // ms for session manager
  };
}

export function verifyToken(token: string): BonafideTokenPayload | null {
  try {
    const payload = jwt.verify(token, DEFAULT_SECRET, {
      algorithms: ["HS256"],
      issuer: DEFAULT_ISSUER,
    }) as BonafideTokenPayload;
    return payload;
  } catch {
    return null;
  }
}
