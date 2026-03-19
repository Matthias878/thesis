import { useCallback } from "react";
import { extractUuid } from "../utils/appUtils";
import { uploadFileWithNewUid, uploadlogoTrackFile, uploadNxknpyFile, call_Matrix_bigwig } from "./higlassApi";

/**
 * Upload flows: API call -> wait for tilesets -> update state -> log
 */
export function useUploads({
  addLog,
  refreshTilesets,
  setSelectedUuid,
  waitForHiGlassTilesetInfo,
  selectedUuid,
  setLogoUid,
  setMatrixUid,
  ensureMatrixMode,
  ensureLineMode,
  applySingleMatrixNow,
}) {
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
        const ok = await waitForHiGlassTilesetInfo([uuid], {
          timeoutMs: 60000,
          intervalMs: 250,
        });

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
    ({ file, setBusy }) =>
      uploadHeatmapAndSelect({
        file,
        label: "upload",
        uploader: uploadFileWithNewUid,
        setBusy,
      }),
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

        const uid = extractUuid(j);
        if (!uid) {
          addLog("logo_track upload: backend returned no uuid");
          return;
        }

        setLogoUid(uid);

        addLog("waiting for logo tracks on HiGlass...");
        const ok = await waitForHiGlassTilesetInfo([uid], {
          timeoutMs: 60000,
          intervalMs: 250,
        });

        addLog(ok ? "logo tracks ready" : "WARNING: logo tracks timeout; keeping uploaded uid anyway");
      } catch (e) {
        addLog(`logo_track upload error: ${String(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [addLog, setLogoUid, waitForHiGlassTilesetInfo],
  );

  const handleNpyMatrixUpload = useCallback(
    async ({ npyMatrixFile, setBusy }) => {
      if (!npyMatrixFile) return;

      setBusy(true);
      addLog(`npy NxK upload start: ${npyMatrixFile.name}`);

      try {
        const j = await uploadNxknpyFile(npyMatrixFile, addLog);
        call_Matrix_bigwig(addLog);
        addLog(`npy NxK upload ok: ${JSON.stringify(j)}`);

        const uid = extractUuid(j);
        if (!uid) {
          addLog("npy NxK upload: backend returned no uuid");
          return;
        }

        addLog(`waiting for matrix multivec tileset ${uid}…`);
        const ok = await waitForHiGlassTilesetInfo([uid], {
          timeoutMs: 60000,
          intervalMs: 250,
        });

        if (!ok) {
          addLog(`TIMEOUT: matrix uid not ready (${uid})`);
          return;
        }

        setMatrixUid(uid);
        ensureMatrixMode(true);
        ensureLineMode(false);

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
      setMatrixUid,
      ensureMatrixMode,
      ensureLineMode,
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