// higlass/useTilesets.js
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAllTilesets } from "../api/higlassApi";

const LOCKED_INITIAL_TILESET_UID = "finishedfile";

export function useTilesets(addLog) {
  const [availableTilesets, setAvailableTilesets] = useState([]);

  // Heatmap selection starts locked to finishedfile
  const [selectedUuid, _setSelectedUuid] = useState(LOCKED_INITIAL_TILESET_UID);

  const [showUuidPicker, setShowUuidPicker] = useState(true);

  const tilesetPollRef = useRef(null);

  // In-flight handling
  const inFlightPromiseRef = useRef(null);
  const [tilesetFetchInFlight, setTilesetFetchInFlight] = useState(false);

  // keep latest values without forcing effect re-runs
  const addLogRef = useRef(addLog);
  const selectedUuidRef = useRef(selectedUuid);

  // track whether selection was set by user/program ("user") vs auto default ("auto")
  const selectionSourceRef = useRef("user"); // "auto" | "user"

  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  useEffect(() => {
    selectedUuidRef.current = selectedUuid;
  }, [selectedUuid]);

  // The ONLY way selection should change
  const setSelectedUuid = useCallback((uuid) => {
    selectionSourceRef.current = "user";
    _setSelectedUuid(uuid);
  }, []);

  const setSelectedUuidAuto = useCallback((uuid) => {
    selectionSourceRef.current = "auto";
    _setSelectedUuid(uuid);
  }, []);

  /**
   * Refresh tilesets.
   * - Always returns the fetched list.
   * - If already fetching, awaits the existing promise and returns the same list.
   */
  const refreshTilesets = useCallback(async () => {
    if (inFlightPromiseRef.current) {
      return inFlightPromiseRef.current;
    }

    setTilesetFetchInFlight(true);

    const p = (async () => {
      try {
        const list = await fetchAllTilesets(addLogRef.current);
        setAvailableTilesets(list);

        const currentSelected = selectedUuidRef.current;

        // Never override user/program selection.
        if (selectionSourceRef.current === "user") return list;

        // Optional legacy auto behavior (currently not used)
        if (!currentSelected && list.length > 0) {
          setSelectedUuidAuto(list[0].uuid);
          return list;
        }

        if (
          list.length > 0 &&
          currentSelected &&
          !list.some((t) => t.uuid === currentSelected) &&
          selectionSourceRef.current === "auto"
        ) {
          setSelectedUuidAuto(list[0].uuid);
        }

        return list;
      } finally {
        inFlightPromiseRef.current = null;
        setTilesetFetchInFlight(false);
      }
    })();

    inFlightPromiseRef.current = p;
    return p;
  }, [setSelectedUuidAuto]);

  // initial load once
  useEffect(() => {
    (async () => {
      addLogRef.current?.(`loading available tilesets (all) … (selection locked to "${LOCKED_INITIAL_TILESET_UID}")`);
      await refreshTilesets();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // poll only while picker is open
  useEffect(() => {
    if (!showUuidPicker) return;

    addLogRef.current?.("uuid picker open -> start tileset polling");
    refreshTilesets();

    tilesetPollRef.current = window.setInterval(() => {
      refreshTilesets();
    }, 2000);

    return () => {
      if (tilesetPollRef.current) {
        clearInterval(tilesetPollRef.current);
        tilesetPollRef.current = null;
      }
      addLogRef.current?.("uuid picker closed -> stop tileset polling");
    };
  }, [showUuidPicker, refreshTilesets]);

  const toggleUuidPicker = useCallback(() => {
    setShowUuidPicker((v) => !v);
  }, []);

  return {
    availableTilesets,
    selectedUuid,
    setSelectedUuid,
    showUuidPicker,
    toggleUuidPicker,
    tilesetFetchInFlight,
    refreshTilesets,
  };
}