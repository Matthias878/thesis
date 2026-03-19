import React from "react";
import {
  advancedWrap,
  advancedCard,
  advancedRow,
  advancedRowLeft,
  advancedRowRight,
  advancedMeta,
  serverText,
  backendMeta,
  backendDot,
  backendTextStyle,
  button,
} from "../styles/appStyles";
import { HIGLASS_SERVER } from "../config";

export default function AdvancedPanel({
  reloadViewer,
  toggleUuidPicker,
  toggleLogoTracks,
  onToggleMatrix,
  onToggleLineMode,
  canActivateLines,
  onToggleSequenz,
  matrixEnabled,
  lineModeEnabled,
  sequenzActivated,
  logoActivated,
  runAction,
  convertPt,
  convertNpy,
  reupload,
  showUuidPicker,
  logoTrackUsed,
  backendText,
  backendDotColor,
  posText,
  selectedUuid,
  addLog,
  sequenceOverrideInput,
  setSequenceOverrideInput,
  sequenceOverrideApplied,
  fastaSequence,
  onApplySequenceOverride,
  onClearSequenceOverride,
}) {
  return (
    <div style={advancedWrap}>
      <div style={advancedCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ color: "white", fontWeight: 800 }}>advanced</div>
          <div style={serverText}>
            server: <span style={{ opacity: 0.9 }}>{HIGLASS_SERVER}</span>
          </div>
        </div>

        <div style={advancedRow}>
          <div style={advancedRowLeft}>
            <button type="button" onClick={reloadViewer} style={button}>
              reload viewer
            </button>

            <button type="button" onClick={toggleUuidPicker} style={button}>
              {showUuidPicker ? "hide uuid picker" : "show uuid picker"}
            </button>

            <button type="button" onClick={toggleLogoTracks} style={button}>
              {logoActivated ? "logo tracks: on" : "logo tracks: off"}
            </button>

            <button type="button" onClick={onToggleMatrix} style={button}>
              {matrixEnabled ? "matrix tracks: on" : "matrix tracks: off"}
            </button>

            <button type="button" onClick={onToggleLineMode} style={button} disabled={!canActivateLines}>
              {lineModeEnabled ? "line mode: on" : "line mode: off"}
            </button>

            <button type="button" onClick={onToggleSequenz} style={button}>
              {sequenzActivated ? "sequence track: on" : "sequence track: off"}
            </button>
          </div>

          <div style={advancedRowRight}>
            <button type="button" onClick={() => runAction("convert", convertPt)} style={button}>
              convert pt
            </button>

            <button type="button" onClick={() => runAction("convert", convertNpy)} style={button}>
              convert npy
            </button>

            <button type="button" onClick={() => runAction("reupload", reupload)} style={button}>
              reupload
            </button>

            <button
              type="button"
              onClick={() => {
                addLog("LOG TEST: addLog works ✅");
                console.log("LOG TEST: console.log works ✅", { t: Date.now() });
              }}
              style={button}
            >
              log test
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <div style={{ color: "white", fontWeight: 700 }}>sequence override</div>

          <input
            type="text"
            value={sequenceOverrideInput}
            onChange={(e) => setSequenceOverrideInput(e.target.value)}
            placeholder="leave empty to use FASTA"
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

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={onApplySequenceOverride} style={button}>
              override
            </button>

            <button type="button" onClick={onClearSequenceOverride} style={button}>
              clear override
            </button>
          </div>

          <div style={{ opacity: 0.8, fontSize: 12 }}>
            source: {sequenceOverrideApplied ? "manual override" : "FASTA"}
          </div>

          <div style={{ opacity: 0.7, fontSize: 12 }}>FASTA sequence length: {fastaSequence?.length || 0}</div>

          <div style={{ opacity: 0.7, fontSize: 12 }}>
            override length: {sequenceOverrideApplied?.length || 0}
          </div>
        </div>

        <div style={advancedMeta}>
          <div style={backendMeta}>
            <span style={backendDot(backendDotColor)} />
            <span style={backendTextStyle}>{backendText}</span>
          </div>

          <div>pos: {posText}</div>
          <div style={{ opacity: 0.85 }}>heatmap={selectedUuid || "—"}</div>
          <div style={{ opacity: 0.7 }}>logoTrackUsed={logoTrackUsed ? "true" : "false"}</div>
        </div>
      </div>
    </div>
  );
}