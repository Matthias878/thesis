import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * FASTA format expected:
 *
 * >CHROMOSOME_NAME:STARTNUMBER-ENDNUMBER
 * SEQUENCE
 *
 * Example:
 * >myawesomeChromosome79:7558-7567
 * AACCGGTTTG
 */

function parseFastaMeta(fastaContent) {
  if (typeof fastaContent !== "string" || !fastaContent.trim()) {
    return {
      chromosomeName: null,
      startNumber: null,
      endNumber: null,
      sequence: "",
    };
  }

  const lines = fastaContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const header = lines.find((line) => line.startsWith(">")) || "";
  const sequence = lines.filter((line) => !line.startsWith(">")).join("");

  const match = header.match(/^>(.+):(\d+)-(\d+)$/);

  if (!match) {
    return {
      chromosomeName: null,
      startNumber: null,
      endNumber: null,
      sequence,
    };
  }

  return {
    chromosomeName: match[1],
    startNumber: Number(match[2]),
    endNumber: Number(match[3]),
    sequence,
  };
}

/**
 * not shifted absolute
 * The final displayed absolute X/Y positions are built later from:
 *   absoluteCoordinateBase + cellX
 *   absoluteCoordinateBase + cellY
 */
function formatAbsoluteCoordinateBaseAndRelativeIndex(meta, relativeIndex) {
  if (!Number.isFinite(relativeIndex)) return null;

  if (!Number.isFinite(meta?.startNumber)) {
    return {
      absoluteCoordinateBase: null,
      relativeIndex,
      text: `absolute coordinate base: (?) relative index: (${relativeIndex})`,
    };
  }

  const absoluteCoordinateBase = meta.startNumber;

  return {
    absoluteCoordinateBase,
    relativeIndex,
    text: `absolute coordinate base: (${absoluteCoordinateBase}) relative index: (${relativeIndex})`,
  };
}

function formatAbsoluteRelativeRange(meta, i, j) {
  if (!Number.isFinite(i) || !Number.isFinite(j)) return null;

  if (!Number.isFinite(meta?.startNumber)) {
    return {
      absoluteStart: null,
      absoluteEnd: null,
      relativeStart: i,
      relativeEnd: j,
      text: `absolute position: (?-?) relative position: (${i}-${j})`,
    };
  }

  const absoluteStart = meta.startNumber + i;
  const absoluteEnd = meta.startNumber + j;

  return {
    absoluteStart,
    absoluteEnd,
    relativeStart: i,
    relativeEnd: j,
    text: `absolute position: (${absoluteStart}-${absoluteEnd}) relative position: (${i}-${j})`,
  };
}

export function useHiGlassRange() {
  const lastRangeRef = useRef({
    start1: null,
    end1: null,
    viewUid: "view-1",
  });

  const updateLastRangeFromApi = useCallback((api) => {
    if (!api || typeof api.getLocation !== "function") return;

    const preferred = lastRangeRef.current.viewUid;
    let viewUid = preferred || "view-1";
    let xd = null;

    try {
      const loc = api.getLocation?.();
      const views = loc?.views ?? {};

      viewUid =
        (preferred && views[preferred] ? preferred : null) ||
        Object.keys(views)[0] ||
        viewUid;
      xd = views?.[viewUid]?.xDomain ?? null;
    } catch {}

    if ((!xd || xd.length !== 2) && viewUid) {
      try {
        xd = api.getLocation?.(viewUid)?.xDomain ?? null;
      } catch {}
    }

    if (!xd || xd.length !== 2) return;

    const start0 = Math.floor(Number(xd[0]));
    const end0ex = Math.ceil(Number(xd[1]));
    if (!Number.isFinite(start0) || !Number.isFinite(end0ex)) return;

    const start1 = start0 + 1;
    const end1 = Math.max(start1, end0ex);

    lastRangeRef.current.viewUid = viewUid;
    lastRangeRef.current.start1 = start1;
    lastRangeRef.current.end1 = end1;
  }, []);

  return { lastRangeRef, updateLastRangeFromApi };
}

