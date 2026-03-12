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
  busyMain,
  busyLogo,
  backendText,
  backendDotColor,
  pos,
  posLeft,
  posRight,
  selectedUuid,
  addLog,
}) {
  return (
    <div style={advancedWrap}>
      <div style={advancedCard}>
        <div style={advancedRow}>
          <div style={advancedRowLeft}>
            <button onClick={reloadViewer} style={button} disabled={busyMain || busyLogo}>
              reload viewer
            </button>

            <button onClick={toggleUuidPicker} style={button} disabled={busyMain || busyLogo}>
              {showUuidPicker ? "hide uuid picker" : "show uuid picker"}
            </button>

            <button onClick={toggleLogoTracks} style={button} disabled={busyMain || busyLogo}>
              {logoActivated ? "logo tracks: on" : "logo tracks: off"}
            </button>

            <button onClick={onToggleMatrix} style={button} disabled={busyMain || busyLogo}>
              {matrixEnabled ? "matrix tracks: on" : "matrix tracks: off"}
            </button>

            <button
              onClick={onToggleLineMode}
              style={button}
              disabled={busyMain || busyLogo || !canActivateLines}
            >
              {lineModeEnabled ? "line mode: on" : "line mode: off"}
            </button>

            <button onClick={onToggleSequenz} style={button} disabled={busyMain || busyLogo}>
              {sequenzActivated ? "sequence track: on" : "sequence track: off"}
            </button>
          </div>

          <div style={advancedRowRight}>
            <button onClick={() => runAction("convert", convertPt)} style={button}>
              convert pt
            </button>

            <button onClick={() => runAction("convert", convertNpy)} style={button}>
              convert npy
            </button>

            <button onClick={() => runAction("reupload", reupload)} style={button}>
              reupload
            </button>

            <button
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

        <div style={advancedMeta}>
          <div style={serverText}>
            server: <span style={{ opacity: 0.9 }}>{HIGLASS_SERVER}</span>
          </div>

          <div style={backendMeta}>
            <span style={backendDot(backendDotColor)} />
            <span style={backendTextStyle}>{backendText}</span>
          </div>

          <div>
            pos:{" "}
            {pos && posLeft != null && posRight != null
              ? `${posLeft}..${posRight}${pos?.span != null ? ` (span ${pos.span})` : ""}`
              : "—"}
          </div>

          <div style={{ opacity: 0.85 }}>heatmap={selectedUuid || "—"}</div>
        </div>
      </div>
    </div>
  );
}