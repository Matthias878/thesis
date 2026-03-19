import React, { useCallback, useEffect, useRef, useState } from "react";
import "higlass/dist/hglib.css";

import AdvancedPanel from "./components/AdvancedPanel";
import Sidebar from "./components/Sidebar";
import Viewer from "./components/Viewer";

import { HIGLASS_SERVER, ts } from "./config";
import { useBackendStatus } from "./api/StatusSystem";
import {
  convertNpy,
  convertPt,
  reupload,
  waitForHiGlassTilesetInfo,
} from "./api/higlassApi";

import { useTilesets } from "./higlass/useTilesets";
import { useHiGlassController } from "./higlass/useHiGlassControllerWithFasta";
import {
  useHeatmapViewConfig,
  useTilesetInfo,
} from "./higlass/useHeatmapViewConfig";

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
  const [sequenceOverrideInput, setSequenceOverrideInput] = useState("");
  const [sequenceOverrideApplied, setSequenceOverrideApplied] = useState("");
  const [matrixUid, setMatrixUid] = useState("");
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

  const {
    availableTilesets,
    selectedUuid,
    setSelectedUuid,
    showUuidPicker,
    toggleUuidPicker,
    tilesetFetchInFlight,
    refreshTilesets,
  } = useTilesets(addLog);

  const backend = useBackendStatus({
    baseUrl: import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:8000",
    key: "current_input",
    pollMs: 1000,
    timeoutMs: 1500,
    enabled: true,
  });

  const backendDotColor = getBackendDotColor(backend);
  const backendText = getBackendText(backend);

  const {
    onHiGlassRef,
    clearApi,
    pos,
    onViewerMouseDown,
    positionDisplay,
    hoverDisplay,
    clickedDisplay,
    fastaMeta,
    fastaFile,
    setFastaFile,
    fastaBusy,
    fastaContent,
    handleFastaUpload,
  } = useHiGlassController({ addLog });

  const reloadViewer = useCallback(() => {
    addLog("viewer reload requested");
    clearApi();
    setViewerKey((k) => k + 1);
  }, [addLog, clearApi]);

  const effectiveSequence =
    sequenceOverrideApplied.trim() || fastaMeta.sequence || "";

  const {
    config: viewConfig,
    setHeatmapUid,
    setMatrixUidAndRowcount,
    setLogoUid,
    toggleLineMode,
    toggleMatrixMode,
    toggleLogoMode,
    toggleSequenzMode,
    matrixActivated,
    lineMode,
    canActivateLines,
    sequenzActivated,
    logoActivated,
    logoTilesetUid,
  } = useHeatmapViewConfig({
    addLog,
    sequenz: effectiveSequence,
  });

  const { rowCount: matrixRowCount } = useTilesetInfo(matrixUid, {
    enabled: Boolean(matrixUid),
    addLog,
    timeoutMs: 60000,
    intervalMs: 1000,
  });

  useEffect(() => {
    setHeatmapUid(selectedUuid || null);
  }, [selectedUuid, setHeatmapUid]);

  useEffect(() => {
    if (!matrixUid) {
      setMatrixUidAndRowcount(null, 0);
      return;
    }
    setMatrixUidAndRowcount(matrixUid, matrixRowCount || 0);
  }, [matrixUid, matrixRowCount, setMatrixUidAndRowcount]);

  const applySequenceOverride = useCallback(() => {
    const next = sequenceOverrideInput.trim();
    setSequenceOverrideApplied(next);
    addLog(
      next
        ? `sequence override applied (${next.length} chars)`
        : "sequence override cleared -> using FASTA sequence"
    );
    reloadViewer();
  }, [sequenceOverrideInput, addLog, reloadViewer]);

  const clearSequenceOverride = useCallback(() => {
    setSequenceOverrideInput("");
    setSequenceOverrideApplied("");
    addLog("sequence override cleared -> using FASTA sequence");
    reloadViewer();
  }, [addLog, reloadViewer]);

  const waitForTilesetInfo = useCallback(
    (uids, options = {}) =>
      waitForHiGlassTilesetInfo(uids, {
        addLog,
        onReady: reloadViewer,
        ...options,
      }),
    [addLog, reloadViewer]
  );

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
    toggleSequenzMode();
    addLog("sequence button pressed -> toggleSequenzMode()");
    reloadViewer();
  }, [toggleSequenzMode, addLog, reloadViewer]);

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

  const handleUuidSelect = useCallback(
    (e) => {
      const newUid = e.target.value;
      addLog(`switching heatmap tilesetUid -> "${newUid}"`);
      setSelectedUuid(newUid);
    },
    [addLog, setSelectedUuid]
  );

  const selectedPresenceRef = useRef({ uid: null, wasPresent: false });

  useEffect(() => {
    const uid = selectedUuid;
    if (!uid) return;

    if (selectedPresenceRef.current.uid !== uid) {
      selectedPresenceRef.current = { uid, wasPresent: false };
    }

    const isPresent = availableTilesets.some(
      (t) => (t?.uuid ?? t?.uid) === uid
    );

    if (!selectedPresenceRef.current.wasPresent && isPresent) {
      selectedPresenceRef.current.wasPresent = true;
      addLog(
        `selectedUuid "${uid}" appeared in availableTilesets -> reloading viewer`
      );
      reloadViewer();
      return;
    }

    selectedPresenceRef.current.wasPresent = isPresent;
  }, [selectedUuid, availableTilesets, addLog, reloadViewer]);

  const posSource = positionDisplay ?? pos;
  const { posLeft, posRight } = getPosLeftRight(posSource);

  const posText =
    posSource?.text ||
    (posLeft != null && posRight != null
      ? `${posLeft}..${posRight}${
          posSource?.span != null ? ` (span ${posSource.span})` : ""
        }`
      : "—");

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
          toggleUuidPicker={toggleUuidPicker}
          toggleLogoTracks={toggleLogoTracks}
          onToggleMatrix={onToggleMatrix}
          onToggleLineMode={onToggleLineMode}
          canActivateLines={canActivateLines}
          onToggleSequenz={onToggleSequenz}
          matrixEnabled={matrixActivated}
          lineModeEnabled={lineMode}
          sequenzActivated={sequenzActivated}
          logoActivated={logoActivated}
          runAction={runAction}
          convertPt={convertPt}
          convertNpy={convertNpy}
          reupload={reupload}
          showUuidPicker={showUuidPicker}
          logoTrackUsed={Boolean(logoTilesetUid)}
          busyAny={false}
          backendText={backendText}
          backendDotColor={backendDotColor}
          posText={posText}
          selectedUuid={selectedUuid}
          addLog={addLog}
          sequenceOverrideInput={sequenceOverrideInput}
          setSequenceOverrideInput={setSequenceOverrideInput}
          sequenceOverrideApplied={sequenceOverrideApplied}
          fastaSequence={fastaMeta.sequence || ""}
          onApplySequenceOverride={applySequenceOverride}
          onClearSequenceOverride={clearSequenceOverride}
        />
      )}

      <div style={shell}>
        <Sidebar
          showUuidPicker={showUuidPicker}
          availableTilesets={availableTilesets}
          selectedUuid={selectedUuid}
          handleUuidSelect={handleUuidSelect}
          tilesetFetchInFlight={tilesetFetchInFlight}
          addLog={addLog}
          refreshTilesets={refreshTilesets}
          waitForHiGlassTilesetInfo={waitForTilesetInfo}
          setSelectedUuid={setSelectedUuid}
          setLogoUid={setLogoUid}
          setMatrixUid={setMatrixUid}
          currentSelectedUuid={selectedUuid}
          matrixUid={matrixUid}
          matrixEnabled={matrixActivated}
          lineModeEnabled={lineMode}
          canActivateLines={canActivateLines}
          toggleMatrixMode={onToggleMatrix}
          toggleLineMode={onToggleLineMode}
          logs={logs}
          posLeft={posLeft}
          posRight={posRight}
          backendDotColor={backendDotColor}
          backendText={backendText}
          hoverDisplay={hoverDisplay}
          clickedDisplay={clickedDisplay}
          chromosomeName={fastaMeta.chromosomeName}
          fastaFile={fastaFile}
          setFastaFile={setFastaFile}
          fastaBusy={fastaBusy}
          handleFastaUpload={handleFastaUpload}
          fastaContent={fastaContent}
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