export function useHoverCellWatchdog({
  hgApiRef,
  hgApi,
  onHover,
  addLog,
  viewUid = null,
  binSize = 1,
  toCell = null,
  includeValue = false,
}) {
  const lastKey = useRef("");
  const lastVal = useRef(undefined);
  const lastEmittedVal = useRef(undefined);
  const lastCursorEvt = useRef(null);

  useEffect(() => {
    const api = hgApi || hgApiRef.current;
    if (!api) return;

    if (typeof api.on !== "function" || typeof api.off !== "function") {
      addLog?.("hover watchdog: api.on/api.off not available");
      return;
    }

    let uid = viewUid;
    if (!uid) {
      try {
        uid = api.getViewConfig?.()?.views?.[0]?.uid;
      } catch {}
    }
    if (!uid) {
      addLog?.("hover watchdog: could not determine view UID");
      return;
    }

    const bs = binSize || 1;

    const mapCell = (evt) => {
      const dataX = Number(evt?.dataX);
      const dataY = evt?.dataY == null ? null : Number(evt.dataY);
      if (!Number.isFinite(dataX)) return null;

      if (toCell) return toCell({ dataX, dataY, event: evt });

      return {
        cellX: Math.floor(dataX / bs),
        cellY: Number.isFinite(dataY) ? Math.floor(dataY / bs) : null,
      };
    };

    const valueOf = (evt) => {
      if (Number.isFinite(evt?.data)) return evt.data;

      const arr = evt?.dataLens?.data;
      if (Array.isArray(arr) && arr.length > 0) {
        const v = arr[0];
        return Number.isFinite(v) ? v : undefined;
      }
      return undefined;
    };

    const emit = (evt, v, { preserveValue = false } = {}) => {
      const cell = mapCell(evt);
      if (!cell) return;

      const key =
        cell.cellY == null ? String(cell.cellX) : `${cell.cellX},${cell.cellY}`;
      const nextVal = preserveValue ? lastVal.current : v;

      if (key === lastKey.current && nextVal === lastEmittedVal.current) return;

      lastKey.current = key;
      lastEmittedVal.current = nextVal;

      if (!preserveValue && v !== undefined) {
        lastVal.current = v;
      }

      onHover?.({
        ...cell,
        dataX: evt?.dataX,
        dataY: evt?.dataY,
        absX: evt?.absX,
        absY: evt?.absY,
        relX: evt?.relX,
        relY: evt?.relY,
        relTrackX: evt?.relTrackX,
        relTrackY: evt?.relTrackY,
        value: nextVal,
      });
    };

    const onCursor = (evt) => {
      lastCursorEvt.current = evt || null;
      emit(evt, undefined, { preserveValue: true });
    };

    api.on("cursorLocation", onCursor, uid);

    let onMmz;
    if (includeValue) {
      onMmz = (evt) => {
        const v = valueOf(evt);
        const hasCoords = Number.isFinite(Number(evt?.dataX));
        const merged = hasCoords ? evt : { ...(lastCursorEvt.current || {}), ...(evt || {}) };
        emit(merged, v, { preserveValue: false });
      };
      api.on("mouseMoveZoom", onMmz);
    }

    return () => {
      try {
        api.off("cursorLocation", onCursor, uid);
        if (onMmz) api.off("mouseMoveZoom", onMmz);
      } catch (e) {
        addLog?.(`hover watchdog cleanup error: ${String(e)}`);
      }
    };
  }, [hgApiRef, hgApi, onHover, addLog, viewUid, binSize, toCell, includeValue]);
}

