import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { HIGLASS_SERVER } from "../config";
import { baseUrl } from "../utils/appUtils";
import "../higlass_plugins";

// no race protection for now

const EMPTY_VIEWCONFIG = {
  editable: false,
  trackSourceServers: [HIGLASS_SERVER],
  views: [],
};

const SEQUENCE_TRACK_UID = "sequence_track";
const MAX_MATRIX_ROWS = 12;
const LOCKED_INITIAL_TILESET_UID = "finishedfile";

function clone(obj) {
  return typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
}

function buildBaseView(uid) {
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

function applySequenceTrack(baseConfig, { activated, current_chromosome_object }) {
  if (!baseConfig) return EMPTY_VIEWCONFIG;

  const next = clone(baseConfig);
  const view = next?.views?.[0];
  if (!view) return next;

  view.tracks = view.tracks ?? {};
  view.tracks.left = Array.isArray(view.tracks.left) ? view.tracks.left : [];

  if (!activated || !current_chromosome_object?.sequence) {
    return next;
  }

  view.tracks.left.push({
    type: "sequence-text",
    uid: SEQUENCE_TRACK_UID,
    width: 25,
    options: {
      label: `${current_chromosome_object.name} @ ${current_chromosome_object.absolutePosition}`,
      labelPosition: "topLeft",
      backgroundColor: "white",
      sequence: current_chromosome_object.sequence,
      fontSize: 18,
      leftPadding: 6,
      rowOffset: 0,
    },
  });

  return next;
}

function applyLogoTracks(baseConfig, { activated, logo_trackUid }) {
  if (!baseConfig) return EMPTY_VIEWCONFIG;

  const next = clone(baseConfig);
  const view = next?.views?.[0];
  if (!view) return next;

  view.tracks = view.tracks ?? {};
  view.tracks.top = Array.isArray(view.tracks.top) ? view.tracks.top : [];

  if (!activated || !logo_trackUid) {
    return next;
  }

  view.tracks.top.unshift({
    type: "seqlogo",
    uid: "logo_track",
    height: 50,
    tilesetUid: logo_trackUid,
    server: HIGLASS_SERVER,
    options: {
      backgroundColor: "white",
    },
  });

  return next;
}

function applyMatrixTracks(
  baseConfig,
  { activated, matrixUid, matrixRowCount, lineMode, addLog }
) {
  if (!baseConfig) return EMPTY_VIEWCONFIG;

  const next = clone(baseConfig);
  const view = next?.views?.[0];
  if (!view) return next;

  view.tracks = view.tracks ?? {};
  view.tracks.top = Array.isArray(view.tracks.top) ? view.tracks.top : [];

  if (!activated || !matrixUid) {
    return next;
  }

  if (lineMode) {
    if (!Number.isFinite(matrixRowCount) || matrixRowCount <= 0) {
      addLog?.(`applyMatrixTracks: invalid matrixRowCount=${matrixRowCount}`);
      return next;
    }

    const rowsToRender = Math.min(matrixRowCount, MAX_MATRIX_ROWS);

    for (let i = 1; i <= rowsToRender; i++) {
      view.tracks.top.push({
        type: "line",
        uid: `mv-single_row_${i}`,
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

  return next;
}

async function fetchAllTilesetUids(addLog) {
  const base = baseUrl(HIGLASS_SERVER);
  let url = `${base}/tilesets/?limit=100`;
  const seen = new Set();
  const uids = new Set();

  while (url) {
    if (seen.has(url)) {
      addLog?.(`fetchAllTilesetUids stopped: repeated url`);
      break;
    }

    seen.add(url);

    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      credentials: "omit",
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`tilesets fetch failed: ${res.status}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`tilesets JSON parse failed: ${String(e)}`);
    }

    for (const item of data?.results ?? []) {
      const id = item?.uuid ?? item?.uid;
      if (id) uids.add(id);
    }

    url = data?.next ?? null;
  }

  return uids;
}

async function waitForTilesetUid(
  uid,
  { addLog, timeoutMs = 60000, intervalMs = 1000 } = {}
) {
  if (!uid) return false;

  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const have = await fetchAllTilesetUids(addLog);
      if (have.has(uid)) {
        return true;
      }
    } catch (e) {
      addLog?.(`waitForTilesetUid fetch error: ${String(e)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  addLog?.(`waitForTilesetUid timeout: uid="${uid}"`);
  return false;
}

function deriveRowCountFromTilesetInfo(data, uid) {
  if (!data) return 0;

  const infoObj = data?.[uid] ?? data;

  const rowInfosLen = Array.isArray(infoObj?.row_infos)
    ? infoObj.row_infos.length
    : 0;
  if (rowInfosLen > 0) return rowInfosLen;

  const rowInfoLen = Array.isArray(infoObj?.rowInfo)
    ? infoObj.rowInfo.length
    : 0;
  if (rowInfoLen > 0) return rowInfoLen;

  const shape1 = Array.isArray(infoObj?.shape) ? infoObj.shape?.[1] : 0;
  if (Number.isFinite(shape1) && shape1 > 0) return shape1;

  const numRows = infoObj?.numRows;
  if (Number.isFinite(numRows) && numRows > 0) return numRows;

  return 0;
}

async function fetchTilesetRowCount(uid, addLog) {
  if (!uid) return 0;

  const base = baseUrl(HIGLASS_SERVER);
  const tilesetInfoUrl = `${base}/tileset_info/?d=${encodeURIComponent(uid)}`;

  const res = await fetch(tilesetInfoUrl, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    credentials: "omit",
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`tileset_info fetch failed: ${res.status}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`tileset_info JSON parse failed: ${String(e)}`);
  }

  const rowCount = deriveRowCountFromTilesetInfo(json, uid);
  addLog?.(`matrix row count loaded: uid="${uid}" rows=${rowCount}`);
  return rowCount;
}

function normalizeChromosomeObject(value) {
  if (!value || typeof value !== "object") {
    return {
      name: "",
      sequence: "",
      absolutePosition: 0,
    };
  }

  return {
    name: String(value.name ?? ""),
    sequence: String(value.sequence ?? ""),
    absolutePosition: Number(value.absolutePosition ?? 0),
  };
}

function findChromosomeObjectByName(all_chromosome_objects, name) {
  const wanted = String(name ?? "").trim();
  if (!wanted) return null;

  return (
    all_chromosome_objects.find(
      (item) => String(item?.name ?? "").trim() === wanted
    ) ?? null
  );
}

function chromosomeObjectsAreEqual(a, b) {
  return (
    a?.name === b?.name &&
    a?.sequence === b?.sequence &&
    a?.absolutePosition === b?.absolutePosition
  );
}

export function useRenderViewConfig({
  addLog,
  timeoutMs = 60000,
  intervalMs = 1000,
  onConfigApplied,
} = {}) {
  const didMountRef = useRef(false);

  const [main_heatmapUid, setMainHeatmapUidState] = useState(
    LOCKED_INITIAL_TILESET_UID
  );
  const [matrixUid, setMatrixUidState] = useState(null);
  const [logo_trackUid, setLogoTrackUidState] = useState(null);

  const [current_chromosome_object, setCurrentChromosomeObjectState] = useState(
    normalizeChromosomeObject(null)
  );

  const [lineMode, setLineMode] = useState(false);
  //intital values for active status
  const [matrixActivated, setMatrixActivated] = useState(false);
  const [logoActivated, setLogoActivated] = useState(false);
  const [sequence_trackActivated, setSequenceTrackActivated] = useState(false);

  const [matrixRowCount, setMatrixRowCount] = useState(0);
  const [canActivateLines, setCanActivateLines] = useState(false);

  const [all_main_heatmapUids, setAllMainHeatmapUids] = useState([
    LOCKED_INITIAL_TILESET_UID,
  ]);
  const [all_matrixUids, setAllMatrixUids] = useState([]);
  const [all_logoUids, setAllLogoUids] = useState([]);
  const [all_chromosome_objects, setAllChromosomeObjects] = useState([]);

  const [pendingMainHeatmapUid, setPendingMainHeatmapUid] = useState(false);
  const [pendingMatrixUid, setPendingMatrixUid] = useState(false);
  const [pendingLogoTrackUid, setPendingLogoTrackUid] = useState(false);

  const allChromosomeObjectsRef = useRef(all_chromosome_objects);

  useEffect(() => {
    allChromosomeObjectsRef.current = all_chromosome_objects;
  }, [all_chromosome_objects]);

  useEffect(() => {
    if (!matrixUid) {
      setCanActivateLines(false);
      return;
    }

    const n = Math.min(MAX_MATRIX_ROWS, Number(matrixRowCount) || 0);
    if (!Number.isFinite(n) || n <= 0) {
      setCanActivateLines(false);
      return;
    }

    const wantedUid = `${matrixUid}_row_${n}`;
    let cancelled = false;
    let inFlight = false;

    const checkAvailability = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;

      try {
        const have = await fetchAllTilesetUids(addLog);
        const ok = have.has(wantedUid);

        if (!cancelled) {
          setCanActivateLines(ok);
        }
      } catch (e) {
        addLog?.(`line-check fetch error: ${String(e)}`);
        if (!cancelled) setCanActivateLines(false);
      } finally {
        inFlight = false;
      }
    };

    checkAvailability();
    const timer = setInterval(checkAvailability, 3000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [matrixUid, matrixRowCount, addLog]);

  useEffect(() => {
    if (!canActivateLines && lineMode) {
      setLineMode(false);
      addLog?.("line mode disabled because row tiles are unavailable");
    }
  }, [canActivateLines, lineMode, addLog]);

  const config = useMemo(() => {
    if (!main_heatmapUid) {
      return EMPTY_VIEWCONFIG;
    }

    const base = buildBaseView(main_heatmapUid);

    const withSequence = applySequenceTrack(base, {
      activated: sequence_trackActivated,
      current_chromosome_object,
    });

    const withLogo = applyLogoTracks(withSequence, {
      activated: logoActivated,
      logo_trackUid,
    });

    const withMatrix = applyMatrixTracks(withLogo, {
      activated: matrixActivated,
      matrixUid,
      matrixRowCount,
      lineMode,
      addLog,
    });

    return withMatrix ?? EMPTY_VIEWCONFIG;
  }, [
    main_heatmapUid,
    matrixUid,
    logo_trackUid,
    current_chromosome_object,
    lineMode,
    matrixActivated,
    logoActivated,
    sequence_trackActivated,
    matrixRowCount,
    addLog,
  ]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    onConfigApplied?.();
  }, [config, onConfigApplied]);

  const setMainHeatmapUid = useCallback(
    async (uid) => {
      if (!uid) {
        return false;
      }
      addLog?.(`setting main heatmap uid in use view config: "${uid}"`);

      setPendingMainHeatmapUid(true);

      try {
        const ok = await waitForTilesetUid(uid, { addLog, timeoutMs, intervalMs });
        if (!ok) return false;

        setMainHeatmapUidState(uid);
        setAllMainHeatmapUids((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
        addLog?.(`main heatmap set: "${uid}"`);
        return true;
      } finally {
        setPendingMainHeatmapUid(false);
      }
    },
    [addLog, timeoutMs, intervalMs]
  );

const setMatrixUid = useCallback(
  async (uid) => {
    if (!uid) {
      return false;
    }

    setPendingMatrixUid(true);

    try {
      const ok = await waitForTilesetUid(uid, { addLog, timeoutMs, intervalMs });
      if (!ok) return false;



      setMatrixUidState(uid);
      setMatrixActivated(true);
      
      setAllMatrixUids((prev) => (prev.includes(uid) ? prev : [...prev, uid]));

      addLog?.(`matrix mode: on`);
      const rowCount = await fetchTilesetRowCount(uid, addLog);
      setMatrixRowCount(rowCount);
      addLog?.(`matrix set: "${uid}" rows=${rowCount}`);
      return true;
    } catch (e) {
      addLog?.(`setMatrixUid failed: ${String(e)}`);
      return false;
    } finally {
      setPendingMatrixUid(false);
    }
  },
  [addLog, timeoutMs, intervalMs]
);
const setLogoTrackUid = useCallback(
  async (uid) => {
    if (!uid) {
      return false;
    }

    setPendingLogoTrackUid(true);

    try {
      const ok = await waitForTilesetUid(uid, { addLog, timeoutMs, intervalMs });
      if (!ok) return false;

      setLogoTrackUidState(uid);
      setLogoActivated(true);
      setAllLogoUids((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
      addLog?.(`logo track set: "${uid}"`);
      addLog?.(`logo mode: on`);
      return true;
    } finally {
      setPendingLogoTrackUid(false);
    }
  },
  [addLog, timeoutMs, intervalMs]
);

const set_chromosome_object = useCallback(
  (value) => {
    // --- STRING INPUT (unchanged) ---
    if (typeof value === "string") {
      const found = findChromosomeObjectByName(
        allChromosomeObjectsRef.current,
        value
      );

      if (!found) {
        addLog?.(`set_chromosome_object discarded: name "${value}" not found`);
        return false;
      }

      setCurrentChromosomeObjectState(found);
      setSequenceTrackActivated(true);

      addLog?.(
        `chromosome object set by name: name="${found.name}" sequenceLength=${found.sequence.length} absolutePosition=${found.absolutePosition}`
      );
      addLog?.(`sequence track: on`);
      return true;
    }

    // --- VALIDATION ---
    if (!value || typeof value !== "object") {
      addLog?.(`set_chromosome_object discarded: invalid value`);
      return false;
    }

    const normalized = normalizeChromosomeObject(value);

    if (!normalized.name) {
      addLog?.(`set_chromosome_object discarded: empty chromosome name`);
      return false;
    }

    let finalObject = normalized;

    setAllChromosomeObjects((prev) => {
      // 1. Check if identical object already exists (ANY name, including _new variants)
      const existingIdentical = prev.find((item) =>
        chromosomeObjectsAreEqual(item, normalized)
      );

      if (existingIdentical) {
        finalObject = existingIdentical;

        addLog?.(
          `identical chromosome object already exists, reusing name="${existingIdentical.name}"`
        );

        return prev;
      }

      // 2. Ensure unique name
      let newName = normalized.name;

      const nameExists = (name) =>
        prev.some((item) => String(item.name) === String(name));

      if (nameExists(newName)) {
        while (nameExists(newName)) {
          newName = `${newName}_new`;
        }

        addLog?.(
          `name conflict detected, renamed "${normalized.name}" → "${newName}"`
        );
      }

      const candidate = {
        ...normalized,
        name: newName,
      };

      finalObject = candidate;

      return [...prev, candidate];
    });

    // Apply result (either reused or new)
    setCurrentChromosomeObjectState(finalObject);
    setSequenceTrackActivated(true);

    addLog?.(
      `chromosome object set: name="${finalObject.name}" sequenceLength=${finalObject.sequence.length} absolutePosition=${finalObject.absolutePosition}`
    );
    addLog?.(`sequence track: on`);

    return true;
  },
  [addLog]
);
  const addEmptyChromosomeTemp = useCallback(() => {
    const temp = normalizeChromosomeObject({
      name: `temp_${Date.now()}`,
      sequence: "",
      absolutePosition: 0,
    });

    setAllChromosomeObjects((prev) => {
      const exists = prev.some((item) => chromosomeObjectsAreEqual(item, temp));
      return exists ? prev : [...prev, temp];
    });
  }, []);

  const setMatrixRowCountValue = useCallback(
    (value) => {
      const next = Number(value) || 0;
      setMatrixRowCount(next);
      addLog?.(`matrix row count set: ${next}`);
    },
    [addLog]
  );

  const toggleLineMode = useCallback(() => {
    if (!canActivateLines) {
      addLog?.("toggleLineMode blocked: row tiles unavailable");
      return;
    }

    setLineMode((prev) => {
      const next = !prev;
      addLog?.(`line mode: ${next ? "on" : "off"}`);
      return next;
    });
  }, [canActivateLines, addLog]);

  const toggleMatrixMode = useCallback(() => {
    setMatrixActivated((prev) => {
      const next = !prev;
      addLog?.(`matrix mode: ${next ? "on" : "off"}`);
      return next;
    });
  }, [addLog]);

  const toggleLogoMode = useCallback(() => {
    setLogoActivated((prev) => {
      const next = !prev;
      addLog?.(`logo mode: ${next ? "on" : "off"}`);
      return next;
    });
  }, [addLog]);

  const toggleSequenceTrackMode = useCallback(() => {
    setSequenceTrackActivated((prev) => {
      const next = !prev;
      addLog?.(`sequence track: ${next ? "on" : "off"}`);
      return next;
    });
  }, [addLog]);

  return {
    config,

    main_heatmapUid,
    matrixUid,
    logo_trackUid,
    current_chromosome_object,

    lineMode,
    matrixActivated,
    logoActivated,
    sequence_trackActivated,

    matrixRowCount,
    canActivateLines,

    all_main_heatmapUids,
    all_matrixUids,
    all_logoUids,
    all_chromosome_objects,

    pendingMainHeatmapUid,
    pendingMatrixUid,
    pendingLogoTrackUid,

    setMainHeatmapUid,
    setMatrixUid,
    setLogoTrackUid,
    set_chromosome_object,
    addEmptyChromosomeTemp,
    setMatrixRowCount: setMatrixRowCountValue,

    toggleLineMode,
    toggleMatrixMode,
    toggleLogoMode,
    toggleSequenceTrackMode,
  };
}