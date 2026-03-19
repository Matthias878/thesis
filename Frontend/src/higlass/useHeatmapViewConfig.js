import { useState, useCallback, useEffect, useMemo } from "react";
import { HIGLASS_SERVER } from "../config";
import { baseUrl } from "../utils/appUtils";
import "../higlass_plugins";

const EMPTY_VIEWCONFIG = {
  editable: false,
  trackSourceServers: [HIGLASS_SERVER],
  views: [],
};

export function useTilesetInfo(
  uid,
  { addLog, enabled = true, timeoutMs = 60000, intervalMs = 1000 } = {},
) {
  const [rowCount, setRowCount] = useState(0);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const deriveRowCountFromTilesetInfo = useCallback(
    (data) => {
      if (!data) return 0;

      const infoObj = data?.[uid] ?? data;

      const rowInfosLen = Array.isArray(infoObj?.row_infos) ? infoObj.row_infos.length : 0;
      if (rowInfosLen > 0) return rowInfosLen;

      const rowInfoLen = Array.isArray(infoObj?.rowInfo) ? infoObj.rowInfo.length : 0;
      if (rowInfoLen > 0) return rowInfoLen;

      const shape1 = Array.isArray(infoObj?.shape) ? infoObj.shape?.[1] : 0;
      if (Number.isFinite(shape1) && shape1 > 0) return shape1;

      const numRows = infoObj?.numRows;
      if (Number.isFinite(numRows) && numRows > 0) return numRows;

      return 0;
    },
    [uid],
  );

  useEffect(() => {
    if (!enabled || !uid) {
      addLog?.(`useTilesetInfo reset: enabled=${enabled} uid="${uid}"`);
      setRowCount(0);
      setInfo(null);
      setLoading(false);
      setReady(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const run = async () => {
      const base = baseUrl(HIGLASS_SERVER);
      const tilesetsUrl = `${base}/tilesets/?limit=1000`;
      const tilesetInfoUrl = `${base}/tileset_info/?d=${encodeURIComponent(uid)}`;
      const start = Date.now();

      setLoading(true);
      setReady(false);
      setError(null);

      addLog?.(`useTilesetInfo start: uid="${uid}"`);
      addLog?.(`useTilesetInfo polling tilesetsUrl="${tilesetsUrl}" tilesetInfoUrl="${tilesetInfoUrl}"`);

      let attempt = 0;

      while (!cancelled && Date.now() - start < timeoutMs) {
        attempt += 1;
        addLog?.(`useTilesetInfo poll attempt=${attempt} elapsedMs=${Date.now() - start}`);

        try {
          const res = await fetch(tilesetsUrl, {
            cache: "no-store",
            headers: { Accept: "application/json" },
            credentials: "omit",
          });

          const text = await res.text();
          addLog?.(
            `useTilesetInfo /tilesets response: status=${res.status} ok=${res.ok} body="${text
              .slice(0, 200)
              .replace(/\s+/g, " ")}"`,
          );

          let data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            addLog?.(`useTilesetInfo /tilesets JSON parse failed: ${String(e)}`);
            await sleep(intervalMs);
            continue;
          }

          const have = new Set((data?.results ?? []).map((t) => t?.uuid ?? t?.uid).filter(Boolean));

          addLog?.(`useTilesetInfo /tilesets parsed: count=${have.size} lookingFor="${uid}" found=${have.has(uid)}`);

          if (!have.has(uid)) {
            await sleep(intervalMs);
            continue;
          }

          addLog?.(`useTilesetInfo tileset appeared: uid="${uid}"`);

          try {
            const res2 = await fetch(tilesetInfoUrl, {
              cache: "no-store",
              headers: { Accept: "application/json" },
              credentials: "omit",
            });

            const text2 = await res2.text();
            addLog?.(
              `useTilesetInfo /tileset_info response: status=${res2.status} ok=${res2.ok} body="${text2
                .slice(0, 200)
                .replace(/\s+/g, " ")}"`,
            );

            let infoJson;
            try {
              infoJson = JSON.parse(text2);
            } catch (e) {
              addLog?.(`useTilesetInfo /tileset_info JSON parse failed: ${String(e)}`);
              await sleep(intervalMs);
              continue;
            }

            const rows = deriveRowCountFromTilesetInfo(infoJson);
            addLog?.(`useTilesetInfo derived rowCount=${rows} for uid="${uid}"`);

            if (!cancelled) {
              addLog?.(`useTilesetInfo success: uid="${uid}" rowCount=${rows}`);
              setInfo(infoJson);
              setRowCount(rows);
              setReady(true);
              setLoading(false);
            }
            return;
          } catch (e) {
            addLog?.(`useTilesetInfo /tileset_info fetch error: ${String(e)}`);
          }
        } catch (e) {
          addLog?.(`useTilesetInfo /tilesets fetch error: ${String(e)}`);
        }

        await sleep(intervalMs);
      }

      if (!cancelled) {
        addLog?.(`useTilesetInfo TIMEOUT: uid="${uid}" timeoutMs=${timeoutMs}`);
        setError(new Error(`useTilesetInfo TIMEOUT: uid="${uid}"`));
        setLoading(false);
        setReady(false);
        setInfo(null);
        setRowCount(0);
      }
    };

    run();

    return () => {
      addLog?.(`useTilesetInfo cleanup: uid="${uid}"`);
      cancelled = true;
    };
  }, [uid, enabled, timeoutMs, intervalMs, addLog, deriveRowCountFromTilesetInfo]);

  return { info, rowCount, loading, ready, error };
}

function clone(obj) {
  return typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
}

function buildBaseView(uid, addLog) {
  addLog?.(`buildBaseView: heatmap uid="${uid}"`);
  return {
    editable: true,
    trackSourceServers: [HIGLASS_SERVER],
    views: [
      {
        uid: "view-1",
        layout: { w: 12, h: 12, x: 0, y: 0 },
        tracks: {
          top: [],
          left: [],
          center: [
            {
              type: "heatmap",
              uid: "heatmap-track-1",
              tilesetUid: uid,
              server: HIGLASS_SERVER,
              options: {
                labelPosition: "bottomRight",
                labelText: uid,
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
}

function applySequenzTrack(baseConfig, { activated, sequenzUid, sequenz, addLog }) {
  addLog?.(
    `applySequenzTrack start: activated=${activated} sequenzUid="${sequenzUid}" sequenzLength=${sequenz?.length ?? 0}`,
  );
  if (!baseConfig) return EMPTY_VIEWCONFIG;

  const next = clone(baseConfig);
  const view = next?.views?.[0];
  if (!view) return next;

  view.tracks = view.tracks ?? {};
  view.tracks.left = Array.isArray(view.tracks.left) ? view.tracks.left : [];

  if (!activated || !sequenzUid) {
    addLog?.(`applySequenzTrack skipped: activated=${activated} sequenzUid="${sequenzUid}"`);
    return next;
  }

  view.tracks.left.push({
    type: "sequence-text",
    uid: "sequenz-left-1",
    width: 25,
    options: {
      label: `sequenz: ${sequenzUid}`,
      labelPosition: "topLeft",
      backgroundColor: "white",
      sequence: sequenz,
      fontSize: 18,
      leftPadding: 6,
      rowOffset: 0,
    },
  });

  addLog?.(`applySequenzTrack: added left track "${sequenzUid}", leftCount=${view.tracks.left.length}`);
  return next;
}

function applyLogoTracks(baseConfig, { activated, logoTilesetUid, addLog }) {
  addLog?.(`applyLogoTracks start: activated=${activated} logoTilesetUid="${logoTilesetUid}"`);
  if (!baseConfig) return EMPTY_VIEWCONFIG;

  const next = clone(baseConfig);
  const view = next?.views?.[0];
  if (!view) return next;

  view.tracks = view.tracks ?? {};
  view.tracks.top = Array.isArray(view.tracks.top) ? view.tracks.top : [];

  if (!activated || !logoTilesetUid) {
    addLog?.("logo tileset uid does not exists or you did not activate logos");
    return next;
  }

  view.tracks.top.unshift({
    type: "seqlogo",
    uid: "logo_track",
    height: 50,
    tilesetUid: logoTilesetUid,
    server: HIGLASS_SERVER,
    options: {
      backgroundColor: "white",
    },
  });

  addLog?.(`applyLogoTracks: added 1 logo track, topCount=${view.tracks.top.length}`);
  addLog?.("applyLogoTracks: added logo tracks");
  return next;
}

function applyMatrixTracks(baseConfig, { activated, matrixUid, rowCount, splitToLines, addLog }) {
  addLog?.(
    `applyMatrixTracks start: activated=${activated} matrixUid="${matrixUid}" rowCount=${rowCount} splitToLines=${splitToLines}`,
  );
  if (!baseConfig) return EMPTY_VIEWCONFIG;

  const MAX_ROWS = 12;
  const next = clone(baseConfig);
  const view = next?.views?.[0];
  if (!view) return next;

  view.tracks = view.tracks ?? {};
  view.tracks.top = Array.isArray(view.tracks.top) ? view.tracks.top : [];

  if (!activated || !matrixUid) {
    addLog?.(`applyMatrixTracks skipped: activated=${activated} matrixUid="${matrixUid}"`);
    return next;
  }

  if (splitToLines) {
    addLog?.(`applyMatrixTracks line mode branch: rowCount=${rowCount}`);
    if (!Number.isFinite(rowCount) || rowCount <= 0) {
      addLog?.(`applyMatrixTracks line mode aborted: invalid rowCount=${rowCount}`);
      return next;
    }

    const rowsToRender = Math.min(rowCount, MAX_ROWS);
    if (rowCount > MAX_ROWS) {
      addLog?.(`Matrix rows limited: requested ${rowCount}, rendering ${MAX_ROWS}`);
    }

    addLog?.(`applyMatrixTracks rendering line tracks: rowsToRender=${rowsToRender}`);

    for (let i = 1; i <= rowsToRender; i++) {
      const uid = `mv-single_row_${i}`;

      addLog?.(`applyMatrixTracks add line track: uid="${uid}" tilesetUid="${matrixUid}_row_${i}"`);

      view.tracks.top.push({
        type: "line",
        uid,
        tilesetUid: `${matrixUid}_row_${i}`,
        server: HIGLASS_SERVER,
        height: 80,
        options: {
          label: `${matrixUid} row ${i}`,
          valueScaling: "linear",
          backgroundColor: "white",
          lineStrokeColor: "cyan",
          lineStrokeWidth: 3,
        },
      });
    }

    addLog?.(`applyMatrixTracks line mode done: topCount=${view.tracks.top.length}`);
    return next;
  }

  view.tracks.top.push({
    type: "horizontal-multivec",
    uid: "mv-single",
    tilesetUid: matrixUid,
    server: HIGLASS_SERVER,
    height: 140,
    options: {
      label: `matrix: ${matrixUid}`,
      valueScaling: "log",
    },
  });

  addLog?.(`applyMatrixTracks multivec done: topCount=${view.tracks.top.length}`);
  return next;
}

export function useHeatmapViewConfig({ addLog, sequenz: externalSequenz } = {}) {
  const [heatmapUid, setHeatmapUid] = useState(null);
  const [matrixTilesetUid, setMatrixTilesetUid] = useState(null);
  const [logoTilesetUid, setLogoTilesetUid] = useState(null);
  const [matrixRowCount, setMatrixRowCount] = useState(0);

  const [lineMode, setLineMode] = useState(false);
  const [matrixActivated, setMatrixActivated] = useState(true);
  const [logoActivated, setLogoActivated] = useState(true);
  const [canActivateLines, setCanActivateLines] = useState(false);

  const [sequenzTilesetUid, setSequenzTilesetUid] = useState("sequenz_track");
  const [sequenzActivated, setSequenzActivated] = useState(false);

  const sequenz = externalSequenz ?? "ACGTACGTAACCGGTT";

  useEffect(() => {
    addLog?.(`line-check effect: matrixUid="${matrixTilesetUid}" rowCount=${matrixRowCount}`);

    if (!matrixTilesetUid) {
      addLog?.("line-check aborted: no matrixTilesetUid");
      setCanActivateLines(false);
      return;
    }

    const n = Math.min(12, Number(matrixRowCount) || 0);
    addLog?.(`line-check computed row target n=${n}`);

    if (!Number.isFinite(n) || n <= 0) {
      addLog?.(`line-check aborted: invalid n=${n}`);
      setCanActivateLines(false);
      return;
    }

    const wantedUid = `${matrixTilesetUid}_row_${n}`;
    const base = baseUrl(HIGLASS_SERVER);
    const firstUrl = `${base}/tilesets/?limit=100`;

    let cancelled = false;
    let inFlight = false;

    const fetchAllTilesetUids = async (startUrl) => {
      const seen = new Set();
      const uids = new Set();
      let url = startUrl;

      while (url && !cancelled) {
        if (seen.has(url)) {
          addLog?.(`line-check pagination stopped: already seen url="${url}"`);
          break;
        }

        seen.add(url);
        addLog?.(`line-check fetching page: url="${url}"`);

        const res = await fetch(url, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          credentials: "omit",
        });

        const text = await res.text();
        const snippet = text.slice(0, 200).replace(/\s+/g, " ");

        addLog?.(`line-check response: url="${url}" status=${res.status} ok=${res.ok} body="${snippet}"`);

        if (!res.ok) {
          throw new Error(`tilesets fetch failed: ${res.status}`);
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(`tilesets JSON parse failed: ${String(e)}`);
        }

        const pageResults = data?.results ?? [];
        addLog?.(`line-check parsed page: url="${url}" pageCount=${pageResults.length}`);

        for (const t of pageResults) {
          const id = t?.uuid ?? t?.uid;
          if (id) uids.add(id);
        }

        addLog?.(`line-check accumulated uids=${uids.size}`);
        url = data?.next ?? null;
        if (url) addLog?.(`line-check next page: "${url}"`);
      }

      return uids;
    };

    const checkAvailability = async () => {
      if (cancelled || inFlight) {
        addLog?.(`line-check skipped: cancelled=${cancelled} inFlight=${inFlight}`);
        return;
      }

      inFlight = true;

      try {
        addLog?.(`line-check start: want="${wantedUid}" url="${firstUrl}"`);

        const have = await fetchAllTilesetUids(firstUrl);
        const ok = have.has(wantedUid);

        addLog?.(`line-check result: want="${wantedUid}" found=${ok} total=${have.size}`);

        if (!cancelled) {
          addLog?.(`line-check setCanActivateLines=${ok}`);
          setCanActivateLines(ok);
        }
      } catch (e) {
        addLog?.(`line-check fetch error: ${String(e)}`);
        if (!cancelled) {
          addLog?.("line-check setCanActivateLines=false due to fetch error");
          setCanActivateLines(false);
        }
      } finally {
        inFlight = false;
        addLog?.("line-check finished");
      }
    };

    checkAvailability();
    const timer = setInterval(checkAvailability, 3000);
    addLog?.("line-check interval started: 3000ms");

    return () => {
      addLog?.(`line-check cleanup: matrixUid="${matrixTilesetUid}" rowCount=${matrixRowCount}`);
      cancelled = true;
      clearInterval(timer);
    };
  }, [matrixTilesetUid, matrixRowCount, addLog]);

  useEffect(() => {
    addLog?.(`line-mode guard effect: canActivateLines=${canActivateLines} lineMode=${lineMode}`);
    if (!canActivateLines && lineMode) {
      setLineMode(false);
      addLog?.("line mode disabled because row tiles are unavailable");
    }
  }, [canActivateLines, lineMode, addLog]);

  const config = useMemo(() => {
    addLog?.(
      `config rebuild start: heatmapUid="${heatmapUid}" matrixUid="${matrixTilesetUid}" matrixRowCount=${matrixRowCount} lineMode=${lineMode} matrixActivated=${matrixActivated} logoActivated=${logoActivated} sequenzActivated=${sequenzActivated} canActivateLines=${canActivateLines}`,
    );

    if (!heatmapUid) {
      addLog?.("config rebuild: no heatmapUid, using EMPTY_VIEWCONFIG");
      return EMPTY_VIEWCONFIG;
    }

    const base = buildBaseView(heatmapUid, addLog);
    const withSequenz = applySequenzTrack(base, {
      activated: sequenzActivated,
      sequenzUid: sequenzTilesetUid,
      sequenz,
      addLog,
    });
    const withLogo = applyLogoTracks(withSequenz, {
      activated: logoActivated,
      logoTilesetUid,
      addLog,
    });
    const withMatrix = applyMatrixTracks(withLogo, {
      activated: matrixActivated,
      matrixUid: matrixTilesetUid,
      rowCount: matrixRowCount,
      splitToLines: lineMode,
      addLog,
    });

    addLog?.(
      `config rebuild done: topTracks=${withMatrix?.views?.[0]?.tracks?.top?.length ?? 0} leftTracks=${withMatrix?.views?.[0]?.tracks?.left?.length ?? 0} centerTracks=${withMatrix?.views?.[0]?.tracks?.center?.length ?? 0}`,
    );

    return withMatrix ?? EMPTY_VIEWCONFIG;
  }, [
    heatmapUid,
    matrixTilesetUid,
    matrixRowCount,
    lineMode,
    matrixActivated,
    logoActivated,
    logoTilesetUid,
    sequenzActivated,
    sequenzTilesetUid,
    sequenz,
    canActivateLines,
    addLog,
  ]);

  const setMatrixUidAndRowcount = useCallback(
    (uid, rowcount) => {
      addLog?.(`setMatrixUidAndRowcount: uid="${uid}" rowcount=${rowcount}`);
      setMatrixTilesetUid(uid);
      setMatrixRowCount(rowcount);
    },
    [addLog],
  );

  const setLogoUid = useCallback(
    (uid) => {
      setLogoTilesetUid(uid);
      addLog?.(`logoTilesetUid set -> "${uid}"`);
    },
    [addLog],
  );

  const setSequenzUid = useCallback(
    (uid) => {
      addLog?.(`sequenzTilesetUid set -> "${uid}"`);
      setSequenzTilesetUid(uid);
    },
    [addLog],
  );

  const toggleLineMode = useCallback(() => {
    addLog?.(`toggleLineMode called: canActivateLines=${canActivateLines} currentLineMode=${lineMode}`);
    if (!canActivateLines) {
      addLog?.("toggleLineMode blocked: canActivateLines=false");
      return;
    }
    setLineMode((v) => {
      const next = !v;
      addLog?.(`lineMode changed: ${v} -> ${next}`);
      return next;
    });
  }, [canActivateLines, lineMode, addLog]);

  const toggleMatrixMode = useCallback(() => {
    setMatrixActivated((v) => {
      const next = !v;
      addLog?.(`matrixActivated changed: ${v} -> ${next}`);
      return next;
    });
  }, [addLog]);

  const toggleLogoMode = useCallback(() => {
    setLogoActivated((v) => {
      const next = !v;
      addLog?.(`logoActivated changed: ${v} -> ${next}`);
      return next;
    });
  }, [addLog]);

  const toggleSequenzMode = useCallback(() => {
    setSequenzActivated((v) => {
      const next = !v;
      addLog?.(`sequenzActivated changed: ${v} -> ${next}`);
      return next;
    });
  }, [addLog]);

  return {
    config,
    setHeatmapUid,
    setMatrixUidAndRowcount,
    setLogoUid,
    setSequenzUid,
    toggleLineMode,
    toggleMatrixMode,
    toggleLogoMode,
    toggleSequenzMode,
    matrixActivated,
    lineMode,
    logoActivated,
    logoTilesetUid,
    canActivateLines,
    sequenzActivated,
    sequenz,
  };
}