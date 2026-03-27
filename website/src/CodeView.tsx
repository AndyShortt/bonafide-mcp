import React from "react";
import Box from "@cloudscape-design/components/box";

/**
 * Simple code block component.
 * Cloudscape doesn't have a built-in code viewer, so we use a
 * styled <pre> block that matches the Cloudscape visual language.
 */

interface CodeViewProps {
  code: string;
  language?: string;
}

export default function CodeView({ code, language }: CodeViewProps) {
  return (
    <div
      style={{
        backgroundColor: "#0f1b2d",
        borderRadius: "8px",
        padding: "16px",
        overflow: "auto",
        position: "relative",
      }}
    >
      {language && (
        <div
          style={{
            position: "absolute",
            top: "8px",
            right: "12px",
            color: "#687078",
            fontSize: "12px",
            fontFamily: "monospace",
          }}
        >
          {language}
        </div>
      )}
      <pre
        style={{
          margin: 0,
          color: "#d1d5db",
          fontSize: "13px",
          lineHeight: "1.5",
          fontFamily:
            "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {code}
      </pre>
    </div>
  );
}
