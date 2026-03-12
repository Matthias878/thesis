// =============================================================================
//   IMPORTS
// =============================================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import "higlass/dist/hglib.css";
import AdvancedPanel from "./components/AdvancedPanel";
import Sidebar from "./components/Sidebar";
import Viewer from "./components/Viewer";
import { HIGLASS_SERVER, ts } from "./config";
import { useBackendStatus } from "./api/StatusSystem";
import { useTilesets } from "./higlass/useTilesets";
import { baseUrl } from "./utils/appUtils";
import { getBackendDotColor, getBackendText, getPosLeftRight } from "./utils/backendDisplay";
import { useHiGlassController } from "./higlass/useHiGlassController";
import { useHeatmapViewConfig, useTilesetInfo } from "./higlass/useHeatmapViewConfig";
import { useUploads } from "./api/useUploads";
import { convertNpy, convertPt, reupload } from "./api/higlassApi";
import { page, topbar, shell, advancedButton } from "./styles/appStyles";

// =============================================================================
//   APP
// =============================================================================

export default function App() {
  /* =======================================================================
     STATE
     ======================================================================= */

  // log buffer (capped)
  const [logs, setLogs] = useState([`[${ts()}] app started`]);
  const addLog = useCallback((line) => {
    setLogs((p) => {
      const next = [...p, `[${ts()}] ${line}`];
      return next.length > 400 ? next.slice(-400) : next;
    });
  }, []);

  // initial debug prints for base server endpoints
  useEffect(() => {
    const base = baseUrl(HIGLASS_SERVER);
    addLog(`DEBUG HIGLASS_SERVER="${HIGLASS_SERVER}"`);
    addLog(`DEBUG tilesets="${base}/tilesets/"`);
  }, [addLog]);

  // UI toggles / busy flags
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busyMain, setBusyMain] = useState(false);
  const [busyLogo, setBusyLogo] = useState(false);

  // uploads
  const [file, setFile] = useState(null);
  const [logoTrackFile, setLogoTrackFile] = useState(null);
  const [npyMatrixFile, setNpyMatrixFile] = useState(null);

  // sidebar text copied into useHeatmapViewConfig
  const [sequenzInput, setSequenzInput] = useState("ACGTACGTAACCGGTT");

  // extra track toggles / uids
  const [logoTrackUsed, setLogoTrackUsed] = useState(false);

  const [matrixUid, setMatrixUid] = useState(""); // NxK multivec uid

  // viewer reload key (App owns this now)
  const [viewerKey, setViewerKey] = useState(0);
  const bumpViewerKey = useCallback(() => setViewerKey((k) => k + 1), []);

  // SIMPLE UI STATE (no matrixMode state machine)

  /* =======================================================================
     HOOKS
     ======================================================================= */

  // tilesets picker + refresh hook
  const {
    availableTilesets,
    selectedUuid, // heatmap uid only
    setSelectedUuid,
    showUuidPicker,
    toggleUuidPicker,
    tilesetFetchInFlight,
    refreshTilesets,
  } = useTilesets(addLog);

  // backend status poller (separate from HiGlass)
  const backend = useBackendStatus({
    baseUrl: import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:8000",
    key: "current_input",
    pollMs: 1000,
    timeoutMs: 1500,
    enabled: true,
  });

  const backendDotColor = getBackendDotColor(backend);
  const backendText = getBackendText(backend);

  // HiGlass controller (refs, hover, pos, click, etc.)
  const { onHiGlassRef, clearApi, pos, hoverCell, clickedCell, onViewerMouseDown } = useHiGlassController({ addLog });
  const { posLeft, posRight } = getPosLeftRight(pos);

  // declarative view config manager
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
} = useHeatmapViewConfig({
  addLog,
  sequenz: sequenzInput,
});
  // poll tileset_info for matrix rowcount
  const { rowCount: matrixRowCount } = useTilesetInfo(matrixUid, {
    enabled: Boolean(matrixUid),
    addLog,
    timeoutMs: 60000,
    intervalMs: 1000,
  });

  // Feed heatmap uid
  useEffect(() => {
    setHeatmapUid(selectedUuid || null);
  }, [selectedUuid, setHeatmapUid]);

  // Feed matrix uid + rowcount into view-config hook
  useEffect(() => {
    if (!matrixUid) {
      setMatrixUidAndRowcount(null, 0);
      return;
    }
    setMatrixUidAndRowcount(matrixUid, matrixRowCount || 0);
  }, [matrixUid, matrixRowCount, setMatrixUidAndRowcount]);

  // hard reset viewer - works to reload viewer
  const reloadViewer = useCallback(() => {
    addLog("viewer reload requested");
    clearApi();
    bumpViewerKey();
  }, [addLog, bumpViewerKey, clearApi]);

  // TODO maybe move into different file | waitForHiGlassTilesetInfo helper
  const waitForHiGlassTilesetInfo = useCallback(
    async (uids, { timeoutMs = 60000, intervalMs = 1000 } = {}) => {
      const want = Array.isArray(uids) ? uids : [uids];
      const base = baseUrl(HIGLASS_SERVER);
      const url = `${base}/tilesets/?limit=1000`;
      const start = Date.now();

      addLog(`waitForHiGlassTilesetInfo start: want=[${want.join(", ")}] url=${url}`);

      let attempt = 0;

      while (Date.now() - start < timeoutMs) {
        attempt += 1;

        try {
          const res = await fetch(url, {
            cache: "no-store",
            headers: { Accept: "application/json" },
            credentials: "omit",
          });

          const text = await res.text();
          const snippet = text.slice(0, 200).replace(/\s+/g, " ");

          addLog(`poll ${attempt}: status=${res.status} ok=${res.ok} body="${snippet}"`);

          let data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            addLog(`poll ${attempt}: JSON parse failed (${String(e)})`);
            await new Promise((r) => setTimeout(r, intervalMs));
            continue;
          }

          const have = new Set((data?.results ?? []).map((t) => t?.uuid ?? t?.uid).filter(Boolean));
          const missing = want.filter((u) => !have.has(u));

          addLog(`poll ${attempt}: results=${data?.results?.length ?? 0} missing=[${missing.join(", ")}]`);

          if (missing.length === 0) {
            addLog(`tilesets ready -> reloading viewer`);
            reloadViewer();
            return true;
          }
        } catch (err) {
          addLog(`poll ${attempt}: fetch error: ${String(err)}`);
        }

        await new Promise((r) => setTimeout(r, intervalMs));
      }

      addLog(`waitForHiGlassTilesetInfo TIMEOUT: want=[${want.join(", ")}]`);
      return false;
    },
    [addLog, reloadViewer],
  );

  // uploads (heatmap/logo/matrix)
