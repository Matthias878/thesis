import React, { useEffect, useRef } from "react";

export default function ConsoleBox({ lines }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <pre
      ref={ref}
      style={{
        margin: 0,
        padding: 12,
        borderRadius: 10,
        background: "#0b0f14",
        color: "#9ef7a6",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 12,
        lineHeight: 1.35,
        maxHeight: 220,
        overflow: "auto",
        border: "1px solid rgba(255,255,255,0.08)",
        whiteSpace: "pre-wrap",
      }}
    >
      {lines.join("\n")}
    </pre>
  );
}