import React from "react";

/**
 * Verification Flow Diagram
 *
 * Renders a clean SVG sequence diagram showing the BonafideMCP
 * verification flow. Styled to match the Humanloop/MCP blog
 * diagram aesthetic: white background, colored bordered boxes,
 * clean sans-serif font, crisp arrow lines.
 */

const COLORS = {
  agentBox: "#4A6CF7",      // Blue for agent-side
  serverBox: "#E8710A",     // Orange for server-side
  arrowRight: "#4A6CF7",
  arrowLeft: "#E8710A",
  lifeline: "#CBD5E1",
  bg: "#FFFFFF",
  text: "#1E293B",
  labelText: "#64748B",
  roundBg: "#F8FAFC",
  roundBorder: "#E2E8F0",
  successGreen: "#16A34A",
};

export default function VerificationDiagram() {
  const w = 780;
  const h = 620;
  const agentX = 180;
  const serverX = 600;
  const startY = 90;
  const rowH = 42;

  // Helper: arrow with label
  function arrow(
    x1: number,
    x2: number,
    y: number,
    label: string,
    note: string,
    direction: "right" | "left"
  ) {
    const color = direction === "right" ? COLORS.arrowRight : COLORS.arrowLeft;
    const midX = (x1 + x2) / 2;
    const headSize = 8;
    return (
      <g key={`arrow-${y}-${label}`}>
        <line
          x1={x1}
          y1={y}
          x2={x2 - (direction === "right" ? headSize : -headSize)}
          y2={y}
          stroke={color}
          strokeWidth={1.5}
        />
        {direction === "right" ? (
          <polygon
            points={`${x2},${y} ${x2 - headSize},${y - headSize / 2} ${x2 - headSize},${y + headSize / 2}`}
            fill={color}
          />
        ) : (
          <polygon
            points={`${x2},${y} ${x2 + headSize},${y - headSize / 2} ${x2 + headSize},${y + headSize / 2}`}
            fill={color}
          />
        )}
        <text
          x={midX}
          y={y - 8}
          textAnchor="middle"
          fontSize="12"
          fontWeight="600"
          fontFamily="Inter, system-ui, sans-serif"
          fill={COLORS.text}
        >
          {label}
        </text>
        {note && (
          <text
            x={direction === "right" ? x2 + 8 : x2 - 8}
            y={y + 4}
            textAnchor={direction === "right" ? "start" : "end"}
            fontSize="10.5"
            fontFamily="Inter, system-ui, sans-serif"
            fill={COLORS.labelText}
          >
            {note}
          </text>
        )}
      </g>
    );
  }

  let y = startY;
  const rows: React.ReactNode[] = [];

  // Row 1: MCP Initialize
  rows.push(arrow(agentX, serverX, y, "MCP Initialize (declares sampling)", "", "right"));
  y += rowH;

  // Row 2: Initialize Response
  rows.push(arrow(serverX, agentX, y, "Initialize Response (tools, resources)", "", "left"));
  y += rowH + 10;

  // Row 3: agent_verification call
  rows.push(arrow(agentX, serverX, y, 'tools/call: "agent_verification"', "", "right"));
  y += rowH - 5;

  // Timer start note
  rows.push(
    <text
      key="timer"
      x={serverX + 10}
      y={y}
      fontSize="11"
      fontFamily="Inter, system-ui, sans-serif"
      fontWeight="600"
      fill={COLORS.serverBox}
    >
      Starts timer
    </text>
  );
  y += rowH - 8;

  // Round 1
  const round1Y = y - 6;
  rows.push(arrow(serverX, agentX, y, "sampling/createMessage", "Round 1", "left"));
  y += rowH;
  rows.push(arrow(agentX, serverX, y, "Response", "Verify deterministically", "right"));
  y += rowH;
  const round1EndY = y - 6;

  // Round 1 bracket
  rows.push(
    <g key="round1-bg">
      <rect
        x={24}
        y={round1Y - 14}
        width={52}
        height={round1EndY - round1Y + 12}
        rx={6}
        fill={COLORS.roundBg}
        stroke={COLORS.roundBorder}
        strokeWidth={1}
      />
      <text
        x={50}
        y={(round1Y + round1EndY) / 2 + 3}
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fontFamily="Inter, system-ui, sans-serif"
        fill={COLORS.labelText}
      >
        R1
      </text>
    </g>
  );

  // Round 2
  const round2Y = y - 6;
  rows.push(arrow(serverX, agentX, y, "sampling/createMessage", "Depends on R1", "left"));
  y += rowH;
  rows.push(arrow(agentX, serverX, y, "Response", "Verify deterministically", "right"));
  y += rowH;
  const round2EndY = y - 6;

  rows.push(
    <g key="round2-bg">
      <rect
        x={24}
        y={round2Y - 14}
        width={52}
        height={round2EndY - round2Y + 12}
        rx={6}
        fill={COLORS.roundBg}
        stroke={COLORS.roundBorder}
        strokeWidth={1}
      />
      <text
        x={50}
        y={(round2Y + round2EndY) / 2 + 3}
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fontFamily="Inter, system-ui, sans-serif"
        fill={COLORS.labelText}
      >
        R2
      </text>
    </g>
  );

  // Round 3
  const round3Y = y - 6;
  rows.push(arrow(serverX, agentX, y, "sampling/createMessage", "Depends on R2", "left"));
  y += rowH;
  rows.push(arrow(agentX, serverX, y, "Response", "Verify + Stop timer", "right"));
  y += rowH;
  const round3EndY = y - 6;

  rows.push(
    <g key="round3-bg">
      <rect
        x={24}
        y={round3Y - 14}
        width={52}
        height={round3EndY - round3Y + 12}
        rx={6}
        fill={COLORS.roundBg}
        stroke={COLORS.roundBorder}
        strokeWidth={1}
      />
      <text
        x={50}
        y={(round3Y + round3EndY) / 2 + 3}
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fontFamily="Inter, system-ui, sans-serif"
        fill={COLORS.labelText}
      >
        R3
      </text>
    </g>
  );

  // Result
  y += 4;
  rows.push(
    <g key="result">
      <line
        x1={serverX}
        y1={y}
        x2={agentX + 8}
        y2={y}
        stroke={COLORS.successGreen}
        strokeWidth={2}
      />
      <polygon
        points={`${agentX},${y} ${agentX + 10},${y - 5} ${agentX + 10},${y + 5}`}
        fill={COLORS.successGreen}
      />
      <text
        x={(agentX + serverX) / 2}
        y={y - 9}
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fontFamily="Inter, system-ui, sans-serif"
        fill={COLORS.successGreen}
      >
        Verified + JWT Token
      </text>
    </g>
  );

  return (
    <svg
      viewBox={`0 0 ${w} ${y + 30}`}
      width="100%"
      style={{
        maxWidth: w,
        background: COLORS.bg,
        borderRadius: 12,
        border: `1px solid ${COLORS.roundBorder}`,
      }}
    >
      {/* Agent header box */}
      <rect
        x={agentX - 70}
        y={16}
        width={140}
        height={36}
        rx={8}
        fill="white"
        stroke={COLORS.agentBox}
        strokeWidth={2}
      />
      <text
        x={agentX}
        y={39}
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fontFamily="Inter, system-ui, sans-serif"
        fill={COLORS.agentBox}
      >
        AI Agent
      </text>

      {/* Server header box */}
      <rect
        x={serverX - 80}
        y={16}
        width={160}
        height={36}
        rx={8}
        fill="white"
        stroke={COLORS.serverBox}
        strokeWidth={2}
      />
      <text
        x={serverX}
        y={39}
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fontFamily="Inter, system-ui, sans-serif"
        fill={COLORS.serverBox}
      >
        BonafideMCP Server
      </text>

      {/* Lifelines */}
      <line
        x1={agentX}
        y1={56}
        x2={agentX}
        y2={y + 20}
        stroke={COLORS.lifeline}
        strokeWidth={1.5}
        strokeDasharray="6,4"
      />
      <line
        x1={serverX}
        y1={56}
        x2={serverX}
        y2={y + 20}
        stroke={COLORS.lifeline}
        strokeWidth={1.5}
        strokeDasharray="6,4"
      />

      {rows}
    </svg>
  );
}
