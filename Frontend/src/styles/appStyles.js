// src/styles/appStyles.js

export const page = {
  minHeight: "100svh",
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(80,120,255,0.16), transparent 60%), #070a0f",
  color: "white",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  display: "flex",
  flexDirection: "column",
};

// --- top/advanced area -------------------------------------------------

export const topbar = {
  flex: "0 0 auto",
  padding: "10px 14px",
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 10,
};

export const advancedButton = (pressed) => ({
  padding: "8px 12px",
  borderRadius: 999,
  fontWeight: 800,
  opacity: pressed ? 1 : 0.85,

  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  cursor: "pointer",
});

export const advancedWrap = {
  flex: "0 0 auto",
  padding: "0 14px 12px",
};

export const advancedCard = {
  borderRadius: 14,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",

  padding: 12,
  display: "grid",
  gap: 10,
};

export const advancedRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
  justifyContent: "space-between",
};

export const advancedRowLeft = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

export const advancedRowRight = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

export const advancedMeta = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  fontSize: 12,
  color: "rgba(255,255,255,0.78)",
};

export const serverText = {
  wordBreak: "break-all",
};

export const backendMeta = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

export const backendDot = (color) => ({
  width: 10,
  height: 10,
  borderRadius: 999,
  display: "inline-block",
  background: color,
  boxShadow: "0 0 0 2px rgba(255,255,255,0.08)",
});

export const backendDotSmall = (color) => ({
  width: 10,
  height: 10,
  borderRadius: 999,
  display: "inline-block",
  background: color,
  boxShadow: "0 0 0 2px rgba(255,255,255,0.08)",
  flex: "0 0 auto",
});

export const backendTextStyle = {
  wordBreak: "break-word",
};

export const divider = {
  height: 1,
  background: "rgba(255,255,255,0.10)",
};

// Wichtig: flex-row + minWidth:0 verhindert Overlap / main drückt sidebar weg
export const shell = {
  flex: "1 1 auto",
  minHeight: 0,
  display: "flex",
  alignItems: "stretch",
  gap: 14,
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  padding: 14,
};

// --- cards --------------------------------------------------------------

export const card = {
  borderRadius: 14,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
};

// Sidebar als "fixed width" flex-item, ohne overlap
export const sidebar = {
  ...card,
  padding: 14,
  display: "grid",
  gap: 14,

  flex: "0 0 360px",
  minWidth: 280,
  maxWidth: 420,

  overflowX: "hidden",
  overflowY: "visible",
};

// Main nimmt Restbreite und darf schrumpfen
export const main = {
  ...card,
  padding: 12,
  flex: "1 1 auto",
  minWidth: 0,
  overflow: "hidden",
  boxSizing: "border-box",
};

export const button = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  cursor: "pointer",
  fontWeight: 600,
};

export const select = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "white",
};

export const labelGrid = {
  display: "grid",
  gap: 6,
};

export const labelHint = {
  color: "rgba(255,255,255,0.75)",
  fontSize: 12,
};

export const sectionTitle = {
  fontWeight: 800,
  fontSize: 13,
};

export const smallMuted = {
  fontSize: 11,
  color: "rgba(255,255,255,0.60)",
};

export const uploadHint = {
  fontSize: 12,
  color: "rgba(255,255,255,0.75)",
};

// --- status line --------------------------------------------------------

export const statusLine = {
  marginTop: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(0,0,0,0.22)",
  fontSize: 12,
  color: "rgba(255,255,255,0.85)",
  lineHeight: 1.35,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

export const statusLineOuter = {
  ...statusLine,
  width: "100%",
  maxWidth: "100%",
  boxSizing: "border-box",
  overflow: "hidden",
  wordBreak: "break-word",
};

export const statusEllipsis = {
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const backendRowInStatus = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 8,
  minWidth: 0,
};

export const backendTextEllipsis = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

// --- hover/click block --------------------------------------------------

export const hoverBlock = {
  marginTop: 6,
};

export const hoverLine = {
  marginTop: 4,
};

// --- viewer -------------------------------------------------------------

export const viewerFrame = (advancedOpen) => ({
  position: "relative",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.10)",
  height: advancedOpen ? "calc(100vh - 170px)" : "calc(100vh - 110px)",
  minHeight: 520,
  background: "rgba(0,0,0,0.25)",
});