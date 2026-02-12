import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiGlassComponent } from "higlass";
import "higlass/dist/hglib.css";


const API_BACKEND = "http://127.0.0.1:8000";
const HIGLASS_SERVER = "http://localhost:8989/api/v1";

function ts() {
  return new Date().toLocaleTimeString();
}

function ConsoleBox({ lines }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
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

function FileUpload({ file, setFile, onUpload, busy }) {
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

function buildViewConfig(tilesetUid) {
  return {
    editable: true,
    trackSourceServers: [HIGLASS_SERVER, "https://higlass.io/api/v1"],
    views: [
      {
        uid: "view-1",
        layout: { w: 12, h: 12, x: 0, y: 0 },
        tracks: {
          center: [
            {
              type: "heatmap",
              uid: "heatmap-track-1",
              tilesetUid,
              server: HIGLASS_SERVER,
              options: {
                labelPosition: "bottomRight",
                labelText: tilesetUid,
                colorRange: ["white", "rgba(245, 166, 35, 1.0)", "rgba(208, 2, 27, 1.0)", "black"],
                maxZoom: null,
              },
            },
          ],
        },
      },
    ],
  };
}

export default function App() {
  const [logs, setLogs] = useState([`[${ts()}] app started`]);
  const addLog = useCallback((line) => setLogs((p) => [...p, `[${ts()}] ${line}`]), []);

  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);

  const [availableUuids, setAvailableUuids] = useState([]);
  const [selectedUuid, setSelectedUuid] = useState("finishedfile"); // there is no default
  const [showUuidPicker, setShowUuidPicker] = useState(false);

  const [viewerKey, setViewerKey] = useState(0);
  const viewConfig = useMemo(() => buildViewConfig(selectedUuid), [selectedUuid]);

  //convert npy
  const ConvertNPYFile = useCallback(async () => {
    addLog("convert npy called");
    try {
      const convertResponse = await fetch("http://127.0.0.1:8000/convert_npy", { method: "POST" });

      if (!convertResponse.ok) {
        const body = await convertResponse.text().catch(() => "");
        addLog(
          `convert failed: ${convertResponse.status} ${convertResponse.statusText}${
            body ? ` | ${body}` : ""
          }`
        );
        return;
      }

      const convertResult = await convertResponse.json();
      addLog(`convert result: ${JSON.stringify(convertResult)}`);
      console.log(convertResult);
    } catch (e) {
      addLog(`convert error: ${String(e)}`);
    }
  }, [addLog]);

  //convert pt
  const ConverPTFile = useCallback(async () => {
    addLog("convert pt called");
    try {
      const convertResponse = await fetch("http://127.0.0.1:8000/convert_pt", { method: "POST" });

      if (!convertResponse.ok) {
        const body = await convertResponse.text().catch(() => "");
        addLog(
          `convert failed: ${convertResponse.status} ${convertResponse.statusText}${
            body ? ` | ${body}` : ""
          }`
        );
        return;
      }

      const convertResult = await convertResponse.json();
      addLog(`convert result: ${JSON.stringify(convertResult)}`);
      console.log(convertResult);
    } catch (e) {
      addLog(`convert error: ${String(e)}`);
    }
  }, [addLog]);

  //turn .mcool into .mcool.done files
  
  const ReuploadFile = useCallback(async () => {
    addLog("turning .mcool into .mcool.done and uploading as new uuIDs called");
    try {
      const r = await fetch("http://127.0.0.1:8000/reupload", { method: "POST" });

      if (!r.ok) {
        const body = await r.text().catch(() => "");
        addLog(`reupload failed: ${r.status} ${r.statusText}${body ? ` | ${body}` : ""}`);
        return;
      }

      const j = await r.json();
      addLog(`reupload result: ${JSON.stringify(j)}`);
      console.log(j);
    } catch (e) {
      addLog(`reupload error: ${String(e)}`);
    }
  }, [addLog]);


  // --- Backend health check / initial uuid load (optional, aber hilfreich) ---
  const fetchAvailableUuids = useCallback(async () => {
    try {
      const r = await fetch(`${API_BACKEND}/mcool-files`);
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        addLog(`mcool-files failed: ${r.status} ${r.statusText}${body ? ` | ${body}` : ""}`);
        return [];
      }
      const j = await r.json();
      const list = Array.isArray(j.all) ? j.all : [];
      return list;
    } catch (e) {
      addLog(`mcool-files error: ${String(e)}`);
      return [];
    }
  }, [addLog]);

  useEffect(() => {
    (async () => {
      addLog("loading available uuids…");
      const list = await fetchAvailableUuids();
      setAvailableUuids(list);
      if (list.length) {
        addLog(`found ${list.length} uuid(s)`);
        // Wenn Default nicht existiert, nimm das erste
        if (!list.includes(selectedUuid)) {
          addLog(`default uuid "${selectedUuid}" not found -> switching to "${list[0]}"`);
          setSelectedUuid(list[0]);
          setViewerKey((k) => k + 1);
        }
      } else {
        addLog("no uuids returned (backend empty/offline?)");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- UI handlers ---
  const handleOpenUuidPicker = useCallback(async () => {
    addLog("uuid picker opened -> refreshing list");
    const list = await fetchAvailableUuids();
    setAvailableUuids(list);
    setShowUuidPicker(true);
    addLog(list.length ? `uuid list refreshed (${list.length})` : "uuid list empty");
  }, [addLog, fetchAvailableUuids]);

  const handleUuidSelect = useCallback(
    (e) => {
      const newUid = e.target.value;
      addLog(`switching tilesetUid -> "${newUid}"`);
      setSelectedUuid(newUid);
      setViewerKey((k) => k + 1); // erzwingt HiGlass remount
    },
    [addLog]
  );

  const handleReloadViewer = useCallback(() => {
    addLog("viewer reload requested");
    setViewerKey((k) => k + 1);
  }, [addLog]);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    addLog(`upload start: ${file.name}`);

    try {
      // ⚠️ Passe diesen Endpoint an deinen echten Upload an.
      const form = new FormData();
      form.append("file", file);

      const r = await fetch(`${API_BACKEND}/upload`, {
        method: "POST",
        body: form,
      });

      if (!r.ok) {
        const body = await r.text().catch(() => "");
        addLog(`upload failed: ${r.status} ${r.statusText}${body ? ` | ${body}` : ""}`);
        return;
      }

      const j = await r.json().catch(() => ({}));
      addLog(`upload ok${j?.uuid ? ` -> uuid: ${j.uuid}` : ""}`);

      // Wenn Backend nach Upload einen neuen uuid liefert
      if (j?.uuid && typeof j.uuid === "string") {
        setSelectedUuid(j.uuid);
        setViewerKey((k) => k + 1);
      } else {
        // sonst refresh uuids
        const list = await fetchAvailableUuids();
        setAvailableUuids(list);
        addLog("uuid list refreshed after upload");
      }
    } catch (e) {
      addLog(`upload error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [addLog, file, fetchAvailableUuids]);

  // --- Styles ---
  const page = {
    minHeight: "100vh",
    background: "radial-gradient(1200px 600px at 20% 10%, rgba(80,120,255,0.16), transparent 60%), #070a0f",
    color: "white",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  };

  const header = {
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: "rgba(7,10,15,0.85)",
    backdropFilter: "blur(8px)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  };

  const shell = {
    display: "grid",
    gridTemplateColumns: "360px 1fr",
    gap: 14,
    padding: 14,
    alignItems: "start",
  };

  const card = {
    borderRadius: 14,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  };

  const button = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  };

  return (
    <div style={page}>
      <div style={header}>
        <div style={{ display: "grid", gap: 2 }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.2 }}>HiGlass Viewer</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.70)" }}>
            Server: <span style={{ color: "white" }}>{HIGLASS_SERVER}</span> · tilesetUid:{" "}
            <span style={{ color: "white" }}>{selectedUuid}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={ConverPTFile}>Click here to convert the last uploaded .pt into a .mcool file format</button>
          <button onClick={ConvertNPYFile}>Click here to convert the last uploaded .npy into a .mcool file format</button>
          <button onClick={ReuploadFile}>Click here to upload all converted files as new uuIDs to the higlass server</button>
          
          <button style={button} onClick={handleReloadViewer}>
            Viewer neu laden
          </button>
          <button style={button} onClick={handleOpenUuidPicker}>
            UUID wählen
          </button>
        </div>
      </div>

      <div style={shell}>
        {/* Sidebar */}
        <aside style={{ ...card, padding: 14, display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>UUID / Tileset</div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                Aktuell: <span style={{ color: "white" }}>{selectedUuid}</span>
              </div>

              {showUuidPicker && (
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>Select uuid</span>
                  <select
                    value={selectedUuid}
                    onChange={handleUuidSelect}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "white",
                    }}
                  >
                    {availableUuids.length === 0 ? (
                      <option value={selectedUuid}>{selectedUuid}</option>
                    ) : (
                      availableUuids.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              )}
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.10)" }} />

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Upload</div>
            <FileUpload file={file} setFile={setFile} onUpload={handleUpload} busy={busy} />
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.10)" }} />

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Logs</div>
            <ConsoleBox lines={logs} />
          </div>
        </aside>

        {/* Main viewer */}
        <main style={{ ...card, padding: 12 }}>
          <div
            style={{
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.10)",
              height: "calc(100vh - 110px)", // ✅ garantiert, dass HiGlass sichtbar ist
              minHeight: 520,
              background: "rgba(0,0,0,0.25)",
            }}
          >
            <HiGlassComponent key={viewerKey} viewConfig={viewConfig} options={{ bounded: true }} />
          </div>
        </main>
      </div>
    </div>
  );
}
