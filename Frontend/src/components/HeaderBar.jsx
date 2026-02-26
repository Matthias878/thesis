import React from "react";
import { HIGLASS_SERVER } from "../config";
import { button as buttonStyle, header as headerStyle } from "../styles/appStyles";

export default function HeaderBar({
  selectedUuid,
  showUuidPicker,
  onToggleUuidPicker,
  onReloadViewer,
  onLogTest,
  onConvertPt,
  onConvertNpy,
  onReupload,
  onToggleLogoTracks,
  logoTrackUsed,
  busyAny,
  backend,
  pos,

  // ✅ add these
  backendPollingEnabled,
  onToggleBackendPolling,
}) {
  const backendDotColor =
    backend?.level === "down"
      ? "#ff3b3b"
      : backend?.level === "busy"
      ? "#ff9f1a"
      : backend?.ok === false
      ? "#ff3b3b"
      : "#2ee66b";

  const posLeft =
    pos?.i ?? (typeof pos?.x1 === "number" ? Math.round(pos.x1) : null);
  const posRight =
    pos?.j ?? (typeof pos?.x2 === "number" ? Math.round(pos.x2) : null);

  return (
    <div style={headerStyle}>
      <div style={{ display: "grid", gap: 2 }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.2 }}>
          HiGlass Viewer
        </div>

        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.70)" }}>
          Server: <span style={{ color: "white" }}>{HIGLASS_SERVER}</span> ·
          tilesetUid: <span style={{ color: "white" }}>{selectedUuid}</span>
          {typeof backend?.ok === "boolean" && (
            <>
              {" "}
              · backend:{" "}
              <span
                style={{
                  color: backend.ok ? "white" : "rgba(255,120,120,1)",
                }}
              >
                {backend.ok ? "ok" : "down"}
              </span>
            </>
          )}
          {pos && posLeft != null && posRight != null && (
            <>
              {" "}
              · coords:{" "}
              <span style={{ color: "white" }}>
                {posLeft}–{posRight}
              </span>
            </>
          )}
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 999,
              marginLeft: 8,
              verticalAlign: "middle",
              background: backendDotColor,
              boxShadow: "0 0 0 2px rgba(255,255,255,0.08)",
            }}
            title={backend?.raw || backend?.text || (backend?.ok ? "ok" : "down")}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        {/* Keep your “big text” buttons exactly as-is (no style prop) */}
        <button onClick={onConvertPt}>
          Click here to convert the last uploaded .pt into a .mcool file format
        </button>
        <button onClick={onConvertNpy}>
          Click here to convert the last uploaded .npy into a .mcool file format
        </button>
        <button onClick={onReupload}>
          Click here to upload all converted files as new uuIDs to the higlass server
        </button>

        {/* ✅ fixed: no undefined vars, correct style */}
        <button
          type="button"
          onClick={onToggleBackendPolling}
          style={buttonStyle}
        >
          {backendPollingEnabled ? "polling: on" : "polling: off"}
        </button>

        <button style={buttonStyle} onClick={onLogTest}>
          Log test
        </button>
        <button style={buttonStyle} onClick={onReloadViewer}>
          Viewer neu laden
        </button>
        <button style={buttonStyle} onClick={onToggleUuidPicker}>
          {showUuidPicker ? "UUID schließen" : "UUID wählen"}
        </button>
        <button
          style={buttonStyle}
          onClick={onToggleLogoTracks}
          disabled={busyAny}
          title="Manually toggle extra tracks"
        >
          {logoTrackUsed ? "Tracks: ON" : "Tracks: OFF"}
        </button>
      </div>
    </div>
  );
}