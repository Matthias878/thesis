import React, { useEffect, useRef, useState } from "react";
import { useUploads } from "../api/useUploads";
import {
  sidebar,
  divider,
  sectionTitle,
  labelGrid,
  labelHint,
  select,
  selectOption,
  smallMuted,
  uploadHint,
  backendRowInStatus,
  backendDotSmall,
  backendTextEllipsis,
  hoverBlock,
  hoverLine,
  button,
} from "../styles/appStyles";

function FileUploadInline({
  file,
  setFile,
  onUpload,
  busy,
  accept,
  label = "Datei auswählen",
  buttonText = "Hochladen",
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>{label}</span>
        <input
          type="file"
          accept={accept}
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
        type="button"
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
        {busy ? "Lade hoch..." : buttonText}
      </button>

      {file && (
        <div style={{ color: "rgba(255,255,255,0.70)", fontSize: 12 }}>
          Ausgewählt: <span style={{ color: "white" }}>{file.name}</span>
        </div>
      )}
    </div>
  );
}

function ConsoleBoxInline({ lines }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
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

export default function Sidebar({
  showUuidPicker,
  availableTilesets,
  selectedUuid,
  handleUuidSelect,
  tilesetFetchInFlight,
  addLog,
  refreshTilesets,
  waitForHiGlassTilesetInfo,
  setSelectedUuid,
  setLogoUid,
  setMatrixUid,
  currentSelectedUuid,
  matrixUid,
  matrixEnabled,
  lineModeEnabled,
  canActivateLines,
  toggleMatrixMode,
  toggleLineMode,
  logs,
  posLeft,
  posRight,
  backendDotColor,
  backendText,
  hoverDisplay,
  clickedDisplay,
  chromosomeName,
  fastaFile,
  setFastaFile,
  fastaBusy,
  handleFastaUpload,
  fastaContent,
}) {
  const [busyMain, setBusyMain] = useState(false);
  const [busyLogo, setBusyLogo] = useState(false);
  const [busyMatrix, setBusyMatrix] = useState(false);

  const [file, setFile] = useState(null);
  const [logoTrackFile, setLogoTrackFile] = useState(null);
  const [npyMatrixFile, setNpyMatrixFile] = useState(null);

  const { handleUpload, handleLogoTrackUpload, handleNpyMatrixUpload } = useUploads({
    addLog,
    refreshTilesets,
    setSelectedUuid,
    waitForHiGlassTilesetInfo,
    selectedUuid: currentSelectedUuid,
    setLogoUid,
    setMatrixUid,
    ensureMatrixMode: (enabled) => {
      if (Boolean(enabled) !== matrixEnabled) {
        toggleMatrixMode();
      }
    },
    ensureLineMode: (enabled) => {
      const want = Boolean(enabled);
      if (want && !canActivateLines) {
        addLog?.("ensureLineMode(true) blocked: canActivateLines=false");
        return;
      }
      if (want !== lineModeEnabled) {
        toggleLineMode();
      }
    },
    applySingleMatrixNow: (heatmapUid, mvUid) => {
      if (!heatmapUid || !mvUid) return;

      setSelectedUuid(heatmapUid);
      setMatrixUid(mvUid);

      if (!matrixEnabled) toggleMatrixMode();
      if (lineModeEnabled) toggleLineMode();
    },
  });

  const cellValue = (v) => {
    if (v instanceof Error) return `Error: ${v.message}`;
    if (v == null) return "—";
    return String(v);
  };

  const formatRelativePosition = (display) => {
    if (!display) return "—";
    const x = display.cellX ?? "—";
    const y = display.cellY ?? "—";
    return `${x},${y}`;
  };

  const formatAbsolutePosition = (display) => {
    if (!display) return "—";

    if (display.absoluteStart != null || display.absoluteEnd != null) {
      const start = display.absoluteStart ?? "—";
      const end = display.absoluteEnd ?? "—";
      return `${start},${end}`;
    }

    if (display.absoluteCoordinateBase != null) {
      const x = display.cellX ?? 0;
      const y = display.cellY ?? 0;
      return `${display.absoluteCoordinateBase + x},${display.absoluteCoordinateBase + y}`;
    }

    return "—";
  };

  const formatDisplayLine = (display) => {
    if (!display) {
      return "absolute position: — | relative position: — | value: —";
    }

    return `absolute position: ${formatAbsolutePosition(display)} | relative position: ${formatRelativePosition(display)} | value: ${cellValue(display.value)}`;
  };

  const onHeatmapUpload = async () => {
    await handleUpload({ file, setBusy: setBusyMain });
  };

  const onLogoUpload = async () => {
    await handleLogoTrackUpload({
      logoTrackFile,
      setBusy: setBusyLogo,
    });
  };

  const onMatrixUpload = async () => {
    await handleNpyMatrixUpload({
      npyMatrixFile,
      setBusy: setBusyMatrix,
    });
  };

  return (
    <aside style={sidebar}>
      {showUuidPicker && (
        <>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={sectionTitle}>UUID / Tileset (heatmap)</div>

            <label style={labelGrid}>
              <span style={labelHint}>Select uuid</span>
              <select value={selectedUuid || ""} onChange={handleUuidSelect} style={select}>
                {availableTilesets.length === 0 ? (
                  <option value={selectedUuid || ""} style={selectOption}>
                    {selectedUuid || "—"}
                  </option>
                ) : (
                  availableTilesets.map((t, i) => {
                    const value = t?.uuid ?? t?.uid ?? "";
                    return (
                      <option key={value || `tileset-${i}`} value={value} style={selectOption}>
                        {value || "(missing uuid)"}
                      </option>
                    );
                  })
                )}
              </select>
            </label>

            <div style={smallMuted}>
              Loaded tilesets: {availableTilesets.length || 0}
              {tilesetFetchInFlight ? " · updating…" : ""}
            </div>
          </div>

          <div style={divider} />
        </>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        <div style={sectionTitle}>main heatmap upload Nx3xNx4.npy file</div>
        <FileUploadInline
          file={file}
          setFile={setFile}
          onUpload={onHeatmapUpload}
          busy={busyMain}
          accept=".npy"
        />
      </div>

      <div style={divider} />

      <div style={{ display: "grid", gap: 8 }}>
        <div style={sectionTitle}>logo track upload Nx4.npy file</div>
        <div style={uploadHint}>.npy shape N×4</div>
        <FileUploadInline
          file={logoTrackFile}
          setFile={setLogoTrackFile}
          onUpload={onLogoUpload}
          busy={busyLogo}
          accept=".npy"
        />
      </div>

      <div style={divider} />

      <div style={{ display: "grid", gap: 8 }}>
        <div style={sectionTitle}>matrix upload NxK.npy file</div>
        <FileUploadInline
          file={npyMatrixFile}
          setFile={setNpyMatrixFile}
          onUpload={onMatrixUpload}
          busy={busyMatrix}
          accept=".npy"
        />

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={toggleMatrixMode}
            style={button}
            title={matrixUid ? `matrixUid=${matrixUid}` : ""}
          >
            {matrixEnabled ? "matrix tracks: on" : "matrix tracks: off"}
          </button>

          <button
            type="button"
            onClick={toggleLineMode}
            disabled={!canActivateLines}
            style={{
              ...button,
              opacity: canActivateLines ? 1 : 0.4,
              cursor: canActivateLines ? "pointer" : "not-allowed",
            }}
          >
            {lineModeEnabled ? "line mode: on" : "line mode: off"}
          </button>
        </div>

        <div style={smallMuted}>matrixUid: {matrixUid || "—"}</div>
      </div>

      <div style={divider} />

      <div
        style={{
          display: "grid",
          gap: 10,
          padding: 12,
          borderRadius: 12,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <div style={sectionTitle}>sequence upload {">name:startpos-endpos\\nSEQ.fasta file"}</div>

        <FileUploadInline
          file={fastaFile}
          setFile={setFastaFile}
          onUpload={handleFastaUpload}
          busy={fastaBusy}
          accept=".fasta,.fa,.txt"
        />

        {fastaContent && (
          <div style={{ marginTop: 10, color: "rgba(255,255,255,0.70)", fontSize: 12 }}></div>
        )}
      </div>

      <div style={divider} />

      <div style={hoverBlock}>
        <div>Hover cell: {formatDisplayLine(hoverDisplay)}</div>
        <div style={hoverLine}>Last click: {formatDisplayLine(clickedDisplay)}</div>
        <div style={hoverLine}>
          <div style={hoverLine}>chromosome name: {chromosomeName || "unknown"}</div>
        </div>
      </div>

      <div style={divider} />

      <ConsoleBoxInline lines={logs} />

      <div style={divider} />

      <div style={backendRowInStatus}>
        <span style={backendDotSmall(backendDotColor)} />
        <div style={backendTextEllipsis}>Server test: {backendText}</div>
      </div>
    </aside>
  );
}