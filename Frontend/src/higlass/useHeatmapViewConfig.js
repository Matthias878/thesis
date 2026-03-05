// src/higlass/useHeatmapViewConfig.js

import { useState, useCallback, useEffect, useRef } from "react";
import { HIGLASS_SERVER } from "../config";
import { baseUrl } from "../utils/appUtils";
import "../higlass_plugins";


/**
 * Safe fallback config so HiGlass never receives null.
 */
const EMPTY_VIEWCONFIG = {
  editable: false,
  trackSourceServers: [HIGLASS_SERVER],
  views: [],
};

/**
 * Poll HiGlass /tilesets/ until uid appears, then fetch /tileset_info/?d=uid
 * and derive a rowCount for multivec/rows.
 */
export function useTilesetInfo(uid, { addLog, enabled = true, timeoutMs = 60000, intervalMs = 1000 } = {}) {
  const [rowCount, setRowCount] = useState(0);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

const deriveRowCountFromTilesetInfo = useCallback((data) => {
  if (!data) return 0;

  const infoObj = data?.[uid] ?? data;

  // 1) Best: explicit row metadata
  const rowInfosLen = Array.isArray(infoObj?.row_infos) ? infoObj.row_infos.length : null;
  if (Number.isFinite(rowInfosLen) && rowInfosLen > 0) return rowInfosLen;

  const rowInfoLen = Array.isArray(infoObj?.rowInfo) ? infoObj.rowInfo.length : null;
  if (Number.isFinite(rowInfoLen) && rowInfoLen > 0) return rowInfoLen;

  // 2) Next: shape[1] (common convention: [tile_size, num_rows])
  const shape = Array.isArray(infoObj?.shape) ? infoObj.shape : null;
  const shape1 = shape?.[1];
  if (Number.isFinite(shape1) && shape1 > 0) return shape1;

  // 3) Fallbacks
  const numRows = infoObj?.numRows;
  if (Number.isFinite(numRows) && numRows > 0) return numRows;

  return 0;
}, [uid]);
  useEffect(() => {
    if (!enabled || !uid) {
      setRowCount(0);
      setInfo(null);
      setLoading(false);
      setReady(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      const base = baseUrl(HIGLASS_SERVER);
      const tilesetsUrl = `${base}/tilesets/`;
      const tilesetInfoUrl = `${base}/tileset_info/?d=${encodeURIComponent(uid)}`;
      const start = Date.now();

      setLoading(true);
      setReady(false);
      setError(null);

      addLog?.(`useTilesetInfo start: uid="${uid}"`);

      let attempt = 0;

      while (!cancelled && Date.now() - start < timeoutMs) {
        attempt += 1;

        try {
          const res = await fetch(tilesetsUrl, {
            cache: "no-store",
            headers: { Accept: "application/json" },
            credentials: "omit",
          });

          const text = await res.text();

          let data;
          try {
            data = JSON.parse(text);
          } catch {
            await new Promise((r) => setTimeout(r, intervalMs));
            continue;
          }

          const have = new Set((data?.results ?? []).map((t) => t?.uuid ?? t?.uid).filter(Boolean));

          if (have.has(uid)) {
            try {
              const res2 = await fetch(tilesetInfoUrl, {
                cache: "no-store",
                headers: { Accept: "application/json" },
                credentials: "omit",
              });

              const text2 = await res2.text();

              let infoJson;
              try {
                infoJson = JSON.parse(text2);
              } catch {
                await new Promise((r) => setTimeout(r, intervalMs));
                continue;
              }

              const rows = deriveRowCountFromTilesetInfo(infoJson);

              if (!cancelled) {
                setInfo(infoJson);
                setRowCount(rows);
                setReady(true);
                setLoading(false);
              }
              return;
            } catch {}
          }
        } catch {}

        await new Promise((r) => setTimeout(r, intervalMs));
      }

      if (!cancelled) {
        setError(new Error(`useTilesetInfo TIMEOUT: uid="${uid}"`));
        setLoading(false);
        setReady(false);
        setInfo(null);
        setRowCount(0);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [uid, enabled, timeoutMs, intervalMs, addLog, deriveRowCountFromTilesetInfo]);

  return { info, rowCount, loading, ready, error };
}

export function useHeatmapViewConfig({ addLog } = {}) {
  const [heatmapUid, setHeatmapUid] = useState(null);

  const [matrixTilesetUid, setMatrixTilesetUid] = useState(null);
  const [matrixRowCount, setMatrixRowCount] = useState(0);
  const [lineMode, setLineMode] = useState(false);
  const [matrixActivated, setMatrixActivated] = useState(true);

  const [logoActivated, setLogoActivated] = useState(false);

  const [config, setConfig] = useState(EMPTY_VIEWCONFIG);

  const oldMatrixUidsRef = useRef(new Set());
  const oldLogoUidsRef = useRef(new Set());

  const clone = useCallback((obj) => {
    return typeof structuredClone === "function"
      ? structuredClone(obj)
      : JSON.parse(JSON.stringify(obj));
  }, []);

  const buildBaseView = useCallback((uid) => {
    return {
      editable: true,
      trackSourceServers: [HIGLASS_SERVER],
      views: [
        {
          uid: "view-1",
          layout: { w: 12, h: 12, x: 0, y: 0 },
          tracks: {
            top: [],
            center: [
              {
                type: "heatmap",
                uid: "heatmap-track-1",
                tilesetUid: uid,
                server: HIGLASS_SERVER,
                options: {
                  labelPosition: "bottomRight",
                  labelText: uid,
                  colorRange: ["white", "rgba(245, 166, 35, 1.0)", "rgba(208, 2, 27, 1.0)", "black"],
                  maxZoom: null,
                },
              },
            ],
          },
        },
      ],
    };
  }, []);

  const applyLogoTracks = useCallback(
    (baseConfig, { activated }) => {
      if (!baseConfig) return EMPTY_VIEWCONFIG;

      const next = clone(baseConfig);
      const view = next?.views?.[0];
      if (!view) return next;

      view.tracks = view.tracks ?? {};
      view.tracks.top = Array.isArray(view.tracks.top) ? view.tracks.top : [];

      // remove old logo tracks we generated earlier
      const old = oldLogoUidsRef.current;
      view.tracks.top = view.tracks.top.filter((t) => !old.has(t?.uid));
      old.clear();

      if (!activated) return next;

      // hardcoded tileset UIDs 
      const server = HIGLASS_SERVER;
      const logoTracks = [//custom seqlogo track for A
          {
          type: "seqlogo",
          uid: "pA",
          height: 100,
          tilesetUid: "a_track",
          server,
          options: {},
},
        {
          type: "line",
          uid: "pC",
          height: 40,
          tilesetUid: "c_track",
          server,
          options: { label: "P(C)", valueScaleMin: 0, valueScaleMax: 1 },
        },
        {
          type: "line",
          uid: "pG",
          height: 40,
          tilesetUid: "g_track",
          server,
          options: { label: "P(G)", valueScaleMin: 0, valueScaleMax: 1 },
        },
        {
          type: "line",
          uid: "pT",
          height: 40,
          tilesetUid: "t_track",
          server,
          options: { label: "P(T)", valueScaleMin: 0, valueScaleMax: 1 },
        },
      ];

      for (const t of logoTracks) old.add(t.uid);

      // put them at the very top (before any matrix tracks)
      view.tracks.top = [...logoTracks, ...view.tracks.top];

      addLog?.("applyLogoTracks: added logo tracks");
      return next;
    },
    [clone, addLog],
  );

  const applyMatrixTracks = useCallback(
    (baseConfig, { activated, matrixUid, rowCount, splitToLines }) => {
      if (!baseConfig) return EMPTY_VIEWCONFIG;

      const MAX_ROWS = 12;
      const next = clone(baseConfig);
      const view = next?.views?.[0];
      if (!view) return next;

      view.tracks = view.tracks ?? {};
      view.tracks.top = Array.isArray(view.tracks.top) ? view.tracks.top : [];

      // remove old generated matrix tracks
      const oldUids = oldMatrixUidsRef.current;
      view.tracks.top = view.tracks.top.filter((t) => !oldUids.has(t?.uid));
      oldUids.clear();

      if (!activated || !matrixUid) return next;

      const uidBase = "mv-single";
      const server = HIGLASS_SERVER;

      if (splitToLines) {
        if (!Number.isFinite(rowCount) || rowCount <= 0) return next;

        let rowsToRender = rowCount;
        if (rowCount > MAX_ROWS) {
          rowsToRender = MAX_ROWS;
          addLog?.(`Matrix rows limited: requested ${rowCount}, rendering ${MAX_ROWS}`);
        }

        for (let i = 0; i < rowsToRender; i++) {
          const uid = `${uidBase}-row-${i}`;
          oldUids.add(uid);

          view.tracks.top.push({
            type: "multivec",
            uid,
            tilesetUid: matrixUid,
            server,
            height: 80,
            options: {
              label: `${matrixUid} row ${i}`,
              valueScaling: "linear",
              selectRows: [i],
            },
          });
        }

        return next;
      }

      // single multivec (non-line mode)
      const uid = uidBase;
      oldUids.add(uid);

      view.tracks.top.push({
        type: "horizontal-multivec",
        uid,
        tilesetUid: matrixUid,
        server,
        height: 140,
        options: {
          label: `matrix: ${matrixUid}`,
          valueScaling: "log",
        },
      });

      return next;
    },
    [clone, addLog],
  );

  useEffect(() => {
    if (!heatmapUid) {
      setConfig(EMPTY_VIEWCONFIG);
      return;
    }

    // start from base
    const base = buildBaseView(heatmapUid);

    // apply logo first so it stays on top
    const withLogo = applyLogoTracks(base, { activated: logoActivated });

    // then apply matrix (added below logo)
    const withMatrix = applyMatrixTracks(withLogo, {
      activated: matrixActivated,
      matrixUid: matrixTilesetUid,
      rowCount: matrixRowCount,
      splitToLines: lineMode,
    });

    setConfig(withMatrix ?? EMPTY_VIEWCONFIG);
  }, [
    heatmapUid,
    buildBaseView,
    applyLogoTracks,
    logoActivated,
    applyMatrixTracks,
    matrixActivated,
    matrixTilesetUid,
    matrixRowCount,
    lineMode,
  ]);

  const setMatrixUidAndRowcount = useCallback((uid, rowcount) => {
    setMatrixTilesetUid(uid);
    setMatrixRowCount(rowcount);
  }, []);

  const toggleLineMode = useCallback(() => setLineMode((v) => !v), []);
  const toggleMatrixMode = useCallback(() => setMatrixActivated((v) => !v), []);
  const toggleLogoMode = useCallback(() => setLogoActivated((v) => !v), []);

  return {
    config,
    setHeatmapUid,
    setMatrixUidAndRowcount,
    toggleLineMode,
    toggleMatrixMode,
    toggleLogoMode,        
    logoActivated,         
  };
}