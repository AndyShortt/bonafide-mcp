# BonafideMCP

**Proof of AI Agent through MCP-native multi-turn verification.**

BonafideMCP is an open-source [MCP server](https://modelcontextprotocol.io) that verifies whether a connecting system is a genuine AI agent — not merely a proxy relaying to a remote LLM API. It does this by using MCP's `sampling/createMessage` primitive to push chained challenges directly into the agent's LLM runtime within an established session.

## The Idea

Existing reverse CAPTCHAs ([MoltCaptcha](https://moltcaptcha.com), Clawptcha, BOTCHA) use HTTP challenge-response. A thin proxy (~20 lines of Python) can beat them by forwarding challenges to any LLM API. No session, no state, no agent required.

BonafideMCP moves verification inside the MCP session:

1. **Session binding** — The proxy must implement a full MCP client with Sampling capability, not a thin HTTP relay.
2. **Server-pushed challenges** — The server controls when challenges arrive via `sampling/createMessage`, rather than the client pulling at its own pace.
3. **Latency compounding** — Each of 2–3 chained rounds depends on the previous response. Proxy relay overhead (200–500ms/round) accumulates to a measurable signal.

Challenge designs are adapted from [MoltCaptcha's SMHL approach](https://moltcaptcha.com) and credited as prior art. The contribution is the delivery mechanism and session architecture, not the challenges themselves.

## Quick Start

```bash
npm install bonafide-mcp
```

### Add to your MCP client

```json
{
  "mcpServers": {
    "bonafide": {
      "command": "npx",
      "args": ["bonafide-mcp"]
    }
  }
}
```

### Run directly

```bash
npx bonafide-mcp
```

## How It Works

### Sampling Mode (Preferred)

When the connecting client declares Sampling support, verification runs automatically within a single `agent_verification` tool call:

```
Agent                              BonafideMCP Server
  │  tools/call: "agent_verification"  │
  │ ───────────────────────────────────▸│  Starts timer
  │                                     │
  │  sampling/createMessage (Round 1)   │
  │ ◂───────────────────────────────────│  Constrained text challenge
  │  Response ─────────────────────────▸│  Verify deterministically
  │                                     │
  │  sampling/createMessage (Round 2)   │
  │ ◂───────────────────────────────────│  Depends on Round 1
  │  Response ─────────────────────────▸│  Verify deterministically
  │                                     │
  │  sampling/createMessage (Round 3)   │
  │ ◂───────────────────────────────────│  Depends on Round 2
  │  Response ─────────────────────────▸│  Verify · Stop timer
  │                                     │
  │  Tool result: ✓ verified            │
  │  { token_uri: "bonafide://..." }   │
  │ ◂───────────────────────────────────│
```

### Tool-Based Fallback

When Sampling isn't available, verification falls back to a tool-based flow where challenges are embedded in tool responses:

```
Agent → tools/call: "agent_verification"  → gets Round 1 challenge
Agent → tools/call: "submit_response"     → gets Round 2 challenge
Agent → tools/call: "submit_response"     → gets Round 3 challenge or result
```

Same challenges, same chaining, but reduced proxy resistance (closer to HTTP-based).

## Tools

| Tool | Description |
|---|---|
| `agent_verification` | Start verification. Accepts `difficulty`: `"lightweight"` (2 rounds, 3s) or `"standard"` (3 rounds, 5s). |
| `submit_response` | Submit a challenge response (tool-based fallback only). |
| `check_status` | Check verification status for a session. |

## Resources

| URI | Description |
|---|---|
| `bonafide://token/{session_id}` | Signed JWT credential (available after passing verification). |
| `bonafide://status/{session_id}` | Session status metadata. |

## Challenge Types

### Constrained Text Generation (SMHL-Inspired)

Generate text satisfying simultaneous semantic and structural constraints: a topic, a starting letter, an exact word count, and a required keyword. Adapted from [MoltCaptcha's SMHL](https://moltcaptcha.com) approach.

### Computed-Field Structured Output

Produce a JSON object where some fields require world knowledge (a real city, its country) and others are mathematical derivations (letter count, ASCII sum). Verified by deterministic computation.

### Chaining

Each round's challenge is generated from the previous round's verified response. This creates serial dependencies that cannot be parallelized, compounds proxy relay latency, and requires full context maintenance.

## Configuration

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `BONAFIDE_JWT_SECRET` | `bonafide-mcp-dev-secret-...` | JWT signing secret (change in production!) |
| `BONAFIDE_ISSUER` | `bonafide.localhost` | JWT issuer claim |

## Project Structure

```
bonafide-mcp/
├── src/
│   ├── index.ts                  # Entry point (stdio transport)
│   ├── server.ts                 # MCP server: tools, resources, verification flow
│   ├── challenges/
│   │   ├── types.ts              # Shared types and config
│   │   ├── constrained-text.ts   # SMHL-inspired text challenges
│   │   ├── computed-field.ts     # Structured JSON challenges
│   │   └── chain.ts             # Round chaining logic
│   ├── verification/
│   │   └── verifier.ts          # Response verification engine
│   ├── session/
│   │   └── manager.ts           # Session state management
│   └── credentials/
│       └── jwt.ts               # JWT issuance and validation
├── data/
│   └── cities.json              # City/country lookup for computed-field challenges
├── website/                     # Static landing page (Cloudscape Design System)
├── package.json
└── tsconfig.json
```

## Prior Art & Credits

BonafideMCP builds on work by others:

- **[MoltCaptcha](https://moltcaptcha.com)** — SMHL challenges. BonafideMCP's challenge types are directly inspired by this approach.
- **[aCAPTCHA](https://arxiv.org/abs/2603.07116)** — HTTP-based multi-round verification with cross-round dependency.
- **IETF Web Bot Auth** — Cryptographic agent identity (complementary to BonafideMCP).
- **[Model Context Protocol](https://modelcontextprotocol.io)** — The protocol that makes this approach possible.

## Limitations

BonafideMCP is not unbreakable. A sufficiently motivated adversary with a fast LLM endpoint and an optimized MCP relay could potentially pass verification. The system raises the bar significantly compared to HTTP-based verification, but it is not a cryptographic guarantee.

For stronger assurance, combine BonafideMCP with cryptographic identity (Web Bot Auth, client certificates).

## License

MIT
