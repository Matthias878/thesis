import React, { useCallback, useState, useEffect, useRef } from "react";
import { HiGlassComponent } from "higlass";
import "higlass/dist/hglib.css";

function FileUpload({ file, setFile, onUpload }) {
  return (
    <div style={{ marginTop: 12 }}>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button onClick={onUpload} style={{ marginLeft: 8 }}>
        Hochladen
      </button>
    </div>
  );
}

const initialViewConfig = {
  editable: true,
  trackSourceServers: ["http://localhost:8989/api/v1", "https://higlass.io/api/v1"],
  views: [
    {
      uid: "view-1",
      layout: { w: 12, h: 12, x: 0, y: 0 },
      tracks: {
        center: [
          {
            type: "heatmap",
            uid: "heatmap-track-1",
            tilesetUid: "finishedfile",
            server: "http://localhost:8989/api/v1",
            options: {
              labelPosition: "bottomRight",
              labelText: "finishedFile",
              colorRange: [
                "white",
                "rgba(245, 166, 35, 1.0)",
                "rgba(208, 2, 27, 1.0)",
                "black",
              ],
              maxZoom: null,
            },
          },
        ],
      },
    },
  ],
};

function ConsoleBox({ text }) {
  const ref = useRef(null);

  // Auto-scroll to bottom when text changes
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [text]);

  return (
    <pre
      ref={ref}
      style={{
        background: "#0d0d0d",
        color: "#33ff33",
        padding: "12px",
        borderRadius: "6px",
        fontFamily: "monospace",
        fontSize: "14px",
        maxHeight: "300px",
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        marginTop: 12,
      }}
    >
      {text}
    </pre>
  );
}

function App() {
  const [file, setFile] = useState(null);
  const [viewConfig, setViewConfig] = useState(initialViewConfig);
  const [higlassKey, setHiglassKey] = useState(0);

  // ✅ Logs must be defined BEFORE functions that use addLog
  const [logs, setLogs] = useState(["> app started"]);

  const addLog = useCallback((line) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${ts}] ${line}`]);
  }, []);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/status/current_input");
        if (!res.ok) return;
        const j = await res.json();
        if (!mounted) return;
        addLog(`status: ${j.status}`);
      } catch (e) {
        addLog(`status poll error: ${String(e)}`);
      }
    };

    // sofort einmal und dann alle 2s
    poll();
    const id = setInterval(poll, 2000);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [addLog]);

  const uploadFile = useCallback(async () => {
    addLog(`trying to upload file: ${file?.name ?? "(none)"}`);
    console.log("trying to upload file:", file);

    if (!file) {
      addLog("no file selected");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        addLog(`upload failed: ${response.status} ${response.statusText} ${body ? `| ${body}` : ""}`);
        return;
      }

      const data = await response.json();
      addLog(`server response: ${JSON.stringify(data)}`);
      console.log("Server Antwort:", data);
    } catch (error) {
      addLog(`upload error: ${String(error)}`);
      console.error("Fehler beim Upload:", error);
    }
  }, [addLog, file]);

  // wrongly named, actually just downloads the file to server
  const handleCreatenewuuID = useCallback(async () => {
    addLog("handleCreatenewuuID clicked");
    await uploadFile();
    // later: setViewConfig(...) with returned UUID
  }, [addLog, uploadFile]);

  const reloadHiGlass = useCallback(() => {
    addLog("reloadHiGlass clicked");
    setHiglassKey((k) => k + 1); // forces HiGlassComponent to unmount/mount
  }, [addLog]);

  const ConvertLastUploadedFile = useCallback(async () => {
    addLog("convert: started");
    try {
      const convertResponse = await fetch("http://127.0.0.1:8000/convert", { method: "POST" });

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

  const ConvertNPYfile = useCallback(async () => {
    addLog("trying to convert NPY file to a .mcool file format");
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

  const ReuploadFile = useCallback(async () => {
    addLog("reupload: started");
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

  const handleChangeuuID = useCallback(() => {
    addLog("handleChangeuuID clicked");
    addLog(`viewConfig: ${JSON.stringify(viewConfig)}`);
    console.log("handleChangeuuID clicked");
    console.log("viewConfig:", viewConfig);
  }, [addLog, viewConfig]);

  const handleChangeMode = useCallback(() => {
    addLog("handleChangeMode clicked");
    console.log("handleChangeMode clicked");
  }, [addLog]);

  const handleAddStartingCoords = useCallback(() => {
    addLog("handleAddStartingCoords clicked");
    console.log("handleAddStartingCoords clicked");
  }, [addLog]);

  const clearLogs = useCallback(() => setLogs(["> cleared"]), []);

  return (
    <>
      <div>
        What you can do so far (very basic prototype):
        <ul>
          <li>Upload a .pt or .npy file to the backend server</li>
          <li>Convert the last uploaded .pt/.npy file to a .mcool file (locally on the server)</li>
          <li>
            Load the converted .mcool file into the Higlass viewer (the .mcool file is always saved as
            "finishedFile.mcool" for now)
          </li>
          <li>reload the higlass component to show newly uploaded file</li>
        </ul>
      </div>
      
      <div className="App">
        <nav style={{ padding: "10px", background: "#000000", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={ConvertLastUploadedFile}>Click here to convert the last uploaded .pt into a .mcool file format  - DONE</button>
          <button onClick={ConvertNPYfile}>Click here to convert the last uploaded .npy into a .mcool file format  - Done</button>
          <button onClick={handleChangeMode}>Select mode how to create .mcool file - CurrentMode: NORMAL(MaxPooling) - TODO</button>
          <button onClick={handleAddStartingCoords}>Add starting coords for next new looding TODO</button>
          <button onClick={handleChangeuuID}>Click here to edit uuID to use for next mcool file, currently 'finishedFile' - TODO</button>
          <button onClick={ReuploadFile}>Click here to load the currently uploaded file as current uuID - DONE</button>
          <button onClick={ReuploadFile}>Click here to change uuID to load - TODO</button>
          <button onClick={reloadHiGlass}>Click here to reload the Higlass component with current uuID - DONE</button>
          <button onClick={clearLogs}>Clear console</button>
          <button onClick={() => addLog("test log")} style={{ marginLeft: "auto" }}>
            Test log
          </button>
        </nav>

        <ConsoleBox text={logs.join("\n")} />

        <FileUpload file={file} setFile={setFile} onUpload={uploadFile} />

        <div style={{ height: "80vh", width: "100%", position: "relative", marginTop: "20px" }}>
          <HiGlassComponent key={higlassKey} viewConfig={viewConfig} options={{ bounded: true }} />
        </div>
      </div>
    </>
  );
}

export default App;
