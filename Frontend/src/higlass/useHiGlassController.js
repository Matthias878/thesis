// src/higlass/useHiGlassController.js

import { useCallback, useRef, useState } from "react";
import { useCoordsWatchdog, useHoverCellWatchdog } from "./useCoordsWatchdog";

/**
 * Owns HiGlass instance/api refs + readiness + watchdog wiring.
 * Returns controller pieces App/Viewer can use.
 */
export function useHiGlassController({ addLog }) {
  // HiGlass instance + API refs (API can be delayed even after mount)
  const hgApiRef = useRef(null);
  const hgInstanceRef = useRef(null);
  const [hgApi, setHgApi] = useState(null);

  // hover / click debug state
  const [hoverCell, setHoverCell] = useState(null);
  const [clickedCell, setClickedCell] = useState(null);

  // coordinates / viewport position info from watchdog
  const [pos, setPos] = useState(null);

  // HiGlass API readiness: it may not be available immediately on mount
  const ensureApiReady = useCallback(
    (attempts = 40, intervalMs = 100) => {
      let n = 0;
      const t = window.setInterval(() => {
        n += 1;
        const inst = hgInstanceRef.current;
        const api = inst?.api;
        if (api && typeof api.getLocation === "function") {
          hgApiRef.current = api;
          setHgApi(api);
          addLog("HiGlass API ready");
          window.clearInterval(t);
          return;
        }
        if (n >= attempts) {
          addLog("HiGlass API not ready (timeout); watchdog features may be unavailable");
          window.clearInterval(t);
        }
      }, intervalMs);
      return () => window.clearInterval(t);
    },
    [addLog],
  );

  // HiGlass component ref callback
  const onHiGlassRef = useCallback(
    (instance) => {
      // unmount path
      if (!instance) {
        hgInstanceRef.current = null;
        hgApiRef.current = null;
        setHgApi(null);
        addLog("HiGlass unmounted -> api cleared");
        return;
      }

      // mount path
      hgInstanceRef.current = instance;

      const api = instance.api;
      if (api && typeof api.getLocation === "function") {
        hgApiRef.current = api;
        setHgApi(api);
        addLog("HiGlass API ready");
        return;
      }

      addLog("HiGlass mounted; waiting for API…");
      ensureApiReady();
    },
    [addLog, ensureApiReady],
  );

  // ---- Watchdogs: poll HiGlass for coords and hovered cell ----
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

  // capture click to “freeze” a hovered cell
  const onViewerMouseDown = useCallback(
    (e) => {
      if (e.button === 0 && hoverCell) setClickedCell({ ...hoverCell });
    },
    [hoverCell],
  );

  // hard reset viewer: clears refs; caller should bump viewerKey
  const clearApi = useCallback(() => {
    hgInstanceRef.current = null;
    hgApiRef.current = null;
    setHgApi(null);
    addLog("HiGlass refs cleared");
  }, [addLog]);

  return {
    hgApiRef,
    hgInstanceRef,
    hgApi,
    setHgApi, // rarely needed, but exported for completeness
    onHiGlassRef,
    clearApi,
    pos,
    hoverCell,
    clickedCell,
    onViewerMouseDown,
  };
}