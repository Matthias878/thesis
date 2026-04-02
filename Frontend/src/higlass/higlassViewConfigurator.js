import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { HIGLASS_SERVER } from "../config";
import "../higlass_plugins";

const EMPTY_CONFIG = { editable: false, trackSourceServers: [HIGLASS_SERVER], views: [] };

const SEQUENCE_TRACK_UID = "sequence_track";
const MAX_MATRIX_ROWS = 12;
const INITIAL_HEATMAP_UID = "finishedfile";
const VIEW_UID = "view-1";

const COLLECTION_NAMES = [
  "strawberry", "banana", "blueberry", "apple", "pear", "peach", "mango", "kiwi", "orange", "plum", "cherry", "raspberry", "blackberry", "melon", "grape", "pineapple",
];

const clone = (v) =>
  typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));

function useStateRef(initialValue) {
  const [state, setState] = useState(initialValue);
  const ref = useRef(state);

  const setBoth = useCallback((valueOrUpdater) => {
    setState((prev) => {
      const next = typeof valueOrUpdater === "function" ? valueOrUpdater(prev) : valueOrUpdater;
      ref.current = next;
      return next;
    });
  }, []);

  return [state, setBoth, ref];
}

const normalizeChromosome = (value) => ({
  name: String(value?.name ?? ""),
  sequence: String(value?.sequence ?? ""),
  absolutePosition: Number(value?.absolutePosition ?? 0),
});

const sameChromosome = (a, b) =>
  a?.name === b?.name &&
  a?.sequence === b?.sequence &&
  a?.absolutePosition === b?.absolutePosition;

const findChromosomeByName = (list, name) => {
  const wanted = String(name ?? "").trim();
  return wanted ? list.find((x) => String(x?.name ?? "").trim() === wanted) ?? null : null;
};

function insertChromosome(list, chromosome, addLog) {
  const identical = list.find((x) => sameChromosome(x, chromosome));
  if (identical) {
    addLog?.(`identical chromosome object already exists, reusing name="${identical.name}"`);
    return { item: identical, list };
  }

  const exists = (candidate) => list.some((x) => String(x.name) === String(candidate));
  let name = chromosome.name;

  if (exists(name)) {
    let nextName = name;
    while (exists(nextName)) nextName = `${nextName}_new`;
    addLog?.(`name conflict detected, renamed "${name}" → "${nextName}"`);
    name = nextName;
  }

  const item = { ...chromosome, name };
  return { item, list: [...list, item] };
}

function nextCollectionKey(collections) {
  for (const name of COLLECTION_NAMES) if (!collections[name]) return name;
  for (let suffix = 2; ; suffix += 1) {
    for (const name of COLLECTION_NAMES) {
      const candidate = `${name}_${suffix}`;
      if (!collections[candidate]) return candidate;
    }
  }
}

