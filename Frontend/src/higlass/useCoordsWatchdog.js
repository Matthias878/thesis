// src/higlass/useCoordsWatchdog.js
import { useEffect, useRef } from "react";

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
  const lastVal = useRef(undefined);          // last KNOWN value from mouseMoveZoom
  const lastEmittedVal = useRef(undefined);   // last value we actually emitted to onHover
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
    if (!uid) return void addLog?.("hover watchdog: could not determine view UID");

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

    // "pick the first one": use evt.data if present, else first element of dataLens.data
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

      const key = cell.cellY == null ? String(cell.cellX) : `${cell.cellX},${cell.cellY}`;

      // If this emit is just a coord update (cursorLocation), keep the last known value.
      const nextVal = preserveValue ? lastVal.current : v;

      // Dedupe based on what we *last emitted*, not on stored lastVal.
      if (key === lastKey.current && nextVal === lastEmittedVal.current) return;

      lastKey.current = key;
      lastEmittedVal.current = nextVal;

      // Only mouseMoveZoom is allowed to update the stored value — and only if defined.
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

      // Optional: ignore outside-heatmap cursorLocation noise
      // if (evt?.dataX === -1 || evt?.dataY === -1 || evt?.isFrom2dTrack === false) return;

      // Emit new coords but DO NOT clobber value
      emit(evt, undefined, { preserveValue: true });
    };
    api.on("cursorLocation", onCursor, uid);

    let onMmz;
    if (includeValue) {
      onMmz = (evt) => {
        const v = valueOf(evt);

        // Merge coords if mouseMoveZoom ever comes without them (some builds do)
        const hasCoords = Number.isFinite(Number(evt?.dataX));
        const merged = hasCoords ? evt : { ...(lastCursorEvt.current || {}), ...(evt || {}) };

        // This is the only place that may update lastVal
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
    if (!uid) return void addLog?.("coords watchdog: could not determine view UID");

    const id = setInterval(async () => {
      try {
        const xd = api.getLocation(uid)?.xDomain;
        if (!Array.isArray(xd) || xd.length !== 2) return;

        let x0 = Number(xd[0]);
        let x1 = Number(xd[1]);
        if (!Number.isFinite(x0) || !Number.isFinite(x1)) return;
        if (x0 > x1) [x0, x1] = [x1, x0];

        let i = Math.ceil(x0);
        let j = Math.floor(x1);
        if (i < 1) i = 1; // keep original 1-based clamp
        if (totalLength != null && Number.isFinite(totalLength) && j > totalLength) j = totalLength;
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
  }, [hgApiRef, hgApi, onUpdate, addLog, intervalMs, totalLength, fetchExcerpt]);
}