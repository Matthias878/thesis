import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiGlassComponent } from "higlass";
import "higlass/dist/hglib.css";

import { HIGLASS_SERVER, ts } from "./config";
import ConsoleBox from "./components/ConsoleBox";
import FileUpload from "./components/FileUpload";
import LogoOverlay from "./components/LogoOverlay";
import { useBackendStatus } from "./api/StatusSystem";
import { useTilesets } from "./higlass/useTilesets";
import { useCoordsWatchdog, useHoverCellWatchdog } from "./higlass/useCoordsWatchdog";
import { buildHeatmapViewConfig, buildHeatmapWithTracksViewConfig } from "./higlass/viewConfig";
import { convertNpy, convertPt, reupload, uploadFileWithNewUid, uploadlogoTrackFile } from "./api/higlassApi";

import {page,topbar,advancedWrap,advancedCard,advancedRow,advancedRowLeft,advancedRowRight,advancedMeta,serverText,backendMeta,backendDot,backendDotSmall,backendTextStyle,divider,shell,sidebar,main,button,select,labelGrid,labelHint,sectionTitle,smallMuted,uploadHint,statusLineOuter,statusEllipsis,backendRowInStatus,backendTextEllipsis,hoverBlock,hoverLine,viewerFrame,advancedButton,
} from "./styles/appStyles";

const cellValue = (v) =>
  v instanceof Error
    ? `Error: ${v.message}\n${v.stack ?? ""}`
    : v === undefined
    ? "undefined"
    : v === null
    ? "null"
    : String(v);