export function useCoordsWatchdog({
  hgApiRef,
  hgApi,
  onUpdate,
  addLog,
  intervalMs = 200,
  totalLength = null,
  fetchExcerpt = null,
  onRangeCapture = null,
}) {
  const lastKey = useRef("");
  const reqId = useRef(0);

  useEffect(() => {
    const api = hgApi || hgApiRef.current;
    if (!api) return;

    if (typeof api.getLocation !== "function" || typeof api.getViewConfig !== "function") {
      addLog?.("coords watchdog: getLocation()/getViewConfig() not available on API");
      return;
    }

    const uid = api.getViewConfig()?.views?.[0]?.uid;
    if (!uid) {
      addLog?.("coords watchdog: could not determine view UID");
      return;
    }

    const id = setInterval(async () => {
      try {
        onRangeCapture?.(api);

        const xd = api.getLocation(uid)?.xDomain;
        if (!Array.isArray(xd) || xd.length !== 2) return;

        let x0 = Number(xd[0]);
        let x1 = Number(xd[1]);
        if (!Number.isFinite(x0) || !Number.isFinite(x1)) return;
        if (x0 > x1) [x0, x1] = [x1, x0];

        let i = Math.ceil(x0);
        let j = Math.floor(x1);

        if (i < 1) i = 1;

        if (totalLength != null && Number.isFinite(totalLength) && j > totalLength) {
          j = totalLength;
        }

        if (j < i) return;

        const key = `${i}-${j}`;
        if (key === lastKey.current) return;
        lastKey.current = key;

        const base = { i, j, x0, x1, span: j - i + 1 };
        onUpdate?.(base);

        if (fetchExcerpt) {
          const my = ++reqId.current;
          const excerpt = await fetchExcerpt(i, j);
          if (my === reqId.current) onUpdate?.({ ...base, excerpt });
        }
      } catch (e) {
        addLog?.(`coords watchdog error: ${String(e)}`);
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [hgApiRef, hgApi, onUpdate, addLog, intervalMs, totalLength, fetchExcerpt, onRangeCapture]);
}

/**
 * Owns HiGlass instance/api refs + readiness + watchdog wiring.
 * Also owns FASTA file state/loading/parsing.
 */
export function useHiGlassController({ addLog }) {
  const hgApiRef = useRef(null);
  const hgInstanceRef = useRef(null);
  const [hgApi, setHgApi] = useState(null);

  const [hoverCell, setHoverCell] = useState(null);
  const [clickedCell, setClickedCell] = useState(null);
  const [pos, setPos] = useState(null);

  const [fastaFile, setFastaFile] = useState(null);
  const [fastaBusy, setFastaBusy] = useState(false);
  const [fastaContent, setFastaContent] = useState("");

  const { lastRangeRef, updateLastRangeFromApi } = useHiGlassRange();

  const fastaMeta = useMemo(() => parseFastaMeta(fastaContent), [fastaContent]);

  const handleFastaUpload = useCallback(async () => {
    if (!fastaFile) {
      addLog?.("FASTA upload blocked: no file selected");
      return;
    }

    try {
      setFastaBusy(true);
      const text = await fastaFile.text();
      setFastaContent(text);
      addLog?.(`FASTA file loaded: "${fastaFile.name}" (${text.length} chars)`);
    } catch (e) {
      setFastaContent("");
      addLog?.(`FASTA read error: ${String(e)}`);
    } finally {
      setFastaBusy(false);
    }
  }, [fastaFile, addLog]);

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
          updateLastRangeFromApi(api);
          addLog?.("HiGlass API ready");
          window.clearInterval(t);
          return;
        }

        if (n >= attempts) {
          addLog?.("HiGlass API not ready (timeout); watchdog features may be unavailable");
          window.clearInterval(t);
        }
      }, intervalMs);

      return () => window.clearInterval(t);
    },
    [addLog, updateLastRangeFromApi],
  );

  const onHiGlassRef = useCallback(
    (instance) => {
      if (!instance) {
        hgInstanceRef.current = null;
        hgApiRef.current = null;
        setHgApi(null);
        addLog?.("HiGlass unmounted -> api cleared");
        return;
      }

      hgInstanceRef.current = instance;

      const api = instance.api;
      if (api && typeof api.getLocation === "function") {
        hgApiRef.current = api;
        setHgApi(api);
        updateLastRangeFromApi(api);
        addLog?.("HiGlass API ready");
        return;
      }

      addLog?.("HiGlass mounted; waiting for API…");
      ensureApiReady();
    },
    [addLog, ensureApiReady, updateLastRangeFromApi],
  );

  useCoordsWatchdog({
    hgApiRef,
    hgApi,
    addLog,
    intervalMs: 200,
    onUpdate: setPos,
    onRangeCapture: updateLastRangeFromApi,
  });

  useHoverCellWatchdog({
    hgApiRef,
    hgApi,
    addLog,
    binSize: 1,
    includeValue: true,
    onHover: setHoverCell,
  });

  const onViewerMouseDown = useCallback(
    (e) => {
      if (e.button === 0 && hoverCell) {
        setClickedCell({ ...hoverCell });
      }
    },
    [hoverCell],
  );

  const clearApi = useCallback(() => {
    hgInstanceRef.current = null;
    hgApiRef.current = null;
    setHgApi(null);
    lastRangeRef.current = {
      start1: null,
      end1: null,
      viewUid: "view-1",
    };
    addLog?.("HiGlass refs cleared");
  }, [addLog, lastRangeRef]);

  const chromosomeName = fastaMeta.chromosomeName;

  const positionDisplay = useMemo(() => {
    if (!pos) return null;

    const formatted = formatAbsoluteRelativeRange(fastaMeta, pos.i, pos.j);
    if (!formatted) return null;

    return {
      ...pos,
      ...formatted,
      chromosomeName,
      text: `${formatted.text}\nchromosome name: (${chromosomeName ?? "unknown"})`,
    };
  }, [pos, fastaMeta, chromosomeName]);

  const hoverDisplay = useMemo(() => {
    if (!hoverCell) return null;

    const relativeIndex = Number.isFinite(hoverCell.cellX) ? hoverCell.cellX : null;
    const formatted = formatAbsoluteCoordinateBaseAndRelativeIndex(
      fastaMeta,
      relativeIndex
    );
    if (!formatted) return null;

    return {
      ...hoverCell,
      ...formatted,
      chromosomeName,
      text: `${formatted.text}\nchromosome name: (${chromosomeName ?? "unknown"})`,
    };
  }, [hoverCell, fastaMeta, chromosomeName]);

  const clickedDisplay = useMemo(() => {
    if (!clickedCell) return null;

    const relativeIndex = Number.isFinite(clickedCell.cellX) ? clickedCell.cellX : null;
    const formatted = formatAbsoluteCoordinateBaseAndRelativeIndex(
      fastaMeta,
      relativeIndex
    );
    if (!formatted) return null;

    return {
      ...clickedCell,
      ...formatted,
      chromosomeName,
      text: `${formatted.text}\nchromosome name: (${chromosomeName ?? "unknown"})`,
    };
  }, [clickedCell, fastaMeta, chromosomeName]);

  return {
    hgApiRef,
    hgInstanceRef,
    hgApi,
    setHgApi,
    onHiGlassRef,
    clearApi,
    pos,
    hoverCell,
    clickedCell,
    onViewerMouseDown,

    lastRangeRef,

    fastaFile,
    setFastaFile,
    fastaBusy,
    fastaContent,
    setFastaContent,
    handleFastaUpload,
    fastaMeta,
    chromosomeName,

    positionDisplay,
    hoverDisplay,
    clickedDisplay,
  };
}