// src/api/useUploads.js

import { useCallback } from "react";
import { extractUuid } from "../utils/appUtils";

import { uploadFileWithNewUid, uploadlogoTrackFile, uploadNxknpyFile } from "./higlassApi";

/**
 * Upload flows: API call -> wait for tilesets -> update state -> log
 */
export function useUploads({
  addLog,
  refreshTilesets,
  setSelectedUuid,

  waitForHiGlassTilesetInfo,

  selectedUuid,

  // logo
  setLogoTrackUsed,
  toggleLogoMode,

  // matrix
  setMatrixUid,
  setMatrixUsed,
  setMatrixSplitUsed,

  // view-config actions
  applySingleMatrixNow,
}) {
  // Heatmap upload: wait for tileset-info BEFORE selecting
  const uploadHeatmapAndSelect = useCallback(
    async ({ file, label, uploader, setBusy }) => {
      if (!file) return;

      setBusy(true);
      addLog(`${label} start: ${file.name}`);

      try {
        const j = await uploader(file, addLog);
        addLog(`${label} ok: ${JSON.stringify(j)}`);

        const uuid = extractUuid(j);
        if (!uuid) {
          addLog(`${label}: backend returned no uuid`);
          refreshTilesets();
          return;
        }

        addLog(`waiting for heatmap tileset ${uuid}…`);
        const ok = await waitForHiGlassTilesetInfo([uuid], { timeoutMs: 60000, intervalMs: 250 });
        if (!ok) {
          addLog(`TIMEOUT: heatmap uuid not ready (${uuid}); not selecting`);
          return;
        }

        setSelectedUuid(uuid);
        refreshTilesets();
      } catch (e) {
        addLog(`${label} error: ${String(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [addLog, refreshTilesets, setSelectedUuid, waitForHiGlassTilesetInfo],
  );

  const handleUpload = useCallback(
    ({ file, setBusy }) => uploadHeatmapAndSelect({ file, label: "upload", uploader: uploadFileWithNewUid, setBusy }),
    [uploadHeatmapAndSelect],
  );

  const handleLogoTrackUpload = useCallback(
    async ({ logoTrackFile, setBusy }) => {
      if (!logoTrackFile) return;
      setBusy(true);
      addLog(`logo_track upload start: ${logoTrackFile.name}`);

      try {
        const j = await uploadlogoTrackFile(logoTrackFile, addLog);
        addLog(`logo_track upload ok${j?.uuid ? ` -> uuid: ${j.uuid}` : ""}`);

        addLog("waiting for logo tracks on HiGlass...");
        const ok = await waitForHiGlassTilesetInfo(["a_track", "c_track", "g_track", "t_track"], {
          timeoutMs: 60000,
          intervalMs: 250,
        });

        addLog(ok ? "logo tracks ready -> enabling" : "WARNING: logo tracks timeout; enabling anyway");
        setLogoTrackUsed(true);
-       toggleLogoMode()
+       toggleLogoMode?.();
      } catch (e) {
        addLog(`logo_track upload error: ${String(e)}`);
      } finally {
        setBusy(false);
      }
    },
-   [addLog, setLogoTrackUsed, waitForHiGlassTilesetInfo],
+   [addLog, setLogoTrackUsed, toggleLogoMode, waitForHiGlassTilesetInfo],
  );
  // NxK upload
  const handleNpyMatrixUpload = useCallback(
    async ({ npyMatrixFile, setBusy }) => {
      if (!npyMatrixFile) return;

      setBusy(true);
      addLog(`npy NxK upload start: ${npyMatrixFile.name}`);

      try {
        const j = await uploadNxknpyFile(npyMatrixFile, addLog);
        addLog(`npy NxK upload ok: ${JSON.stringify(j)}`);

        const uid = extractUuid(j);
        if (!uid) {
          addLog("npy NxK upload: backend returned no uuid");
          return;
        }

        addLog(`waiting for matrix multivec tileset ${uid}…`);
        const ok = await waitForHiGlassTilesetInfo([uid], { timeoutMs: 60000, intervalMs: 250 });
        if (!ok) {
          addLog(`TIMEOUT: matrix uid not ready (${uid})`);
          return;
        }

        // store uid, enable toggle
        setMatrixUid(uid);
        setMatrixUsed(true);
        setMatrixSplitUsed(false); // single mode wins after upload

        const heatmapUid = selectedUuid || "";
        if (!heatmapUid) {
          addLog("matrix uid stored but no heatmap selected yet");
          return;
        }

        applySingleMatrixNow(heatmapUid, uid);
      } catch (e) {
        addLog(`npy NxK upload error: ${String(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [
      addLog,
      applySingleMatrixNow,
      selectedUuid,
      setMatrixSplitUsed,
      setMatrixUid,
      setMatrixUsed,
      waitForHiGlassTilesetInfo,
    ],
  );

  return {
    uploadHeatmapAndSelect,
    handleUpload,
    handleLogoTrackUpload,
    handleNpyMatrixUpload,
  };
}