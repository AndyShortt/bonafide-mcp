#!/usr/bin/env node

/**
 * BonafideMCP — Entry Point
 *
 * Proof of AI Agent through MCP-native multi-turn verification.
 *
 * Starts the BonafideMCP server using stdio transport.
 * To use with streamable-http transport for production, see the
 * documentation in the README.
 *
 * Usage:
 *   npx bonafide-mcp          # stdio transport (default)
 *   npx bonafide-mcp --http   # streamable-http transport (coming soon)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBonafideMcpServer } from "./server.js";

async function main(): Promise<void> {
  const server = createBonafideMcpServer();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("BonafideMCP server started (stdio transport)");
  console.error(
    "Waiting for MCP client connection..."
  );
}

main().catch((err) => {
  console.error("Fatal error starting BonafideMCP:", err);
  process.exit(1);
});