const buildBaseView = (uid) => ({
  editable: true,
  trackSourceServers: [HIGLASS_SERVER],
  views: [
    {
      uid: VIEW_UID,
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
});

function withTrackArea(viewConfig, area, apply) {
  const next = clone(viewConfig ?? EMPTY_CONFIG);
  const view = next?.views?.[0];
  if (!view) return next;
  view.tracks ??= {};
  view.tracks[area] ??= [];
  apply(view.tracks[area], view);
  return next;
}

const applySequenceTrack = (viewConfig, enabled, chromosome) =>
  !enabled || !chromosome?.sequence
    ? viewConfig ?? EMPTY_CONFIG
    : withTrackArea(viewConfig, "left", (tracks) => {
        tracks.push({
          type: "sequence-text",
          uid: SEQUENCE_TRACK_UID,
          width: 25,
          options: {
            label: `${chromosome.name} @ ${chromosome.absolutePosition}`,
            labelPosition: "topLeft",
            backgroundColor: "white",
            sequence: chromosome.sequence,
            fontSize: 18,
            leftPadding: 6,
            rowOffset: 0,
          },
        });
      });

const applyLogoTrack = (viewConfig, enabled, uid) =>
  !enabled || !uid
    ? viewConfig ?? EMPTY_CONFIG
    : withTrackArea(viewConfig, "top", (tracks) => {
        tracks.unshift({
          type: "seqlogo",
          uid: "logo_track",
          height: 50,
          tilesetUid: uid,
          server: HIGLASS_SERVER,
          options: { backgroundColor: "white" },
        });
      });

function applyMatrixTrack(viewConfig, { enabled, matrixUid, matrixRowCount, lineMode, addLog }) {
  if (!enabled || !matrixUid) return viewConfig ?? EMPTY_CONFIG;

  return withTrackArea(viewConfig, "top", (tracks) => {
    if (!lineMode) {
      tracks.push({
        type: "horizontal-multivec",
        uid: "mv-single",
        tilesetUid: matrixUid,
        server: HIGLASS_SERVER,
        height: 140,
        options: { label: `matrix: ${matrixUid}`, valueScaling: "log" },
      });
      return;
    }

    if (!Number.isFinite(matrixRowCount) || matrixRowCount <= 0) {
      addLog?.(`applyMatrixTracks: invalid matrixRowCount=${matrixRowCount}`);
      return;
    }

    for (let i = 1; i <= Math.min(matrixRowCount, MAX_MATRIX_ROWS); i += 1) {
      tracks.push({
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
  });
}

async function fetchJson(url, errorPrefix) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    credentials: "omit",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${errorPrefix}: ${res.status}`);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${errorPrefix} JSON parse failed: ${String(e)}`);
  }
}

async function fetchAllTilesetUids(addLog) {
  const base = String(HIGLASS_SERVER).replace(/\/$/, "");
  const visited = new Set();
  const uids = new Set();
  let url = `${base}/tilesets/?limit=100`;

  while (url) {
    if (visited.has(url)) {
      addLog?.("fetchAllTilesetUids stopped: repeated url");
      break;
    }
    visited.add(url);

    const data = await fetchJson(url, "tilesets fetch failed");
    for (const item of data?.results ?? []) {
      const id = item?.uuid ?? item?.uid;
      if (id) uids.add(id);
    }
    url = data?.next ?? null;
  }

  return uids;
}

async function waitForTilesetUid(uid, { addLog, timeoutMs = 60000, intervalMs = 1000 } = {}) {
  if (!uid) return false;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetchAllTilesetUids(addLog)).has(uid)) return true;
    } catch (e) {
      addLog?.(`waitForTilesetUid fetch error: ${String(e)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  addLog?.(`waitForTilesetUid timeout: uid="${uid}"`);
  return false;
}

function deriveRowCount(data, uid) {
  const info = data?.[uid] ?? data;
  return (
    info?.row_infos?.length ||
    info?.rowInfo?.length ||
    (Array.isArray(info?.shape) && Number.isFinite(info.shape?.[1]) && info.shape[1] > 0
      ? info.shape[1]
      : 0) ||
    (Number.isFinite(info?.numRows) && info.numRows > 0 ? info.numRows : 0)
  );
}

async function fetchTilesetRowCount(uid, addLog) {
  if (!uid) return 0;
  const base = String(HIGLASS_SERVER).replace(/\/$/, "");
  const json = await fetchJson(
    `${base}/tileset_info/?d=${encodeURIComponent(uid)}`,
    "tileset_info fetch failed"
  );
  const rowCount = deriveRowCount(json, uid);
  addLog?.(`matrix row count loaded: uid="${uid}" rows=${rowCount}`);
  return rowCount;
}

export function useRenderViewConfig({
  addLog,
  timeoutMs = 60000,
  intervalMs = 1000,
  reloadViewer,
} = {}) {
  const didMountRef = useRef(false);
  const hgInstanceRef = useRef(null);
  const hoverApiPollRef = useRef(null);
  const lastCursorEvtRef = useRef(null);
  const lastHoverKeyRef = useRef("");
  const lastHoverValueRef = useRef(undefined);
  const lastKnownValueRef = useRef(undefined);

  const [hgApi, setHgApi] = useState(null);

  const [mainHeatmapUid, setMainHeatmapUidState] = useState(INITIAL_HEATMAP_UID);
  const [matrixUid, setMatrixUidState] = useState(null);
  const [logoTrackUid, setLogoTrackUidState] = useState(null);
  const [currentChromosome, setCurrentChromosomeState] = useState(normalizeChromosome(null));

  const [lineMode, setLineMode] = useState(false);
  const [matrixEnabled, setMatrixEnabled] = useState(false);
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [sequenceEnabled, setSequenceEnabled] = useState(false);

  const [matrixRowCount, setMatrixRowCount] = useState(0);
  const [canActivateLines, setCanActivateLines] = useState(false);

  const [heatmapUids, setHeatmapUids, heatmapUidsRef] = useStateRef([INITIAL_HEATMAP_UID]);
  const [matrixUids, setMatrixUids, matrixUidsRef] = useStateRef([]);
  const [logoUids, setLogoUids, logoUidsRef] = useStateRef([]);
  const [chromosomes, setChromosomes, chromosomesRef] = useStateRef([]);
  const [savedCollections, setSavedCollections, savedCollectionsRef] = useStateRef({});

  const [hoverCell, setHoverCell] = useState(null);

  const resetHoverState = useCallback(() => {
    setHoverCell(null);
    lastCursorEvtRef.current = null;
    lastHoverKeyRef.current = "";
    lastHoverValueRef.current = undefined;
    lastKnownValueRef.current = undefined;
  }, []);

  useEffect(
    () => () => {
      if (hoverApiPollRef.current) {
        window.clearInterval(hoverApiPollRef.current);
        hoverApiPollRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (!matrixUid) return void setCanActivateLines(false);

    const rows = Math.min(MAX_MATRIX_ROWS, Number(matrixRowCount) || 0);
    if (!Number.isFinite(rows) || rows <= 0) return void setCanActivateLines(false);

    const wantedUid = `${matrixUid}_row_${rows}`;
    let cancelled = false;
    let inFlight = false;

    const check = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        setCanActivateLines((await fetchAllTilesetUids(addLog)).has(wantedUid));
      } catch (e) {
        addLog?.(`line-check fetch error: ${String(e)}`);
        if (!cancelled) setCanActivateLines(false);
      } finally {
        inFlight = false;
      }
    };

    check();
    const timer = setInterval(check, 3000);
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

  const viewConfig = useMemo(() => {
    if (!mainHeatmapUid) return EMPTY_CONFIG;

    return applyMatrixTrack(
      applyLogoTrack(
        applySequenceTrack(buildBaseView(mainHeatmapUid), sequenceEnabled, currentChromosome),
        logoEnabled,
        logoTrackUid
      ),
      { enabled: matrixEnabled, matrixUid, matrixRowCount, lineMode, addLog }
    );
  }, [ mainHeatmapUid, sequenceEnabled, currentChromosome, logoEnabled, logoTrackUid, matrixEnabled, matrixUid, matrixRowCount, lineMode, addLog,]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    reloadViewer?.();
  }, [viewConfig, reloadViewer]);

  const onHiGlassRef = useCallback(
    (instance) => {
      if (hoverApiPollRef.current) {
        window.clearInterval(hoverApiPollRef.current);
        hoverApiPollRef.current = null;
      }

      if (!instance) {
        hgInstanceRef.current = null;
        setHgApi(null);
        resetHoverState();
        addLog?.("HiGlass unmounted -> hover api cleared");
        return;
      }

      hgInstanceRef.current = instance;
      resetHoverState();

      const setReadyApi = (api, message) => {
        setHgApi(api);
        resetHoverState();
        addLog?.(message);
      };

      const api = instance?.api ?? null;
      if (api && typeof api.on === "function" && typeof api.off === "function") {
        setReadyApi(api, "HiGlass mounted -> hover api ready");
        return;
      }

      setHgApi(null);
      addLog?.("HiGlass mounted, but api not ready yet");

      hoverApiPollRef.current = window.setInterval(() => {
        const nextApi = hgInstanceRef.current?.api ?? null;
        if (nextApi && typeof nextApi.on === "function" && typeof nextApi.off === "function") {
          setReadyApi(nextApi, "HiGlass api became ready");
          window.clearInterval(hoverApiPollRef.current);
          hoverApiPollRef.current = null;
        }
      }, 100);
    },
    [addLog, resetHoverState]
  );

  useEffect(() => {
    if (!hgApi || typeof hgApi.on !== "function" || typeof hgApi.off !== "function") return;

    const valueOf = (evt) => {
      if (Number.isFinite(evt?.data)) return evt.data;
      const v = evt?.dataLens?.data?.[0];
      return Number.isFinite(v) ? v : undefined;
    };

    const clearHover = () => {
      lastHoverKeyRef.current = "";
      lastHoverValueRef.current = undefined;
      setHoverCell(null);
    };

    const emitHover = (evt, nextValue, preserveValue = false) => {
      const dataX = Number(evt?.dataX);
      const dataY = evt?.dataY == null ? null : Number(evt?.dataY);

      if (!Number.isFinite(dataX)) return clearHover();

      const cellX = Math.floor(dataX);
      const cellY = Number.isFinite(dataY) ? Math.floor(dataY) : null;
      const key = cellY == null ? String(cellX) : `${cellX},${cellY}`;
      const value = preserveValue ? lastKnownValueRef.current : nextValue;

      if (key === lastHoverKeyRef.current && value === lastHoverValueRef.current) return;

      lastHoverKeyRef.current = key;
      lastHoverValueRef.current = value;
      if (!preserveValue && nextValue !== undefined) lastKnownValueRef.current = nextValue;

      setHoverCell({
        cellX,
        cellY,
        dataX: evt?.dataX,
        dataY: evt?.dataY,
        absX: evt?.absX,
        absY: evt?.absY,
        relX: evt?.relX,
        relY: evt?.relY,
        relTrackX: evt?.relTrackX,
        relTrackY: evt?.relTrackY,
        value,
      });
    };

    const onCursor = (evt) => {
      lastCursorEvtRef.current = evt ?? null;
      emitHover(evt, undefined, true);
    };

    const onMouseMoveZoom = (evt) =>
      emitHover(
        Number.isFinite(Number(evt?.dataX)) ? evt : { ...(lastCursorEvtRef.current || {}), ...(evt || {}) },
        valueOf(evt),
        false
      );

    hgApi.on("cursorLocation", onCursor, VIEW_UID);
    hgApi.on("mouseMoveZoom", onMouseMoveZoom);

    return () => {
      try {
        hgApi.off("cursorLocation", onCursor, VIEW_UID);
        hgApi.off("mouseMoveZoom", onMouseMoveZoom);
      } catch (e) {
        addLog?.(`hover cleanup error: ${String(e)}`);
      }
    };
  }, [addLog, hgApi]);

  const hoveredPosition = hoverCell
    ? {
        cellX: hoverCell.cellX ?? null,
        cellY: hoverCell.cellY ?? null,
        value: hoverCell.value ?? null,
      }
    : null;

  const activateUid = useCallback(
    async ({ uid, setUid, setEnabled, listRef, setList, successLog, extra }) => {
      if (!uid) return false;

      try {
        if (!(await waitForTilesetUid(uid, { addLog, timeoutMs, intervalMs }))) return false;

        setUid(uid);
        setEnabled?.(true);

        const next = listRef.current.includes(uid) ? listRef.current : [...listRef.current, uid];
        listRef.current = next;
        setList(next);

        if (successLog) addLog?.(`${successLog}: "${uid}"`);
        await extra?.(uid);
        return true;
      } catch (e) {
        addLog?.(`${successLog || "activateUid"} failed: ${String(e)}`);
        return false;
      }
    },
    [addLog, timeoutMs, intervalMs]
  );

  const makeClearer = useCallback(
    (clearFn, logs) =>
      () => {
        clearFn();
        for (const line of logs) addLog?.(line);
      },
    [addLog]
  );

  const clearMatrixSelection = useCallback(
    makeClearer(
      () => {
        setMatrixUidState(null);
        setMatrixEnabled(false);
        setMatrixRowCount(0);
        setLineMode(false);
        setCanActivateLines(false);
      },
      ["matrix cleared", "matrix mode: off"]
    ),
    [makeClearer]
  );

  const clearLogoSelection = useCallback(
    makeClearer(
      () => {
        setLogoTrackUidState(null);
        setLogoEnabled(false);
      },
      ["logo cleared", "logo mode: off"]
    ),
    [makeClearer]
  );

  const clearChromosomeSelection = useCallback(
    makeClearer(
      () => {
        setCurrentChromosomeState(normalizeChromosome(null));
        setSequenceEnabled(false);
      },
      ["chromosome cleared", "sequence track: off"]
    ),
    [makeClearer]
  );

  const setMainHeatmapUid = useCallback(
    (uid) => {
      addLog?.(`setting main heatmap uid in use view config: "${uid}"`);
      return activateUid({
        uid,
        setUid: setMainHeatmapUidState,
        listRef: heatmapUidsRef,
        setList: setHeatmapUids,
        successLog: "main heatmap set",
      });
    },
    [activateUid, addLog, heatmapUidsRef, setHeatmapUids]
  );

  const setMatrixUid = useCallback(
    (uid) =>
      activateUid({
        uid,
        setUid: setMatrixUidState,
        setEnabled: setMatrixEnabled,
        listRef: matrixUidsRef,
        setList: setMatrixUids,
        successLog: "matrix set",
        extra: async (selectedUid) => {
          addLog?.("matrix mode: on");
          const rowCount = await fetchTilesetRowCount(selectedUid, addLog);
          setMatrixRowCount(rowCount);
          addLog?.(`matrix set: "${selectedUid}" rows=${rowCount}`);
        },
      }),
    [activateUid, addLog, matrixUidsRef, setMatrixUids]
  );

  const setLogoTrackUid = useCallback(
    (uid) =>
      activateUid({
        uid,
        setUid: setLogoTrackUidState,
        setEnabled: setLogoEnabled,
        listRef: logoUidsRef,
        setList: setLogoUids,
        successLog: "logo track set",
        extra: async () => addLog?.("logo mode: on"),
      }),
    [activateUid, addLog, logoUidsRef, setLogoUids]
  );

  const setChromosomeObject = useCallback(
    (value) => {
      if (typeof value === "string") {
        const found = findChromosomeByName(chromosomesRef.current, value);
        if (!found) {
          addLog?.(`set_chromosome_object discarded: name "${value}" not found`);
          return false;
        }

        setCurrentChromosomeState(found);
        setSequenceEnabled(true);
        addLog?.(
          `chromosome object set by name: name="${found.name}" sequenceLength=${found.sequence.length} absolutePosition=${found.absolutePosition}`
        );
        addLog?.("sequence track: on");
        return { ok: true, chromosomeName: found.name };
      }

      if (!value || typeof value !== "object") {
        addLog?.("set_chromosome_object discarded: invalid value");
        return false;
      }

      const normalized = normalizeChromosome(value);
      if (!normalized.name) {
        addLog?.("set_chromosome_object discarded: empty chromosome name");
        return false;
      }

      const { item, list } = insertChromosome(chromosomesRef.current, normalized, addLog);
      chromosomesRef.current = list;
      setChromosomes(list);
      setCurrentChromosomeState(item);
      setSequenceEnabled(true);

      addLog?.(
        `chromosome object set: name="${item.name}" sequenceLength=${item.sequence.length} absolutePosition=${item.absolutePosition}`
      );
      addLog?.("sequence track: on");

      return { ok: true, chromosomeName: item.name };
    },
    [addLog, chromosomesRef, setChromosomes]
  );

  const makeToggle = useCallback(
    (setter, label) => () =>
      setter((prev) => {
        const next = !prev;
        addLog?.(`${label}: ${next ? "on" : "off"}`);
        return next;
      }),
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

  const toggleMatrixMode = useCallback(makeToggle(setMatrixEnabled, "matrix mode"), [makeToggle]);
  const toggleLogoMode = useCallback(makeToggle(setLogoEnabled, "logo mode"), [makeToggle]);
  const toggleSequenceMode = useCallback(makeToggle(setSequenceEnabled, "sequence track"), [makeToggle]);

  const addSavedCollection = useCallback(
    ({ main_heatmapUid, matrixUid, logo_trackUid, chromosomeName }) => {
      if (!main_heatmapUid) {
        addLog?.("no collection saved, because no main heatmap was provided.");
        return null;
      }

      const checks = [
        [
          !heatmapUidsRef.current.includes(main_heatmapUid),
          `addSavedCollection discarded: main heatmap uid "${main_heatmapUid}" is not in saved heatmaps`,
        ],
        [
          matrixUid && !matrixUidsRef.current.includes(matrixUid),
          `addSavedCollection discarded: matrix uid "${matrixUid}" is not in saved matrices`,
        ],
        [
          logo_trackUid && !logoUidsRef.current.includes(logo_trackUid),
          `addSavedCollection discarded: logo uid "${logo_trackUid}" is not in saved logos`,
        ],
        [
          chromosomeName && !findChromosomeByName(chromosomesRef.current, chromosomeName),
          `addSavedCollection discarded: chromosome "${chromosomeName}" is not in saved chromosomes`,
        ],
      ];

      for (const [failed, message] of checks) {
        if (failed) {
          addLog?.(message);
          return null;
        }
      }

      const key = nextCollectionKey(savedCollectionsRef.current);
      const collection = {
        key,
        main_heatmapUid,
        ...(matrixUid ? { matrixUid } : {}),
        ...(logo_trackUid ? { logo_trackUid } : {}),
        ...(chromosomeName ? { chromosomeName } : {}),
      };

      const next = { ...savedCollectionsRef.current, [key]: collection };
      savedCollectionsRef.current = next;
      setSavedCollections(next);
      addLog?.(`saved collection "${key}"`);
      return key;
    },
    [ addLog, heatmapUidsRef, matrixUidsRef, logoUidsRef, chromosomesRef, savedCollectionsRef, setSavedCollections,]
  );

  const selectSavedCollection = useCallback(
    async (key) => {
      const normalizedKey = String(key ?? "").trim();
      const collection = savedCollectionsRef.current[normalizedKey];

      if (!collection) {
        addLog?.(`selectSavedCollection failed: key "${normalizedKey}" not found`);
        return false;
      }

      const fail = (msg) => {
        addLog?.(msg);
        return false;
      };

      if (collection.main_heatmapUid) {
        if (!(await setMainHeatmapUid(collection.main_heatmapUid))) {
          return fail(
            `selectSavedCollection failed: could not set heatmap "${collection.main_heatmapUid}"`
          );
        }
      }

      if (collection.matrixUid) {
        if (!(await setMatrixUid(collection.matrixUid))) {
          return fail(
            `selectSavedCollection failed: could not set matrix "${collection.matrixUid}"`
          );
        }
      } else {
        clearMatrixSelection();
      }

      if (collection.logo_trackUid) {
        if (!(await setLogoTrackUid(collection.logo_trackUid))) {
          return fail(
            `selectSavedCollection failed: could not set logo "${collection.logo_trackUid}"`
          );
        }
      } else {
        clearLogoSelection();
      }

      if (collection.chromosomeName) {
        if (!setChromosomeObject(collection.chromosomeName)?.ok) {
          return fail(
            `selectSavedCollection failed: could not set chromosome "${collection.chromosomeName}"`
          );
        }
      } else {
        clearChromosomeSelection();
      }

      addLog?.(`collection "${normalizedKey}" applied`);
      return true;
    },
    [ savedCollectionsRef, addLog, setMainHeatmapUid, setMatrixUid, setLogoTrackUid, setChromosomeObject, clearMatrixSelection, clearLogoSelection, clearChromosomeSelection,]
  );

  return { viewConfig, mainHeatmapUid, matrixUid, logoTrackUid, currentChromosome, lineMode, matrixEnabled, logoEnabled, sequenceEnabled, canActivateLines, heatmapUids, matrixUids, logoUids, chromosomes, savedCollections, setMainHeatmapUid, setMatrixUid, setLogoTrackUid, setChromosomeObject, addSavedCollection, selectSavedCollection, toggleLineMode, toggleMatrixMode, toggleLogoMode, toggleSequenceMode, onHiGlassRef, hoveredPosition,};
}