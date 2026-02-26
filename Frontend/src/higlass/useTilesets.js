import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAllTilesets } from "../api/higlassApi";

const LOCKED_INITIAL_TILESET_UID = "finishedfile";

export function useTilesets(addLog) {
  const [availableTilesets, setAvailableTilesets] = useState([]);

  // Start locked to finishedfile
  const [selectedUuid, _setSelectedUuid] = useState(LOCKED_INITIAL_TILESET_UID);

  const [showUuidPicker, setShowUuidPicker] = useState(true);

  const tilesetPollRef = useRef(null);
  const tilesetFetchInFlightRef = useRef(false);
  const [tilesetFetchInFlight, setTilesetFetchInFlight] = useState(false);

  // keep latest values without forcing effect re-runs
  const addLogRef = useRef(addLog);
  const selectedUuidRef = useRef(selectedUuid);

  // track whether selection was set by user/program ("user") vs auto default ("auto")
  // We start in "user" mode to prevent any auto overriding of "finishedfile".
  const selectionSourceRef = useRef("user"); // "auto" | "user"

  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  useEffect(() => {
    selectedUuidRef.current = selectedUuid;
  }, [selectedUuid]);

  // Wrap setter so App can mark selections as "user"
  // This is the ONLY way selection should change.
  const setSelectedUuid = useCallback((uuid) => {
    selectionSourceRef.current = "user";
    _setSelectedUuid(uuid);
  }, []);

  // Internal helper for auto-pick default (kept for completeness, but effectively disabled)
  const setSelectedUuidAuto = useCallback((uuid) => {
    selectionSourceRef.current = "auto";
    _setSelectedUuid(uuid);
  }, []);

  const refreshTilesets = useCallback(async () => {
    if (tilesetFetchInFlightRef.current) return;
    tilesetFetchInFlightRef.current = true;
    setTilesetFetchInFlight(true);

    try {
      const list = await fetchAllTilesets(addLogRef.current);
      setAvailableTilesets(list);

      const currentSelected = selectedUuidRef.current;

      // IMPORTANT:
      // - Never override user/program selection.
      // - Since we initialize as "user" with "finishedfile", polling will only update the list.
      if (selectionSourceRef.current === "user") return;

      // (Optional legacy behavior if you ever switch to auto mode)
      if (!currentSelected && list.length > 0) {
        setSelectedUuidAuto(list[0].uuid);
        return;
      }

      if (
        list.length > 0 &&
        currentSelected &&
        !list.some((t) => t.uuid === currentSelected) &&
        selectionSourceRef.current === "auto"
      ) {
        setSelectedUuidAuto(list[0].uuid);
      }
    } finally {
      tilesetFetchInFlightRef.current = false;
      setTilesetFetchInFlight(false);
    }
  }, [setSelectedUuidAuto]);

  // initial load once
  useEffect(() => {
    (async () => {
      addLogRef.current?.(
        `loading available tilesets (all) … (selection locked to "${LOCKED_INITIAL_TILESET_UID}")`
      );
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
    setSelectedUuid, // <-- use this setter in App everywhere
    showUuidPicker,
    toggleUuidPicker,
    tilesetFetchInFlight,
    refreshTilesets,
  };
}