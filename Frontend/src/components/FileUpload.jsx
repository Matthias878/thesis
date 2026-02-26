import React from "react";

export default function FileUpload({ file, setFile, onUpload, busy }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>Datei auswählen</span>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{
            padding: 10,
            borderRadius: 10,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "white",
          }}
        />
      </label>

      <button
        onClick={onUpload}
        disabled={!file || busy}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.14)",
          background: !file || busy ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.10)",
          color: "white",
          cursor: !file || busy ? "not-allowed" : "pointer",
          fontWeight: 600,
        }}
        title={!file ? "Bitte erst eine Datei auswählen" : ""}
      >
        {busy ? "Lade hoch..." : "Hochladen"}
      </button>

      {file && (
        <div style={{ color: "rgba(255,255,255,0.70)", fontSize: 12 }}>
          Ausgewählt: <span style={{ color: "white" }}>{file.name}</span>
        </div>
      )}
    </div>
  );
}