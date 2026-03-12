import React from "react";
import ConsoleBox from "./ConsoleBox";
import FileUpload from "./FileUpload";

import {
  sidebar,
  divider,
  sectionTitle,
  labelGrid,
  labelHint,
  select,
  smallMuted,
  uploadHint,
  statusLineOuter,
  statusEllipsis,
  backendRowInStatus,
  backendDotSmall,
  backendTextEllipsis,
  hoverBlock,
  hoverLine,
  button,
} from "../styles/appStyles";

export default function Sidebar({
  showUuidPicker,
  availableTilesets,
  selectedUuid,
  handleUuidSelect,
  tilesetFetchInFlight,
  file,
  setFile,
  handleUpload,
  logoTrackFile,
  setLogoTrackFile,
  handleLogoTrackUpload,
  npyMatrixFile,
  setNpyMatrixFile,
  handleNpyMatrixUpload,

  matrixUid,
  matrixEnabled,
  lineModeEnabled,
  onToggleMatrix,
  onToggleLineMode,
  canActivateLines,

  logs,
  pos,
  posLeft,
  posRight,
  backendDotColor,
  backendText,
  hoverCell,
  clickedCell,

  sequenzInput,
  setSequenzInput,
}) {
  const cellValue = (v) => (v instanceof Error ? `Error: ${v.message}` : v == null ? String(v) : String(v));

  return (
    <aside style={sidebar}>
      {showUuidPicker && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={sectionTitle}>UUID / Tileset (heatmap)</div>

          <label style={labelGrid}>
            <span style={labelHint}>Select uuid</span>

            <select value={selectedUuid} onChange={handleUuidSelect} style={select}>
              {availableTilesets.length === 0 ? (
                <option value={selectedUuid || ""}>{selectedUuid || "—"}</option>
              ) : (
                availableTilesets.map((t) => (
                  <option key={t.uuid} value={t.uuid}>
                    {t.uuid}
                  </option>
                ))
              )}
            </select>
          </label>

          <div style={smallMuted}>
            Loaded tilesets: {availableTilesets.length || 0}
            {tilesetFetchInFlight ? " · updating…" : ""}
          </div>
        </div>
      )}

      {showUuidPicker && <div style={divider} />}

      <div style={{ display: "grid", gap: 10 }}>
        <div style={sectionTitle}>Upload (heatmap)</div>

        <FileUpload file={file} setFile={setFile} onUpload={handleUpload} />

        <div style={divider} />

        <div style={{ display: "grid", gap: 8 }}>
          <div style={sectionTitle}>logo_track upload</div>

          <div style={uploadHint}>.npy shape N×4</div>

          <FileUpload file={logoTrackFile} setFile={setLogoTrackFile} onUpload={handleLogoTrackUpload} accept=".npy" />
        </div>
      </div>

      <div style={divider} />

      <div style={{ display: "grid", gap: 8 }}>
        <div style={sectionTitle}>.npy NxK upload (matrix)</div>

        <FileUpload file={npyMatrixFile} setFile={setNpyMatrixFile} onUpload={handleNpyMatrixUpload} accept=".npy" />

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onToggleMatrix}
            style={button}
            title={matrixUid ? `matrixUid=${matrixUid}` : ""}
          >
            {matrixEnabled ? "matrix tracks: on" : "matrix tracks: off"}
          </button>

          <button
            type="button"
            onClick={onToggleLineMode}
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

      <ConsoleBox lines={logs} />

      <div style={statusLineOuter}>
        {pos && posLeft != null && posRight != null ? (
          <div style={statusEllipsis}>
            Current position: {posLeft}..{posRight}
          </div>
        ) : (
          <div>Current position: —</div>
        )}

        <div style={backendRowInStatus}>
          <span style={backendDotSmall(backendDotColor)} />
          <div style={backendTextEllipsis}>{backendText}</div>
        </div>
      </div>

      <div style={hoverBlock}>
        <div>
          Hover cell: {hoverCell ? `${hoverCell.cellX}${hoverCell.cellY == null ? "" : `,${hoverCell.cellY}`}` : "—"}
          {" · value: "}
          {cellValue(hoverCell?.value)}
        </div>

        <div style={hoverLine}>
          Last click:{" "}
          {clickedCell ? `${clickedCell.cellX}${clickedCell.cellY == null ? "" : `,${clickedCell.cellY}`}` : "—"}
          {" · value: "}
          {cellValue(clickedCell?.value)}
        </div>
      </div>

      <div style={divider} />

      <div style={{ display: "grid", gap: 6 }}>
        <div style={sectionTitle}>sequenz</div>
        <input
          type="text"
          value={sequenzInput}
          onChange={(e) => setSequenzInput(e.target.value)}
          placeholder="ACGT..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #555",
            background: "#111",
            color: "#eee",
            outline: "none",
          }}
        />
      </div>
    </aside>
  );
}