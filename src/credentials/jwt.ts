/**
 * JWT Credential Issuance
 *
 * Issues signed JWT tokens after successful verification.
 * Tokens can be exposed as MCP Resources for federated trust propagation.
 *
 * Uses ES256 (ECDSA P-256) asymmetric signing. The server holds the private
 * key and verifying parties only need the public key.
 */

import jwt from "jsonwebtoken";
import { generateKeyPairSync, createPrivateKey, createPublicKey } from "crypto";
import type { VerificationSession } from "../session/manager.js";

const DEFAULT_ISSUER = process.env.BONAFIDE_ISSUER ?? "bonafide.localhost";
const DEFAULT_LIFETIME_SECONDS = 15 * 60; // 15 minutes

// ── Key management ────────────────────────────────────────────────────────

interface KeyPair {
  privateKey: string;
  publicKey: string;
}

/**
 * Resolve the ES256 key pair used for JWT signing and verification.
 *
 * Priority:
 *   1. BONAFIDE_EC_PRIVATE_KEY env var (PEM-encoded PKCS#8 EC private key)
 *   2. Auto-generated ephemeral key pair (logged with a startup warning)
 *
 * In production, operators MUST provide BONAFIDE_EC_PRIVATE_KEY. The
 * ephemeral fallback ensures the server can always start (useful for
 * development and testing) but tokens won't survive a restart.
 */
function resolveKeyPair(): KeyPair {
  const envKey = process.env.BONAFIDE_EC_PRIVATE_KEY;

  if (envKey) {
    // Validate that the provided key is a usable EC P-256 private key
    try {
      const privKeyObj = createPrivateKey(envKey);
      const pubKeyObj = createPublicKey(privKeyObj);
      return {
        privateKey: envKey,
        publicKey: pubKeyObj.export({ type: "spki", format: "pem" }) as string,
      };
    } catch (err) {
      throw new Error(
        `BONAFIDE_EC_PRIVATE_KEY is set but is not a valid EC private key: ${err}`
      );
    }
  }

  // No key provided — generate an ephemeral pair and warn loudly
  console.error(
    "⚠️  WARNING: BONAFIDE_EC_PRIVATE_KEY is not set. Generating an ephemeral " +
      "key pair. Tokens will NOT survive a server restart. Set BONAFIDE_EC_PRIVATE_KEY " +
      "to a PEM-encoded EC P-256 private key for production use."
  );
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return {
    privateKey: privateKey as string,
    publicKey: publicKey as string,
  };
}

const KEY_PAIR = resolveKeyPair();

/** Public key (PEM) — safe to share with verifying parties. */
export function getPublicKey(): string {
  return KEY_PAIR.publicKey;
}

// ── Token types ───────────────────────────────────────────────────────────

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

// ── Issue & verify ────────────────────────────────────────────────────────

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

  const token = jwt.sign(payload, KEY_PAIR.privateKey, {
    algorithm: "ES256",
  });

  return {
    token,
    payload,
    expiresAt: exp * 1000, // ms for session manager
  };
}

export function verifyToken(token: string): BonafideTokenPayload | null {
  try {
    const payload = jwt.verify(token, KEY_PAIR.publicKey, {
      algorithms: ["ES256"],
      issuer: DEFAULT_ISSUER,
    }) as BonafideTokenPayload;
    return payload;
  } catch {
    return null;
  }
}
