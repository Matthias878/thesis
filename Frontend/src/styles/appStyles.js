export const page = {
  height: "100svh",
  minHeight: 0,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(80,120,255,0.16), transparent 60%), #070a0f",
  color: "white",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

export const divider = {
  height: 1,
  background: "rgba(255,255,255,0.10)",
};

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
  overflow: "hidden",
};

export const card = {
  borderRadius: 14,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
};

export const sidebar = {
  ...card,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 14,
  flex: "0 0 360px",
  minWidth: 280,
  maxWidth: 420,
  minHeight: 0,
  overflowX: "hidden",
  overflowY: "auto",
};

export const main = {
  ...card,
  padding: 12,
  flex: "1 1 auto",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
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

export const toggleButtonStyle = (disabled = false) => ({
  ...button,
  ...(disabled ? { opacity: 0.4, cursor: "not-allowed" } : null),
});

export const select = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "white",
  width: "100%",
  boxSizing: "border-box",
  appearance: "auto",
  WebkitAppearance: "auto",
  MozAppearance: "auto",
};

export const selectOption = {
  color: "black",
  backgroundColor: "white",
};

export const sectionTitle = {
  fontWeight: 800,
  fontSize: 13,
};

export const sectionGrid8 = {
  display: "grid",
  gap: 8,
};

export const sectionGrid10 = {
  display: "grid",
  gap: 10,
};

export const wrapRow = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

export const uploadButton = (disabled) => ({
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: disabled ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.10)",
  color: "white",
  cursor: disabled ? "not-allowed" : "pointer",
  fontWeight: 600,
});

export const filePickerRow = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: 8,
  alignItems: "center",
  width: "100%",
};

export const hiddenFileInput = {
  display: "none",
};

export const fileNameBox = (hasFile) => ({
  minWidth: 0,
  padding: "8px 10px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: hasFile ? "white" : "rgba(255,255,255,0.65)",
  background: "rgba(255,255,255,0.04)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

export const uploadActionGrid = (showSelect) => ({
  display: "grid",
  gridTemplateColumns: showSelect ? "1fr 1fr" : "1fr",
  gap: 8,
  width: "100%",
});

export const consoleWrap = {
  flex: "1 1 220px",
  minHeight: 180,
  minWidth: 0,
};

export const consoleBox = {
  margin: 0,
  padding: 12,
  borderRadius: 10,
  background: "#0b0f14",
  color: "#9ef7a6",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  lineHeight: 1.35,
  height: "100%",
  minHeight: 180,
  overflow: "auto",
  border: "1px solid rgba(255,255,255,0.08)",
  whiteSpace: "pre-wrap",
  boxSizing: "border-box",
};

export const sidebarScrollHiddenCss = `
  .sidebar-scroll-hidden {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .sidebar-scroll-hidden::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }
`;

export const backendDotSmall = (color) => ({
  width: 10,
  height: 10,
  borderRadius: 999,
  display: "inline-block",
  background: color,
  boxShadow: "0 0 0 2px rgba(255,255,255,0.08)",
  flex: "0 0 auto",
});

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

export const hoverBlock = {
  marginTop: 6,
};

export const hoverLine = {
  marginTop: 4,
};

export const viewerFrame = () => ({
  position: "relative",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.10)",
  height: "100%",
  minHeight: 0,
  background: "rgba(0,0,0,0.25)",
});