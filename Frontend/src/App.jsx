import React, { useCallback, useEffect, useState } from "react";
import "higlass/dist/hglib.css";

import AdvancedPanel from "./components/AdvancedPanel";
import Sidebar from "./components/Sidebar";
import Viewer from "./components/Viewer";

import { HIGLASS_SERVER, ts } from "./config";
import { useBackendStatus } from "./api/StatusSystem";

import { useHiGlassControllerWithFasta } from "./higlass/useHiGlassControllerWithFasta";
import { useRenderViewConfig } from "./higlass/useHeatmapViewConfig";

import { baseUrl } from "./utils/appUtils";
import {
  getBackendDotColor,
  getBackendText,
  getPosLeftRight,
} from "./utils/backendDisplay";
import { page, topbar, shell, advancedButton } from "./styles/appStyles";

export default function App() {
  const [logs, setLogs] = useState([`[${ts()}] app started`]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [viewerKey, setViewerKey] = useState(0);

  const addLog = useCallback((line) => {
    setLogs((prev) => {
      const next = [...prev, `[${ts()}] ${line}`];
      return next.length > 400 ? next.slice(-400) : next;
    });
  }, []);

  useEffect(() => {
    const base = baseUrl(HIGLASS_SERVER);
    addLog(`DEBUG HIGLASS_SERVER="${HIGLASS_SERVER}"`);
    addLog(`DEBUG tilesets="${base}/tilesets/"`);
  }, [addLog]);

  const backend = useBackendStatus({
    baseUrl: import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:8000",
    key: "current_input",
    pollMs: 1000,
    timeoutMs: 1500,
    enabled: true,
  });

  const backendDotColor = getBackendDotColor(backend);
  const backendText = getBackendText(backend);

  const reloadViewer = useCallback(() => {
    addLog("viewer reload requested");
    setViewerKey((k) => k + 1);
  }, [addLog]);

  const {
    config: viewConfig,
    main_heatmapUid,
    matrixUid,
    logo_trackUid,
    current_chromosome_object,
    lineMode,
    matrixActivated,
    logoActivated,
    sequence_trackActivated,
    canActivateLines,
    all_main_heatmapUids,
    all_matrixUids,
    all_logoUids,
    all_chromosome_objects,
    setMainHeatmapUid,
    setMatrixUid,
    setLogoTrackUid,
    set_chromosome_object,
    toggleLineMode,
    toggleMatrixMode,
    toggleLogoMode,
    toggleSequenceTrackMode,
  } = useRenderViewConfig({
    addLog,
    onConfigApplied: reloadViewer,
  });

  const {
    onHiGlassRef,
    clearApi,
    pos,
    onViewerMouseDown,
    positionDisplay,
    hoverDisplay,
    clickedDisplay,
    fastaFile,
    setFastaFile,
    fastaBusy,
    fastaContent,
    handleFastaUpload,
  } = useHiGlassControllerWithFasta({
    addLog,
    current_chromosome_object,
    set_chromosome_object,
  });

  const onToggleMatrix = useCallback(() => {
    toggleMatrixMode();
    addLog("matrix button pressed -> toggleMatrixMode()");
  }, [toggleMatrixMode, addLog]);

  const onToggleLineMode = useCallback(() => {
    if (!canActivateLines) {
      addLog("line-mode button blocked: canActivateLines=false");
      return;
    }

    toggleLineMode();
    addLog("line-mode button pressed -> toggleLineMode()");
    reloadViewer();
  }, [canActivateLines, toggleLineMode, addLog, reloadViewer]);

  const onToggleSequenz = useCallback(() => {
    toggleSequenceTrackMode();
    addLog("sequence button pressed -> toggleSequenceTrackMode()");
    reloadViewer();
  }, [toggleSequenceTrackMode, addLog, reloadViewer]);

  const toggleLogoTracks = useCallback(() => {
    toggleLogoMode();
    addLog("toggled logo tracks");
  }, [toggleLogoMode, addLog]);

  const runAction = useCallback(
    async (label, fn) => {
      try {
        const res = await fn(addLog);
        addLog(`${label} result: ${JSON.stringify(res)}`);
        console.log(res);
      } catch (e) {
        addLog(`${label} error: ${String(e)}`);
      }
    },
    [addLog]
  );

  const posSource = positionDisplay ?? pos;
  const { posLeft, posRight } = getPosLeftRight(posSource);

  const posText =
    posSource?.text ||
    (posLeft != null && posRight != null
      ? `${posLeft}..${posRight}${
          posSource?.span != null ? ` (span ${posSource.span})` : ""
        }`
      : "—");

  const fastaData = all_chromosome_objects.map((item) => item.name);

  return (
    <div style={page}>
      <div style={topbar}>
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          style={advancedButton(advancedOpen)}
        >
          advanced
        </button>
      </div>

      {advancedOpen && (
        <AdvancedPanel
          reloadViewer={reloadViewer}
          toggleLogoTracks={toggleLogoTracks}
          onToggleMatrix={onToggleMatrix}
          onToggleLineMode={onToggleLineMode}
          canActivateLines={canActivateLines}
          onToggleSequenz={onToggleSequenz}
          matrixEnabled={matrixActivated}
          lineModeEnabled={lineMode}
          sequenzActivated={sequence_trackActivated}
          logoActivated={logoActivated}
          runAction={runAction}
          logoTrackUsed={Boolean(logo_trackUid)}
          busyAny={false}
          backendText={backendText}
          backendDotColor={backendDotColor}
          posText={posText}
          selectedUuid={main_heatmapUid}
          addLog={addLog}
          fastaSequence={current_chromosome_object?.sequence || ""}
        />
      )}

      <div style={shell}>
        <Sidebar
          addLog={addLog}
          setMainHeatmapUid={setMainHeatmapUid}
          setLogoTrackUid={setLogoTrackUid}
          setMatrixUid={setMatrixUid}
          setChromosomeObject={set_chromosome_object}
          currentMainHeatmapUid={main_heatmapUid}
          currentLogoTrackUid={logo_trackUid}
          matrixUid={matrixUid}
          currentChromosomeObject={current_chromosome_object}
          matrixEnabled={matrixActivated}
          lineModeEnabled={lineMode}
          canActivateLines={canActivateLines}
          toggleMatrixMode={onToggleMatrix}
          toggleLineMode={onToggleLineMode}
          logs={logs}
          backendDotColor={backendDotColor}
          backendText={backendText}
          hoverDisplay={hoverDisplay}
          clickedDisplay={clickedDisplay}
          fastaFile={fastaFile}
          setFastaFile={setFastaFile}
          fastaBusy={fastaBusy}
          handleFastaUpload={handleFastaUpload}
          heatmapUids={all_main_heatmapUids}
          matrixUids={all_matrixUids}
          logoUids={all_logoUids}
          fastaData={fastaData}
        />

        <Viewer
          viewerKey={viewerKey}
          onHiGlassRef={onHiGlassRef}
          viewConfig={viewConfig}
          onViewerMouseDown={onViewerMouseDown}
          advancedOpen={advancedOpen}
        />
      </div>
    </div>
  );
}