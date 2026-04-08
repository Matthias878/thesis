import { useCallback, useEffect, useRef, useState } from "react";
import "higlass/dist/hglib.css";
import "higlass-multivec";
import { HiGlassComponent } from "higlass";
import useBackendStatus from "./api/StatusSystem";
import { useRenderViewConfig } from "./higlass/higlassViewConfigurator";
import Sidebar from "./components/Sidebar";
import { page, shell, main, viewerFrame } from "./styles/appStyles";

function ts() {
  return new Date().toLocaleTimeString();
}

function nowIso() {
  return new Date().toISOString();
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

export default function App() {
  const [logs, setLogs] = useState([`[${ts()}] app started`]);
  const [viewerKey, setViewerKey] = useState(0);

  const addLog = useCallback((line) => {
    setLogs((prev) => [...prev, `[${ts()}] ${line}`].slice(-400));
  }, []);

  /**
   * Performance capture state lives in refs so it is cheap and always current.
   */
  const perfEnabledRef = useRef(false);
  const eventCounterRef = useRef(0);
  const lastARef = useRef(null);
  const captureRef = useRef({
    startedAt: null,
    stoppedAt: null,
    events: [],
  });

  const startPerfCapture = useCallback(() => {
    perfEnabledRef.current = true;
    eventCounterRef.current = 0;
    lastARef.current = null;
    captureRef.current = {
      startedAt: nowIso(),
      stoppedAt: null,
      events: [],
    };
    addLog("performance capture started (Shift+M)");
  }, [addLog]);

  const stopPerfCapture = useCallback(() => {
    perfEnabledRef.current = false;
    captureRef.current.stoppedAt = nowIso();
    addLog("performance capture stopped (Shift+M)");
  }, [addLog]);

  const togglePerfCapture = useCallback(() => {
    if (perfEnabledRef.current) {
      stopPerfCapture();
    } else {
      startPerfCapture();
    }
  }, [startPerfCapture, stopPerfCapture]);

  const downloadPerfCapture = useCallback(() => {
    const data = {
      recordingEnabled: perfEnabledRef.current,
      ...captureRef.current,
      exportedAt: nowIso(),
    };

    downloadJson(
      `viewer-performance-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      data
    );

    addLog("performance capture downloaded (Shift+P)");
  }, [addLog]);


  const markEventA = useCallback(
    (label = "A") => {
      if (!perfEnabledRef.current) return;

      eventCounterRef.current += 1;

      lastARef.current = {
        uploadedFileNumber: eventCounterRef.current,
        label,
        timeMs: performance.now(),
        at: nowIso(),
      };

      addLog(
        `Event A marked #${lastARef.current.uploadedFileNumber}${
          label ? `: ${label}` : ""
        }`
      );
    },
    [addLog]
  );

  const reloadViewer = useCallback(() => {
    addLog("viewer reload requested");

    if (perfEnabledRef.current && lastARef.current) {
      const bTimeMs = performance.now();
      const deltaSeconds = (bTimeMs - lastARef.current.timeMs) / 1000;

      captureRef.current.events.push({
        uploadedFileNumber: lastARef.current.uploadedFileNumber,
        label: lastARef.current.label,
        deltaSeconds,
      });
    }

    setViewerKey((k) => k + 1);
  }, [addLog]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const key = e.key.toLowerCase();

      if (e.shiftKey && key === "p") {
        e.preventDefault();
        downloadPerfCapture();
        return;
      }

      if (e.shiftKey && key === "m") {
        e.preventDefault();
        togglePerfCapture();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePerfCapture, downloadPerfCapture]);

  // Initialize Playwright-visible upload state once.
  useEffect(() => {
    if (!window.__uploadTestState) {
      window.__uploadTestState = {
        uploadInProgress: false,
        lastStartedFile: null,
        lastCompletedFile: null,
        lastFailedFile: null,
        lastError: null,
        updatedAt: nowIso(),
      };
    }
  }, []);

  const backendStatus = useBackendStatus();
  const viewer = useRenderViewConfig({
    addLog,
    reloadViewer,
  });

  return (
    <div style={page}>
      <div style={shell}>
        <Sidebar
          addLog={addLog}
          logs={logs}
          reloadViewer={reloadViewer}
          backendStatus={backendStatus}
          viewer={viewer}
          markEventA={markEventA}
        />

        <main style={main}>
          <div style={viewerFrame()}>
            <HiGlassComponent
              key={viewerKey}
              ref={viewer.onHiGlassRef}
              viewConfig={viewer.viewConfig}
              options={{ bounded: true }}
            />
          </div>
        </main>
      </div>
    </div>
  );
}