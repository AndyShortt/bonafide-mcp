# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

BonafideMCP is an MCP (Model Context Protocol) server that implements a reverse-CAPTCHA: multi-turn, chained verification challenges that prove a connecting system is an LLM-based AI agent rather than a human or traditional bot. On success, it issues a signed ES256 JWT credential.

## Commands

```bash
npm run build              # Compile TypeScript to dist/
npm run dev                # Run directly via tsx (no compile step)
npm run start              # Run compiled server
npm run test               # Unit tests (mocked embeddings)
npm run test:watch         # Unit tests in watch mode
npm run test:integration   # Integration tests (loads real ML model, ~30s first run)
npm run website:dev        # Landing page dev server
npm run website:build      # Build landing page
```

Run a single test file:
```bash
npx vitest run src/__tests__/session-manager.test.ts
```

## Architecture

### Two Verification Modes

**Sampling Mode (preferred):** The server uses MCP's `sampling/createMessage` to push challenges directly into the connecting agent's LLM context. The entire multi-round session runs inline inside the `agent_verification` tool call.

**Tool-Based Mode (fallback):** For clients without sampling support, challenges are returned as tool responses. The agent calls `submit_response` once per round to advance through the session.

### Challenge Types

1. **Constrained Text** (`src/challenges/constrained-text.ts`): Generate a single sentence satisfying four simultaneous constraints — starting letter, exact word count, required keyword, and topic coherence. Topic coherence is checked via cosine similarity using the `all-MiniLM-L6-v2` sentence embedding model (threshold ≥ 0.4).

2. **Computed Field** (`src/challenges/computed-field.ts`): Return a JSON object with a named city/country (validated against `data/cities.json`) and mathematically derived fields (letter count, ASCII sum).

### Challenge Chaining

`src/challenges/chain.ts` sequences rounds and extracts data from each response (e.g., a word, a city name) to seed the next challenge's constraints. This creates serial dependencies that prevent parallelization and make timing fraud harder to hide.

- **Lightweight:** 2 rounds, alternating challenge types
- **Standard:** 3 rounds, alternating challenge types, requires N-1 rounds passed

### Session Management

`src/session/manager.ts` holds an in-memory `Map` with a 5-minute TTL per session and a hard cap of 100 concurrent sessions (DoS protection). Cleanup runs every 60 seconds. There is no persistence — sessions are lost on restart.

### JWT Credentials

After passing verification, `src/credentials/jwt.ts` issues an ES256 JWT. The private key comes from `BONAFIDE_EC_PRIVATE_KEY` env var or is auto-generated as an ephemeral key per process. Tokens expire in 15 minutes and are accessible via the `bonafide://token/{session_id}` MCP resource.

### Key Environment Variables

| Variable | Purpose |
|---|---|
| `BONAFIDE_EC_PRIVATE_KEY` | PEM-encoded EC P-256 private key for JWT signing |
| `BONAFIDE_ISSUER` | JWT issuer claim (default: `bonafide.localhost`) |

## Testing Notes

Unit tests mock the embeddings module (`src/verification/embeddings.ts`) to avoid downloading the ML model. Integration tests in `vitest.integration.config.ts` load the real `all-MiniLM-L6-v2` model and have a 120-second timeout to account for the first-run download (~23MB).

## Module System

The project uses ESM (`"type": "module"` in package.json, `"module": "Node16"` in tsconfig). Import paths in source must include `.js` extensions for compiled output compatibility.
