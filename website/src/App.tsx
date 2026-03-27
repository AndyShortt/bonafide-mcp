import React from "react";
import AppLayout from "@cloudscape-design/components/app-layout";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Box from "@cloudscape-design/components/box";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Link from "@cloudscape-design/components/link";
import Button from "@cloudscape-design/components/button";
import Badge from "@cloudscape-design/components/badge";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import CodeView from "./CodeView";
import VerificationDiagram from "./VerificationDiagram";

const GITHUB_URL = "https://github.com/AndyShortt/bonafide-mcp";

export default function App() {
  return (
    <AppLayout
      navigationHide
      toolsHide
      content={
        <ContentLayout
          header={
            <Header
              variant="h1"
              description="Concept implementation of agent verification using multi-turn MCP challenges"
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Badge color="green">Open Source</Badge>
                  <Button
                    variant="primary"
                    iconName="external"
                    href={GITHUB_URL}
                    target="_blank"
                  >
                    View on GitHub
                  </Button>
                </SpaceBetween>
              }
            >
              BonafideMCP
            </Header>
          }
        >
          <SpaceBetween size="l">
            {/* What is it */}
            <Container>
              <SpaceBetween size="m">
                <Header variant="h2">What is BonafideMCP?</Header>
                <Box variant="p">
                  BonafideMCP is a concept implementation of{" "}
                  <strong>AI agent verification using the Model Context
                  Protocol (MCP)</strong>. It demonstrates how MCP's{" "}
                  <code>sampling/createMessage</code> primitive can be used to
                  conduct multi-turn, chained verification challenges within a
                  persistent bidirectional session — verifying that a connecting
                  system is a genuine AI agent with an LLM runtime, not just a
                  thin proxy.
                </Box>
                <Box variant="p">
                  The approach builds on established verification techniques
                  (constrained text generation, structured output challenges)
                  and explores what becomes possible when these challenges are
                  delivered through MCP's Sampling primitive rather than
                  traditional HTTP request-response. The key properties this
                  enables are session binding, server-pushed challenges, and
                  latency compounding through chained rounds.
                </Box>
              </SpaceBetween>
            </Container>

            {/* How it works */}
            <Container>
              <SpaceBetween size="m">
                <Header variant="h2">How It Works</Header>
                <ColumnLayout columns={3} variant="text-grid">
                  <div>
                    <Box variant="h3">1. Connect</Box>
                    <Box variant="p">
                      An AI agent connects to the BonafideMCP server via MCP
                      and declares its capabilities, including Sampling support.
                    </Box>
                  </div>
                  <div>
                    <Box variant="h3">2. Challenge</Box>
                    <Box variant="p">
                      The server pushes 2–3 chained challenges via{" "}
                      <code>sampling/createMessage</code>. Each round depends
                      on the previous response — no pre-computation possible.
                    </Box>
                  </div>
                  <div>
                    <Box variant="h3">3. Verify</Box>
                    <Box variant="p">
                      Responses are verified deterministically (no server-side
                      LLM). On success, a signed JWT credential is issued as an
                      MCP Resource for federated trust.
                    </Box>
                  </div>
                </ColumnLayout>
              </SpaceBetween>
            </Container>

            {/* Verification Flow Diagram */}
            <Container>
              <SpaceBetween size="m">
                <Header variant="h2">Verification Flow</Header>
                <Box variant="p">
                  The server uses MCP Sampling to push challenges directly into
                  the agent's LLM runtime. Each round's challenge depends on
                  the previous response, creating a serial dependency chain
                  within a single tool call.
                </Box>
                <VerificationDiagram />
              </SpaceBetween>
            </Container>

            {/* Challenge Types */}
            <Container>
              <SpaceBetween size="m">
                <Header variant="h2">Challenge Types</Header>
                <Box variant="p">
                  BonafideMCP uses two established challenge approaches,
                  adapted for delivery within an MCP Sampling session.
                </Box>
                <ExpandableSection headerText="Constrained Text Generation">
                  <SpaceBetween size="s">
                    <Box variant="p">
                      The server asks the agent's LLM to generate text
                      satisfying simultaneous semantic and structural
                      constraints — a topic, a starting letter, an exact word
                      count, and a required keyword.
                    </Box>
                    <CodeView
                      language="json"
                      code={`{
  "method": "sampling/createMessage",
  "params": {
    "messages": [{
      "role": "user",
      "content": {
        "type": "text",
        "text": "Write a sentence about astronomy that starts with 'T', contains exactly 11 words, and includes 'orbit'."
      }
    }],
    "maxTokens": 60
  }
}`}
                    />
                    <Box variant="p">
                      Verification is fully deterministic: check starting
                      letter, word count, required word presence, and topic
                      relevance. No LLM needed on the server.
                    </Box>
                  </SpaceBetween>
                </ExpandableSection>
                <ExpandableSection headerText="Computed-Field Structured Output">
                  <SpaceBetween size="s">
                    <Box variant="p">
                      Requires a JSON object where some fields need world
                      knowledge (a real city, its country) and others are
                      mathematical derivations (letter count, ASCII sum).
                    </Box>
                    <CodeView
                      language="json"
                      code={`{
  "method": "sampling/createMessage",
  "params": {
    "messages": [{
      "role": "user",
      "content": {
        "type": "text",
        "text": "Respond with ONLY a JSON object: {\\"city\\": \\"<real city starting with 'S'>\\", \\"country\\": \\"<country>\\", \\"letter_count\\": <letters in city>, \\"ascii_sum\\": <ASCII sum of lowercase city>}"
      }
    }],
    "maxTokens": 80
  }
}`}
                    />
                    <Box variant="p">
                      Verified by JSON parsing, schema checks, and
                      mathematical validation — all deterministic, under 5ms.
                    </Box>
                  </SpaceBetween>
                </ExpandableSection>
              </SpaceBetween>
            </Container>

            {/* Quick Start */}
            <Container>
              <SpaceBetween size="m">
                <Header variant="h2">Quick Start</Header>
                <CodeView
                  language="bash"
                  code={`# Install
npm install bonafide-mcp

# Add to your MCP client configuration
{
  "mcpServers": {
    "bonafide": {
      "command": "npx",
      "args": ["bonafide-mcp"]
    }
  }
}

# Or run directly
npx bonafide-mcp`}
                />
                <Box variant="p">
                  The server exposes three tools:{" "}
                  <code>agent_verification</code>, <code>submit_response</code>{" "}
                  (fallback), and <code>check_status</code>. If the connecting
                  client supports MCP Sampling, verification happens
                  automatically via server-pushed challenges. If not, a
                  tool-based fallback is available.
                </Box>
              </SpaceBetween>
            </Container>

            {/* Credits */}
            <Container>
              <SpaceBetween size="m">
                <Header variant="h2">Credits</Header>
                <Box variant="p">
                  BonafideMCP is inspired by and builds upon the work of others
                  in the agent verification space.
                </Box>
                <ColumnLayout columns={2} variant="text-grid">
                  <div>
                    <Box variant="h4">Verification Techniques</Box>
                    <Box variant="p">
                      The challenge types used in BonafideMCP draw heavily from{" "}
                      <Link href="https://moltcaptcha.com" external>
                        MoltCaptcha
                      </Link>
                      's Semantic-Mathematical Hybrid Lock (SMHL) approach for
                      constrained text generation and mathematical verification.
                    </Box>
                    <Box variant="p">
                      Multi-round chaining with cross-round dependency builds on
                      ideas explored in{" "}
                      <Link href="https://arxiv.org/abs/2603.07116" external>
                        aCAPTCHA
                      </Link>{" "}
                      and related academic work on sequential verification
                      protocols.
                    </Box>
                  </div>
                  <div>
                    <Box variant="h4">Protocol &amp; Infrastructure</Box>
                    <Box variant="p">
                      Built on the{" "}
                      <Link href="https://modelcontextprotocol.io" external>
                        Model Context Protocol
                      </Link>{" "}
                      — the open standard for connecting AI agents to tools and
                      data sources. MCP's Sampling primitive is the foundation
                      that makes this approach possible.
                    </Box>
                    <Box variant="p">
                      For cryptographic agent identity (a complementary
                      approach), see the{" "}
                      <strong>IETF Web Bot Auth</strong> working group's draft
                      specifications on HTTP-based agent authentication.
                    </Box>
                  </div>
                </ColumnLayout>
              </SpaceBetween>
            </Container>

            {/* Footer */}
            <Box textAlign="center" padding={{ vertical: "l" }}>
              <SpaceBetween size="xs" direction="horizontal" alignItems="center">
                <span>MIT License</span>
                <span>·</span>
                <Link href={GITHUB_URL} external>
                  GitHub
                </Link>
                <span>·</span>
                <span>Built by Andrew Shortt</span>
              </SpaceBetween>
            </Box>
          </SpaceBetween>
        </ContentLayout>
      }
    />
  );
}
