import { useCallback, useState } from "react";
import "higlass/dist/hglib.css";
import { HiGlassComponent } from "higlass";
import { useBackendStatus } from "./api/StatusSystem";
import { useRenderViewConfig } from "./higlass/higlassViewConfigurator";
import Sidebar from "./components/Sidebar";
import { page, shell, main, viewerFrame } from "./styles/appStyles";

function ts() {return new Date().toLocaleTimeString();}

export default function App() {
  const [logs, setLogs] = useState([`[${ts()}] app started`]);
  const [viewerKey, setViewerKey] = useState(0);

  const addLog = useCallback((line) => {
    setLogs((prev) => [...prev, `[${ts()}] ${line}`].slice(-400));
  }, []);

  const reloadViewer = useCallback(() => {
    addLog("viewer reload requested");
    setViewerKey((k) => k + 1);
  }, [addLog]);

  const backendStatus = useBackendStatus();
  const viewer = useRenderViewConfig({addLog,reloadViewer,});

  return (
    <div style={page}>
      <div style={shell}>
        <Sidebar
          addLog={addLog}
          logs={logs}
          reloadViewer={reloadViewer}
          backendStatus={backendStatus}
          viewer={viewer}
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