/**
 * BonafideMCP Server
 *
 * Defines the MCP server and its three tools (agent_verification,
 * submit_response, check_status) and two resources (bonafide://token,
 * bonafide://status). Handles both sampling mode — where challenges are
 * pushed directly into the agent's LLM via sampling/createMessage — and
 * tool-based fallback mode for clients that don't declare sampling capability.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateChainedChallenge, getSequence } from "./challenges/chain.js";
import type { ChallengeType } from "./challenges/types.js";
import { verifyResponse, evaluateSession } from "./verification/verifier.js";
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
  isSessionPastDeadline,
  isRoundTimedOut,
  ROUND_TIMEOUT_MS,
  type SessionMode,
} from "./session/manager.js";
import { issueToken } from "./credentials/jwt.js";

// ── Server creation ────────────────────────────────────────────────────────

export function createBonafideMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "bonafide-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: { subscribe: true },
      },
    }
  );

  // ── Tool: agent_verification ───────────────────────────────────────────

  server.tool(
    "agent_verification",
    "Begin agent verification. The server will issue challenges via sampling (preferred) or tool responses (fallback). Complete all rounds within the time budget to receive a verification token.",
    {
      difficulty: z
        .enum(["lightweight", "standard"])
        .default("standard")
        .describe("Verification difficulty level"),
    },
    async (args, extra) => {
      const difficulty = args.difficulty;

      // Determine mode: does the client support sampling?
      const clientCapabilities = extra.server.getClientCapabilities?.();
      const hasSampling = !!clientCapabilities?.sampling;
      const mode: SessionMode = hasSampling ? "sampling" : "tool_based";

      // Create and start session (may throw if at capacity)
      let session;
      try {
        session = createSession(difficulty, mode);
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Server at capacity — too many concurrent sessions. Please try again later.",
              }),
            },
          ],
        };
      }
      startSession(session.sessionId);

      if (mode === "sampling") {
        // ── Sampling mode: run full verification inline ──────────────
        return await runSamplingVerification(session.sessionId, difficulty, extra);
      } else {
        // ── Tool-based fallback: return first challenge ──────────────
        return runToolBasedFirstRound(session.sessionId, difficulty);
      }
    }
  );

  // ── Tool: submit_response (fallback mode only) ─────────────────────────

  server.tool(
    "submit_response",
    "Submit a response to a verification challenge. Only used when sampling is not available (tool-based fallback mode).",
    {
      session_id: z.string().describe("The verification session ID"),
      response: z.string().describe("Your response to the challenge"),
    },
    async (args) => {
      const session = getSession(args.session_id);
      if (!session) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Session not found",
                session_id: args.session_id,
              }),
            },
          ],
        };
      }

      if (session.mode !== "tool_based") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error:
                  "submit_response is only available in tool-based fallback mode",
              }),
            },
          ],
        };
      }

      if (session.status !== "in_progress") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `Session is ${session.status}, not in_progress`,
              }),
            },
          ],
        };
      }

      return await handleToolBasedResponse(session.sessionId, args.response);
    }
  );

  // ── Tool: check_status ─────────────────────────────────────────────────

  server.tool(
    "check_status",
    "Check whether the current session is verified and return token status.",
    {
      session_id: z
        .string()
        .optional()
        .describe("Session ID (optional — returns most recent if omitted)"),
    },
    async (args) => {
      const sessionId = args.session_id;
      if (!sessionId) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "No session_id provided",
              }),
            },
          ],
        };
      }

      const summary = getSessionSummary(sessionId);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(summary, null, 2) },
        ],
      };
    }
  );

  // ── Resource: bonafide://token/{session_id} ────────────────────────────

  server.resource(
    "verification-token",
    "bonafide://token/{session_id}",
    { description: "Signed JWT verification credential" },
    async (uri) => {
      const sessionId = uri.pathname.split("/").pop();
      if (!sessionId) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify({ error: "Invalid session ID in URI" }),
              mimeType: "application/json",
            },
          ],
        };
      }

      const session = getSession(sessionId);
      if (!session) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify({ error: "Session not found" }),
              mimeType: "application/json",
            },
          ],
        };
      }

      if (session.status !== "passed" || !session.token) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify({
                error: "No token available",
                status: session.status,
              }),
              mimeType: "application/json",
            },
          ],
        };
      }

      // Check if token has expired
      if (session.tokenExpiresAt && Date.now() > session.tokenExpiresAt) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify({
                error: "Token expired — re-verification required",
              }),
              mimeType: "application/json",
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: uri.href,
            text: session.token,
            mimeType: "application/jwt",
          },
        ],
      };
    }
  );

  // ── Resource: bonafide://status/{session_id} ───────────────────────────

  server.resource(
    "verification-status",
    "bonafide://status/{session_id}",
    { description: "Verification status metadata" },
    async (uri) => {
      const sessionId = uri.pathname.split("/").pop();
      if (!sessionId) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify({ error: "Invalid session ID in URI" }),
              mimeType: "application/json",
            },
          ],
        };
      }

      const summary = getSessionSummary(sessionId);
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(summary, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  return server;
}

// ── Sampling mode verification ─────────────────────────────────────────────

async function runSamplingVerification(
  sessionId: string,
  difficulty: string,
  extra: { server: { createMessage: (params: unknown) => Promise<unknown> } & Record<string, unknown> }
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const session = getSession(sessionId)!;
  const sequence = getSequence(difficulty);
  const results: Array<{ passed: boolean }> = [];

  let previousResponse: string | undefined;
  let previousType: ChallengeType | undefined;

  for (let i = 0; i < sequence.length; i++) {
    // Enforce hard session deadline before starting each round
    if (isSessionPastDeadline(sessionId)) {
      const failResult = {
        passed: false,
        response: "",
        checks: [{ name: "session_deadline", passed: false, actual: "session time budget exceeded" }],
        timeMs: 0,
      };
      for (let j = i; j < sequence.length; j++) {
        const stub = generateChainedChallenge(j, difficulty, previousResponse, previousType);
        recordRoundStart(sessionId, j, stub);
        recordRoundResult(sessionId, j, "", failResult);
        results.push({ passed: false });
      }
      break;
    }

    // Generate challenge (chained from previous response if applicable)
    const challenge = generateChainedChallenge(
      i,
      difficulty,
      previousResponse,
      previousType
    );
    const roundStartMs = Date.now();
    recordRoundStart(sessionId, i, challenge);

    // Push challenge via sampling/createMessage with per-round timeout
    let samplingResult: unknown;
    try {
      const samplingPromise = extra.server.createMessage({
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: challenge.prompt },
          },
        ],
        maxTokens: challenge.maxTokens,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Round timed out")), ROUND_TIMEOUT_MS)
      );
      samplingResult = await Promise.race([samplingPromise, timeoutPromise]);
    } catch (err) {
      // Sampling failed or timed out — record as failed round
      const failResult = {
        passed: false,
        response: "",
        checks: [
          {
            name: "sampling_error",
            passed: false,
            actual: String(err),
          },
        ],
        timeMs: Date.now() - roundStartMs,
      };
      recordRoundResult(sessionId, i, "", failResult);
      results.push({ passed: false });
      previousType = challenge.type;
      continue;
    }

    // Extract text from sampling response
    const responseText = extractSamplingResponseText(samplingResult);

    // Verify the response
    const result = await verifyResponse(challenge, responseText, roundStartMs);
    recordRoundResult(sessionId, i, responseText, result);
    results.push({ passed: result.passed });

    previousResponse = responseText;
    previousType = challenge.type;
  }

  // Evaluate session
  const totalTimeMs = getElapsedMs(sessionId);
  const verdict = evaluateSession(
    results,
    totalTimeMs,
    session.config.timeBudgetMs,
    session.config.totalRounds
  );

  completeSession(sessionId, verdict.passed);

  if (verdict.passed) {
    const { token, expiresAt } = issueToken(getSession(sessionId)!);
    setSessionToken(sessionId, token, expiresAt);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            verified: true,
            session_id: sessionId,
            token_resource_uri: `bonafide://token/${sessionId}`,
            ...getSessionSummary(sessionId),
          }),
        },
      ],
    };
  } else {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            verified: false,
            session_id: sessionId,
            reason: verdict.reason,
            ...getSessionSummary(sessionId),
          }),
        },
      ],
    };
  }
}

// ── Tool-based fallback ────────────────────────────────────────────────────

function runToolBasedFirstRound(
  sessionId: string,
  difficulty: string
): { content: Array<{ type: "text"; text: string }> } {
  const challenge = generateChainedChallenge(0, difficulty);
  recordRoundStart(sessionId, 0, challenge);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          session_id: sessionId,
          mode: "tool_based",
          round: 1,
          total_rounds: getSequence(difficulty).length,
          challenge: challenge.prompt,
          instructions:
            "Respond to this challenge by calling the submit_response tool with your answer and this session_id.",
        }),
      },
    ],
  };
}

async function handleToolBasedResponse(
  sessionId: string,
  responseText: string
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const session = getSession(sessionId)!;
  const currentRound = session.currentRound;
  const round = session.rounds[currentRound];

  if (!round) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "No pending challenge for this session",
          }),
        },
      ],
    };
  }

  // Enforce hard session deadline
  if (isSessionPastDeadline(sessionId)) {
    completeSession(sessionId, false);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            verified: false,
            session_id: sessionId,
            reason: "Session time budget exceeded",
            ...getSessionSummary(sessionId),
          }),
        },
      ],
    };
  }

  // Enforce per-round timeout
  if (isRoundTimedOut(sessionId, currentRound)) {
    const failResult = {
      passed: false,
      response: responseText,
      checks: [{ name: "round_timeout", passed: false, actual: "Round exceeded 30s timeout" }],
      timeMs: Date.now() - (round.startedAt ?? Date.now()),
    };
    recordRoundResult(sessionId, currentRound, responseText, failResult);

    // Continue to next round or finish (don't abort the whole session for one timeout)
  }

  // Verify the response (skip if already recorded as timed out above)
  const roundStartMs = round.startedAt ?? Date.now();
  const alreadyRecorded = !!session.rounds[currentRound]?.result;
  const result = alreadyRecorded
    ? session.rounds[currentRound].result!
    : await verifyResponse(round.challenge, responseText, roundStartMs);
  if (!alreadyRecorded) {
    recordRoundResult(sessionId, currentRound, responseText, result);
  }

  const sequence = getSequence(session.config.difficulty);
  const nextRound = currentRound + 1;

  // Check if we have more rounds
  if (nextRound < sequence.length) {
    // Generate next challenge (chained)
    const nextChallenge = generateChainedChallenge(
      nextRound,
      session.config.difficulty,
      responseText,
      round.challenge.type
    );
    recordRoundStart(sessionId, nextRound, nextChallenge);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            session_id: sessionId,
            round_completed: currentRound + 1,
            round_passed: result.passed,
            round: nextRound + 1,
            total_rounds: sequence.length,
            challenge: nextChallenge.prompt,
            instructions:
              "Respond to this challenge by calling submit_response with your answer.",
          }),
        },
      ],
    };
  }

  // All rounds complete — evaluate
  const results = session.rounds.map((r) => ({
    passed: r.result?.passed ?? false,
  }));
  const totalTimeMs = getElapsedMs(sessionId);
  const verdict = evaluateSession(
    results,
    totalTimeMs,
    session.config.timeBudgetMs,
    session.config.totalRounds
  );

  completeSession(sessionId, verdict.passed);

  if (verdict.passed) {
    const { token, expiresAt } = issueToken(getSession(sessionId)!);
    setSessionToken(sessionId, token, expiresAt);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            verified: true,
            session_id: sessionId,
            token_resource_uri: `bonafide://token/${sessionId}`,
            ...getSessionSummary(sessionId),
          }),
        },
      ],
    };
  } else {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            verified: false,
            session_id: sessionId,
            reason: verdict.reason,
            ...getSessionSummary(sessionId),
          }),
        },
      ],
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractSamplingResponseText(result: unknown): string {
  if (!result || typeof result !== "object") return "";

  const r = result as Record<string, unknown>;

  // McpServer createMessage returns { content: { type, text }, ... }
  if (r.content && typeof r.content === "object") {
    const content = r.content as Record<string, unknown>;
    if (content.type === "text" && typeof content.text === "string") {
      return content.text;
    }
  }

  // Or it might be { content: [{ type, text }] }
  if (Array.isArray(r.content)) {
    for (const item of r.content) {
      if (
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).type === "text"
      ) {
        return String((item as Record<string, unknown>).text ?? "");
      }
    }
  }

  // Try model field (some SDK versions)
  if (typeof r.text === "string") return r.text;

  return JSON.stringify(result);
}