const { handleUpload, handleLogoTrackUpload, handleNpyMatrixUpload } = useUploads({
  addLog,
  refreshTilesets,
  setSelectedUuid,
  waitForHiGlassTilesetInfo,
  selectedUuid,
  setLogoTrackUsed,
  toggleLogoMode,
  setLogoUid,
  setMatrixUid,

  setMatrixUsed: (next) => {
    if (Boolean(next) !== matrixActivated) {
      toggleMatrixMode();
    }
  },

  setMatrixSplitUsed: (next) => {
    const want = Boolean(next);
    if (want && !canActivateLines) {
      addLog("setMatrixSplitUsed(true) blocked: canActivateLines=false");
      return;
    }
    if (want !== lineMode) {
      toggleLineMode();
    }
  },

  applySingleMatrixNow: (heatmapUid, mvUid) => {
    if (!heatmapUid || !mvUid) return;

    setSelectedUuid(heatmapUid);
    setMatrixUid(mvUid);

    if (!matrixActivated) {
      toggleMatrixMode();
    }
    if (lineMode) {
      toggleLineMode();
    }
  },
});
  /* =======================================================================
     ACTIONS / HANDLERS
     ======================================================================= */

  const toggleLogoTracks = useCallback(() => {
    toggleLogoMode();
    setLogoTrackUsed((v) => !v);
    addLog("toggled logo tracks");
  }, [toggleLogoMode, addLog]);

  // dropdown handler: switch base heatmap tileset uid
  const handleUuidSelect = useCallback(
    (e) => {
      const newUid = e.target.value;
      addLog(`switching heatmap tilesetUid -> "${newUid}"`);
      setSelectedUuid(newUid);
    },
    [addLog, setSelectedUuid],
  );

  // generic “run action with logging” wrapper
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
    [addLog],
  );

  //buttons are always visible and directly call the hook toggles
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
}, [toggleLineMode, canActivateLines, addLog, reloadViewer]);
  const onToggleSequenz = useCallback(() => {
    toggleSequenzMode();
    addLog("sequence button pressed -> toggleSequenzMode()");
    reloadViewer();
  }, [toggleSequenzMode, addLog, reloadViewer]);



  // Reload once when selectedUuid transitions from "missing" -> "present" in availableTilesets.
  const selectedPresenceRef = useRef({ uid: null, wasPresent: false });

  useEffect(() => {
    const uid = selectedUuid;
    if (!uid) return;

    // If the selection changed, reset transition tracking.
    if (selectedPresenceRef.current.uid !== uid) {
      selectedPresenceRef.current = { uid, wasPresent: false };
    }

    const isPresent = availableTilesets.some((t) => (t?.uuid ?? t?.uid) === uid);

    // Trigger only on the transition: not present -> present
    if (!selectedPresenceRef.current.wasPresent && isPresent) {
      selectedPresenceRef.current.wasPresent = true;
      addLog(`selectedUuid "${uid}" appeared in availableTilesets -> reloading viewer`);
      reloadViewer();
      return;
    }

    // Keep state updated so if it disappears and reappears, it can trigger again.
    selectedPresenceRef.current.wasPresent = isPresent;
  }, [selectedUuid, availableTilesets, addLog, reloadViewer]);

  /* =======================================================================
     RENDER
     ======================================================================= */

  return (
    <div style={page}>
      <div style={topbar}>
        <button type="button" onClick={() => setAdvancedOpen((v) => !v)} style={advancedButton(advancedOpen)}>
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
          logoTrackUsed={logoTrackUsed}
          busyMain={busyMain}
          busyLogo={busyLogo}
          backendText={backendText}
          backendDotColor={backendDotColor}
          pos={pos}
          posLeft={posLeft}
          posRight={posRight}
          selectedUuid={selectedUuid}
          addLog={addLog}
        />
      )}

      <div style={shell}>
        <Sidebar
          showUuidPicker={showUuidPicker}
          availableTilesets={availableTilesets}
          selectedUuid={selectedUuid}
          handleUuidSelect={handleUuidSelect}
          tilesetFetchInFlight={tilesetFetchInFlight}
          file={file}
          setFile={setFile}
          handleUpload={() => handleUpload({ file, setBusy: setBusyMain })}
          logoTrackFile={logoTrackFile}
          setLogoTrackFile={setLogoTrackFile}
          handleLogoTrackUpload={() => handleLogoTrackUpload({ logoTrackFile, setBusy: setBusyLogo })}
          npyMatrixFile={npyMatrixFile}
          setNpyMatrixFile={setNpyMatrixFile}
          handleNpyMatrixUpload={() => handleNpyMatrixUpload({ npyMatrixFile, setBusy: setBusyMain })}
          matrixUid={matrixUid}
          matrixEnabled={matrixActivated}
          lineModeEnabled={lineMode}
          onToggleMatrix={onToggleMatrix}
          onToggleLineMode={onToggleLineMode}
          canActivateLines={canActivateLines}
          logs={logs}
          pos={pos}
          posLeft={posLeft}
          posRight={posRight}
          backendDotColor={backendDotColor}
          backendText={backendText}
          hoverCell={hoverCell}
          clickedCell={clickedCell}
          sequenzInput={sequenzInput}
          setSequenzInput={setSequenzInput}
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