export default function App() {
  useEffect(() => {
    console.log("App mounted once", new Date().toISOString());
  }, []);

  const hgApiRef = useRef(null);
  const [hgApi, setHgApi] = useState(null);

  const [hoverCell, setHoverCell] = useState(null);
  const [clickedCell, setClickedCell] = useState(null);

  const [logs, setLogs] = useState([`[${ts()}] app started`]);
  const addLog = useCallback((line) => {
    setLogs((p) => {
      const next = [...p, `[${ts()}] ${line}`];
      return next.length > 400 ? next.slice(-400) : next;
    });
  }, []);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busyMain, setBusyMain] = useState(false);
  const [busyLogo, setBusyLogo] = useState(false);

  const [file, setFile] = useState(null);
  const [logoTrackFile, setLogoTrackFile] = useState(null);

  const [viewerKey, setViewerKey] = useState(0);
  const [logoTrackUsed, setLogoTrackUsed] = useState(false);
  const [pos, setPos] = useState(null);

  const {
    availableTilesets,
    selectedUuid,
    setSelectedUuid,
    showUuidPicker,
    toggleUuidPicker,
    tilesetFetchInFlight,
    refreshTilesets,
  } = useTilesets(addLog);

  const viewConfig = useMemo(
    () => (logoTrackUsed ? buildHeatmapWithTracksViewConfig(selectedUuid) : buildHeatmapViewConfig(selectedUuid)),
    [selectedUuid, logoTrackUsed]
  );

  const backend = useBackendStatus({
    baseUrl: import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:8000",
    key: "current_input",
    pollMs: 1000,
    timeoutMs: 1500,
    enabled: true,
  });

  useCoordsWatchdog({ hgApiRef, hgApi, addLog, intervalMs: 200, onUpdate: setPos });
  useHoverCellWatchdog({
    hgApiRef,
    hgApi,
    addLog,
    binSize: 1,
    includeValue: true,
    onHover: setHoverCell,
    debug: false,
    debugEventDump: false,
    debugEveryMs: 750,
  });

  const onViewerMouseDown = useCallback(
    (e) => {
      if (e.button === 0 && hoverCell) setClickedCell({ ...hoverCell });
    },
    [hoverCell]
  );

  const onHiGlassRef = useCallback(
    (instance) => {
      if (!instance) {
        hgApiRef.current = null;
        setHgApi(null);
        addLog("HiGlass unmounted -> api cleared");
        return;
      }
      const api = instance.api;
      if (!api || typeof api.getLocation !== "function") {
        addLog("HiGlass mounted but API not ready yet");
        return;
      }
      hgApiRef.current = api;
      setHgApi(api);
      addLog("HiGlass API ready");
    },
    [addLog]
  );

  const reloadViewer = useCallback(() => {
    addLog("viewer reload requested");
    hgApiRef.current = null;
    setHgApi(null);
    setViewerKey((k) => k + 1);
  }, [addLog]);

  const handleUuidSelect = useCallback(
    (e) => {
      const newUid = e.target.value;
      addLog(`switching tilesetUid -> "${newUid}"`);
      setSelectedUuid(newUid);
      setViewerKey((k) => k + 1);
    },
    [addLog, setSelectedUuid]
  );

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

  const waitForTileset = useCallback(
    async (uuid, { timeoutMs = 20000, intervalMs = 500 } = {}) => {
      const has = () => availableTilesets.some((t) => t.uuid === uuid);
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (has()) return true;
        await refreshTilesets();
        if (has()) return true;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return false;
    },
    [availableTilesets, refreshTilesets]
  );

  const waitForHiGlassTilesetInfo = useCallback(async (uids, { timeoutMs = 60000, intervalMs = 750 } = {}) => {
    const start = Date.now();

    const isReady = async (uid) => {
      const url = `${HIGLASS_SERVER}/api/v1/tilesets/?d=${encodeURIComponent(uid)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return false;
      const json = await res.json();
      return !!(json && typeof json === "object" && json[uid]);
    };

    while (Date.now() - start < timeoutMs) {
      let allOk = true;

      for (const uid of uids) {
        try {
          const ok = await isReady(uid);
          if (!ok) {
            allOk = false;
            break;
          }
        } catch {
          allOk = false;
          break;
        }
      }

      if (allOk) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    return false;
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setBusyMain(true);
    addLog(`upload start: ${file.name}`);

    try {
      const j = await uploadFileWithNewUid(file, addLog);
      addLog(`upload ok: ${JSON.stringify(j)}`);

      const uuid = j?.uuid || j?.tilesetUid || j?.uid;
      if (typeof uuid === "string" && uuid) {
        addLog(`backend returned uuid=${uuid} -> selecting (user) + waiting for list...`);
        setSelectedUuid(uuid);

        const ok = await waitForTileset(uuid);
        addLog(ok ? "tileset visible in list -> reloading viewer" : `WARNING: tileset ${uuid} not in list before timeout; reloading anyway`);

        setViewerKey((k) => k + 1);
        addLog(`selected uuid=${uuid}`);
      } else {
        addLog("no uuid returned; refreshing tilesets");
        await refreshTilesets();
      }
    } catch (e) {
      addLog(String(e));
    } finally {
      setBusyMain(false);
    }
  }, [addLog, file, refreshTilesets, setSelectedUuid, waitForTileset]);

  const handleLogoTrackUpload = useCallback(async () => {
    if (!logoTrackFile) return;
    setBusyLogo(true);
    addLog(`logo_track upload start: ${logoTrackFile.name}`);

    try {
      const j = await uploadlogoTrackFile(logoTrackFile, addLog);
      addLog(`logo_track upload ok${j?.uuid ? ` -> uuid: ${j.uuid}` : ""}`);

      addLog("waiting for logo tracks to become available on HiGlass...");
      const ok = await waitForHiGlassTilesetInfo(["a_track", "c_track", "g_track", "t_track"], {
        timeoutMs: 60000,
        intervalMs: 750,
      });
      addLog(ok ? "logo tracks ready -> enabling tracks + reloading viewer" : "WARNING: logo tracks not ready before timeout; enabling tracks + reloading anyway");

      setLogoTrackUsed(true);
      setViewerKey((k) => k + 1);
    } catch (e) {
      addLog(`logo_track upload error: ${String(e)}`);
    } finally {
      setBusyLogo(false);
    }
  }, [addLog, logoTrackFile, waitForHiGlassTilesetInfo]);

  const toggleLogoTracks = useCallback(() => {
    setLogoTrackUsed((v) => !v);
    setViewerKey((k) => k + 1);
    addLog("toggled extra tracks");
  }, [addLog]);

  const backendDotColor =
    backend?.level === "down"
      ? "#ff3b3b"
      : backend?.level === "busy"
      ? "#ff9f1a"
      : backend?.ok === false
      ? "#ff3b3b"
      : "#2ee66b";

  const backendText =
    backend?.text ??
    (typeof backend?.ok === "boolean" ? (backend.ok ? "backend ok" : "backend down") : "backend status: —");

  const posLeft = pos?.i ?? (typeof pos?.x1 === "number" ? Math.round(pos.x1) : null);
  const posRight = pos?.j ?? (typeof pos?.x2 === "number" ? Math.round(pos.x2) : null);

  return (
    <div style={page}>
      <div style={topbar}>
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          style={advancedButton(advancedOpen)}
          aria-pressed={advancedOpen}
        >
          advanced
        </button>
      </div>

      {advancedOpen && (
        <div style={advancedWrap}>
          <div style={advancedCard}>
            <div style={advancedRow}>
              <div style={advancedRowLeft}>
                <button type="button" onClick={reloadViewer} style={button} disabled={busyMain || busyLogo} title="Reload HiGlass viewer">
                  reload viewer
                </button>

                <button type="button" onClick={toggleUuidPicker} style={button} disabled={busyMain || busyLogo} title="Show/hide UUID picker in left sidebar">
                  {showUuidPicker ? "hide uuid picker" : "show uuid picker"}
                </button>

                <button type="button" onClick={toggleLogoTracks} style={button} disabled={busyMain || busyLogo} title="Toggle extra tracks">
                  {logoTrackUsed ? "tracks: on" : "tracks: off"}
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

            <div style={advancedMeta}>
              <div style={serverText}>
                server: <span style={{ opacity: 0.9 }}>{HIGLASS_SERVER}</span>
              </div>

              <div style={backendMeta}>
                <span style={backendDot(backendDotColor)} title={backend?.raw || backend?.text || (backend?.ok ? "ok" : "down")} />
                <span style={backendTextStyle}>{backendText}</span>
              </div>

              <div>
                pos:{" "}
                {pos && posLeft != null && posRight != null
                  ? `${posLeft}..${posRight}${pos?.span != null ? ` (span ${pos.span})` : ""}`
                  : "—"}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={shell}>
        <aside style={sidebar}>
          {showUuidPicker && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={sectionTitle}>UUID / Tileset</div>

              <label style={labelGrid}>
                <span style={labelHint}>Select uuid</span>
                <select value={selectedUuid} onChange={handleUuidSelect} style={select}>
                  {availableTilesets.length === 0 ? (
                    <option value={selectedUuid || ""}>{selectedUuid || "—"}</option>
                  ) : (
                    availableTilesets.map((t) => (
                      <option key={t.uuid} value={t.uuid}>
                        {t.uuid}
                        {t.name ? ` — ${t.name}` : ""}
                        {t.datatype ? ` (${t.datatype})` : ""}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <div style={smallMuted}>
                Loaded tilesets: {availableTilesets.length || 0} {tilesetFetchInFlight ? "· updating…" : ""}
              </div>
            </div>
          )}

          {showUuidPicker && <div style={divider} />}

          <div style={{ display: "grid", gap: 10 }}>
            <div style={sectionTitle}>Upload</div>

            <FileUpload file={file} setFile={setFile} onUpload={handleUpload} busy={busyMain} />

            <div style={divider} />

            <div style={{ display: "grid", gap: 8 }}>
              <div style={sectionTitle}>logo_track upload</div>
              <div style={uploadHint}>.npy shape N×4 (N muss zur Größe der angezeigten Daten passen)</div>

              <FileUpload
                file={logoTrackFile}
                setFile={setLogoTrackFile}
                onUpload={handleLogoTrackUpload}
                busy={busyLogo}
                accept=".npy"
              />
            </div>
          </div>

          <ConsoleBox lines={logs} />

          <div style={statusLineOuter}>
            {pos && posLeft != null && posRight != null ? (
              <div style={statusEllipsis}>
                Current position: {posLeft}..{posRight}
                {pos?.span != null ? ` (span ${pos.span})` : ""}
              </div>
            ) : (
              <div>Current position: —</div>
            )}

            {pos?.excerpt ? <div style={{ wordBreak: "break-all" }}>DNA: {pos.excerpt}</div> : null}

            <div style={backendRowInStatus}>
              <span style={backendDotSmall(backendDotColor)} title={backend?.raw || backend?.text || (backend?.ok ? "ok" : "down")} />
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
              Last click: {clickedCell ? `${clickedCell.cellX}${clickedCell.cellY == null ? "" : `,${clickedCell.cellY}`}` : "—"}
              {" · value: "}
              {cellValue(clickedCell?.value)}
            </div>
          </div>
        </aside>

        <main style={main}>
          <div onMouseDown={onViewerMouseDown} style={viewerFrame(advancedOpen)}>
            <HiGlassComponent key={viewerKey} ref={onHiGlassRef} viewConfig={viewConfig} options={{ bounded: true }} />
          </div>
        </main>
      </div>
    </div>
  );
}