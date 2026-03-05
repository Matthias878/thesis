// src/higlass/useHeatmapViewConfig.js


import { useCallback, useEffect, useRef, useState } from "react";
import { HIGLASS_SERVER } from "../config";
import { baseUrl } from "../utils/appUtils";

/**
 * Best-effort: try to extract row labels from common tileset-info shapes.
 * If missing, caller will fall back to Row N.
 */
export function getRowLabels(tilesetInfo) {
  if (!tilesetInfo) return [];

  // Common-ish patterns:
  // - row_infos: [{ names: [...] }]
  // - rowInfo / row_infos variants
  const ri = tilesetInfo.row_infos || tilesetInfo.rowInfos || tilesetInfo.rowInfo;
  if (Array.isArray(ri) && ri.length > 0) {
    const names = ri[0]?.names || ri[0]?.name || ri[0]?.labels;
    if (Array.isArray(names)) return names.map(String);
  }

  // Sometimes "rows" metadata is directly present
  if (Array.isArray(tilesetInfo.row_names)) return tilesetInfo.row_names.map(String);
  if (Array.isArray(tilesetInfo.rows)) return tilesetInfo.rows.map(String);

  return [];
}

/** Best-effort: derive multivec row count from tileset_info */
export function getRowCount(tilesetInfo) {
  if (!tilesetInfo) return 0;

  const s = tilesetInfo.shape || tilesetInfo.data_shape || tilesetInfo.dataShape;
  if (Array.isArray(s) && typeof s[0] === "number") return s[0];

  if (typeof tilesetInfo.rows === "number") return tilesetInfo.rows;
  if (typeof tilesetInfo.n_rows === "number") return tilesetInfo.n_rows;
  if (typeof tilesetInfo.nRows === "number") return tilesetInfo.nRows;

  return 0;
}

function baseView(heatmapUid) {
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
              tilesetUid: heatmapUid,
              server: HIGLASS_SERVER,
              options: {
                labelPosition: "bottomRight",
                labelText: heatmapUid,
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

// Only the heatmap, no tracks above it
export function buildHeatmapViewConfig(heatmapUid) {
  return baseView(heatmapUid);
}

// 4 1D tracks above the heatmap, one per nucleotide probability track
export function buildHeatmapWithTracksViewConfig(heatmapUid) {
  const config = baseView(heatmapUid);

  config.views[0].tracks.top = [
    {
      type: "line",
      uid: "pA",
      height: 40,
      tilesetUid: "a_track",
      server: HIGLASS_SERVER,
      options: { label: "P(A)", valueScaleMin: 0, valueScaleMax: 1 },
    },
    {
      type: "line",
      uid: "pC",
      height: 40,
      tilesetUid: "c_track",
      server: HIGLASS_SERVER,
      options: { label: "P(C)", valueScaleMin: 0, valueScaleMax: 1 },
    },
    {
      type: "line",
      uid: "pG",
      height: 40,
      tilesetUid: "g_track",
      server: HIGLASS_SERVER,
      options: { label: "P(G)", valueScaleMin: 0, valueScaleMax: 1 },
    },
    {
      type: "line",
      uid: "pT",
      height: 40,
      tilesetUid: "t_track",
      server: HIGLASS_SERVER,
      options: { label: "P(T)", valueScaleMin: 0, valueScaleMax: 1 },
    },
  ];

  return config;
}

export function stripMatrixTracks(config, { viewIndex = 0, uidPrefix = "mv-" } = {}) {
  if (!config) return config;

  const next = typeof structuredClone === "function" ? structuredClone(config) : JSON.parse(JSON.stringify(config));
  const view = next?.views?.[viewIndex];
  if (!view?.tracks?.top) return next;

  view.tracks.top = view.tracks.top.filter((t) => !(typeof t?.uid === "string" && t.uid.startsWith(uidPrefix)));
  return next;
}

export function addSingleMatrixTrack(
  config,
  matrixUid,
  {
    server = HIGLASS_SERVER,
    viewIndex = 0,
    uid = "mv-single",
    height = 140,
    label = null,
    splitRows = false,
    rowCount = 0,
    rowLabels = null, // optional labels array
  } = {},
) {
  if (!config || !matrixUid) return config;

  const next = typeof structuredClone === "function" ? structuredClone(config) : JSON.parse(JSON.stringify(config));

  const view = next?.views?.[viewIndex];
  if (!view) return config;

  view.tracks = view.tracks ?? {};
  view.tracks.top = Array.isArray(view.tracks.top) ? view.tracks.top : [];

  // Only block exact uid duplicates. Other duplicates are prevented by stripMatrixTracks(uidPrefix="mv-").
  const already = view.tracks.top.some((t) => t?.uid === uid);
  if (already) return next;

  // NORMAL MODE (horizontal multivec)
  if (!splitRows) {
    view.tracks.top.push({
      type: "horizontal-multivec",
      uid,
      tilesetUid: matrixUid,
      server,
      height,
      options: {
        label: label ?? `matrix: ${matrixUid}`,
        valueScaling: "linear",
      },
    });

    return next;
  }

  // ROW → LINE TRACK MODE
  if (!Number.isFinite(rowCount) || rowCount <= 0) return next;

  const labels = Array.isArray(rowLabels) && rowLabels.length > 0 ? rowLabels.map(String) : [];

  for (let i = 0; i < rowCount; i++) {
    const pretty = labels[i] ?? `row ${i}`;

    view.tracks.top.push({
      type: "line",
      uid: `${uid}-row-${i}`,
      tilesetUid: matrixUid,
      server,
      height,
      options: {
        label: `${label ?? matrixUid} ${pretty}`,
        valueScaling: "linear",
        selectRows: [i],
      },
    });
  }

  return next;
}

/**
 * Owns viewConfig + viewerKey and provides helpers/actions for:
 * - waiting for tilesets
 * - applying matrix tracks based on matrixMode
 *
 * matrixMode: "off" | "single" | "split"
 */
export function useHeatmapViewConfig({
  selectedUuid,
  logoTrackUsed,
  matrixMode = "off",
  matrixUid,
  addLog,
}) {
  const normMode = matrixMode === "split" || matrixMode === "single" ? matrixMode : "off";

  // always have *some* viewConfig; viewer stays mounted
  const [viewConfig, setViewConfig] = useState(() => buildHeatmapViewConfig(selectedUuid || ""));
  const [viewerKey, setViewerKey] = useState(0);
  const viewConfigReqIdRef = useRef(0);

  const bumpViewerKey = useCallback(() => setViewerKey((k) => k + 1), []);

  // poll HiGlass /tilesets/ until uids appear (meaning: queryable/available)
  const waitForHiGlassTilesetInfo = useCallback(
    async (uids, { timeoutMs = 60000, intervalMs = 1000 } = {}) => {
      const want = Array.isArray(uids) ? uids : [uids];
      const base = baseUrl(HIGLASS_SERVER);
      const url = `${base}/tilesets/`;
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
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, intervalMs));
            continue;
          }

          const have = new Set((data?.results ?? []).map((t) => t?.uuid ?? t?.uid).filter(Boolean));
          const missing = want.filter((u) => !have.has(u));

          addLog(`poll ${attempt}: results=${data?.results?.length ?? 0} missing=[${missing.join(", ")}]`);

          if (missing.length === 0) return true;
        } catch (err) {
          addLog(`poll ${attempt}: fetch error: ${String(err)}`);
        }

        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, intervalMs));
      }

      addLog(`waitForHiGlassTilesetInfo TIMEOUT: want=[${want.join(", ")}]`);
      return false;
    },
    [addLog],
  );

  // build “base” heatmap config depending on whether logo tracks are enabled
  const buildBaseHeatmapConfig = useCallback(
    (heatmapUid) =>
      logoTrackUsed ? buildHeatmapWithTracksViewConfig(heatmapUid) : buildHeatmapViewConfig(heatmapUid),
    [logoTrackUsed],
  );

  // add/strip a SINGLE matrix track (no probing)
  const applySingleMatrixTrack = useCallback((cfg, uid) => {
    if (!cfg) return cfg;

    if (!uid) return stripMatrixTracks(cfg, { uidPrefix: "mv-" });

    // strip old, then add (avoid duplicates & stale uids)
    let next = stripMatrixTracks(cfg, { uidPrefix: "mv-" });

    next = addSingleMatrixTrack(next, uid, {
      server: HIGLASS_SERVER,
      uid: `mv-single-${uid}`,
      height: 160,
      label: `matrix (single): ${uid}`,
    });

    return next;
  }, []);

  // fetch tileset_info (needed for split-rows mode)
  const fetchTilesetInfo = useCallback(async (tilesetUid) => {
    const base = baseUrl(HIGLASS_SERVER);
    const url = `${base}/tileset_info/?d=${encodeURIComponent(tilesetUid)}`;

    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      credentials: "omit",
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`tileset_info HTTP ${res.status}: ${text.slice(0, 200)}`);

    let j;
    try {
      j = JSON.parse(text);
    } catch (e) {
      throw new Error(`tileset_info JSON parse failed: ${String(e)}; body="${text.slice(0, 200)}"`);
    }

    // sometimes keyed by uid, sometimes direct object
    return j?.[tilesetUid] ?? j;
  }, []);

  // Apply split rows onto an existing cfg (async because needs tileset_info)
  const applySplitRowsTrack = useCallback(
    async (cfg, uid) => {
      if (!cfg) return cfg;
      if (!uid) return stripMatrixTracks(cfg, { uidPrefix: "mv-" });

      let next = stripMatrixTracks(cfg, { uidPrefix: "mv-" });

      addLog(`split-rows: fetching tileset_info for ${uid}…`);
      const info = await fetchTilesetInfo(uid);

      const rowCount = getRowCount(info);
      const rowLabels = getRowLabels(info);

      if (!rowCount || rowCount <= 0) {
        addLog("split-rows: could not determine rowCount; leaving matrix tracks OFF");
        return next;
      }

      next = addSingleMatrixTrack(next, uid, {
        server: HIGLASS_SERVER,
        uid: `mv-split-${uid}`,
        height: 40,
        label: `matrix (rows): ${uid}`,
        splitRows: true,
        rowCount,
        rowLabels,
      });

      return next;
    },
    [addLog, fetchTilesetInfo],
  );

  // Apply heatmap viewConfig ONLY AFTER required tilesets are queryable
  useEffect(() => {
    const heatmapUid = selectedUuid;
    if (!heatmapUid) return;

    const reqId = ++viewConfigReqIdRef.current;
    let cancelled = false;

    (async () => {
      const required = [heatmapUid];
      if (logoTrackUsed) required.push("a_track", "c_track", "g_track", "t_track");

      // If matrix mode is enabled, wait for matrix tileset too.
      if (normMode !== "off" && matrixUid) required.push(matrixUid);

      addLog(`waiting for tilesets: ${required.join(", ")} …`);
      const ok = await waitForHiGlassTilesetInfo(required, { timeoutMs: 60000, intervalMs: 250 });

      if (cancelled || viewConfigReqIdRef.current !== reqId) return;

      if (!ok) {
        addLog("TIMEOUT: required tilesets not ready -> keeping previous view");
        return;
      }

      try {
        let cfg = buildBaseHeatmapConfig(heatmapUid);

        // SINGLE SOURCE OF TRUTH: apply matrix tracks here.
        if (normMode === "split" && matrixUid) {
          cfg = await applySplitRowsTrack(cfg, matrixUid);
        } else if (normMode === "single" && matrixUid) {
          cfg = applySingleMatrixTrack(cfg, matrixUid);
        } else {
          cfg = applySingleMatrixTrack(cfg, ""); // strip mv- tracks
        }

        if (cancelled || viewConfigReqIdRef.current !== reqId) return;

        setViewConfig(cfg);
        bumpViewerKey();
        addLog("heatmap viewConfig applied ✓");
      } catch (e) {
        if (cancelled || viewConfigReqIdRef.current !== reqId) return;
        addLog(`build heatmap viewConfig failed: ${String(e)} -> keeping previous view`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selectedUuid,
    logoTrackUsed,
    normMode,
    matrixUid,
    addLog,
    waitForHiGlassTilesetInfo,
    buildBaseHeatmapConfig,
    applySingleMatrixTrack,
    applySplitRowsTrack,
    bumpViewerKey,
  ]);

  // Imperative helpers used by uploads/buttons (keeps App smaller)
  // NOTE: If the UI is state-driven via matrixMode, prefer changing matrixMode instead of calling these.
  const applySingleMatrixNow = useCallback(
    (heatmapUid, uid) => {
      let cfg = buildBaseHeatmapConfig(heatmapUid);
      cfg = applySingleMatrixTrack(cfg, uid);
      setViewConfig(cfg);
      bumpViewerKey();
      addLog(`matrix single track applied ✓ (uid=${uid})`);
    },
    [addLog, applySingleMatrixTrack, buildBaseHeatmapConfig, bumpViewerKey],
  );

  const clearMatrixTracksNow = useCallback(
    (heatmapUid) => {
      let cfg = buildBaseHeatmapConfig(heatmapUid);
      cfg = applySingleMatrixTrack(cfg, "");
      setViewConfig(cfg);
      bumpViewerKey();
      addLog("matrix tracks cleared ✓");
    },
    [addLog, applySingleMatrixTrack, buildBaseHeatmapConfig, bumpViewerKey],
  );

  // Kept for advanced/debug use (NOT recommended for normal UI button clicks)
  const applySplitRowsNow = useCallback(
    async (heatmapUid, uid) => {
      let cfg = buildBaseHeatmapConfig(heatmapUid);
      cfg = stripMatrixTracks(cfg, { uidPrefix: "mv-" });

      addLog(`split-rows: fetching tileset_info for ${uid}…`);
      const info = await fetchTilesetInfo(uid);

      const rowCount = getRowCount(info);
      const rowLabels = getRowLabels(info);

      if (!rowCount || rowCount <= 0) {
        addLog("split-rows: could not determine rowCount from tileset_info; leaving matrix tracks OFF");
        setViewConfig(cfg);
        bumpViewerKey();
        return { ok: false, rowCount: 0 };
      }

      cfg = addSingleMatrixTrack(cfg, uid, {
        server: HIGLASS_SERVER,
        uid: `mv-split-${uid}`,
        height: 40,
        label: `matrix (rows): ${uid}`,
        splitRows: true,
        rowCount,
        rowLabels,
      });

      setViewConfig(cfg);
      bumpViewerKey();
      addLog(`split-rows ON ✓ (rows=${rowCount}, uid=${uid})`);
      return { ok: true, rowCount };
    },
    [addLog, buildBaseHeatmapConfig, bumpViewerKey, fetchTilesetInfo],
  );

  return {
    viewConfig,
    viewerKey,
    bumpViewerKey,

    // exported helpers for other hooks
    waitForHiGlassTilesetInfo,

    // exported imperative actions
    applySingleMatrixNow,
    clearMatrixTracksNow,
    applySplitRowsNow,
  };
}