import { useCallback, useState } from "react";
import {
  uploadFileWithNewUid,
  uploadlogoTrackFile,
  uploadNxknpyFile,
  uploadZipFile,
  call_Matrix_bigwig,
} from "./pythonBackendApi";

const EMPTY_ZIP_RESULT = {
  uuid_matrix: "",
  uuid_heatmap: "",
  uuid_logotrack: "",
  presetKey: null,
};

const extractUid = (j) => j?.uuid || "";

function parseChromosomeObject(text) {
  if (typeof text !== "string" || !text.trim()) return null;

  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const header = lines.find((s) => s.startsWith(">")) || "";
  const sequence = lines.filter((s) => !s.startsWith(">")).join("");
  const match = header.match(/^>(.+):(\d+)-(\d+)$/);

  if (!match || !sequence) return null;

  return {
    name: match[1],
    sequence,
    absolutePosition: Number(match[2]),
  };
}

export function useUploads({
  addLog,
  setMainHeatmapUid,
  setLogoTrackUid,
  setMatrixUid,
  setChromosomeObject,
  addSavedCollection,
  selectSavedCollection,
}) {
  const [fastaFile, setFastaFile] = useState(null);

  const log = useCallback((msg) => addLog?.(msg), [addLog]);

  const selectUid = useCallback(
    async (uid, setter, msg) => {
      const ok = Boolean(await setter?.(uid));
      log(`${msg}: uid="${uid}" ok=${ok}`);
      return ok;
    },
    [log]
  );

  const uploaders = {
    heatmap: {
      label: "upload",
      uploadFn: uploadFileWithNewUid,
      setter: setMainHeatmapUid,
      successLabel: "heatmap select after upload",
    },
    logo: {
      label: "logo_track upload",
      uploadFn: uploadlogoTrackFile,
      setter: setLogoTrackUid,
      successLabel: "logo select after upload",
    },
    matrix: {
      label: "npy NxK upload",
      uploadFn: uploadNxknpyFile,
      setter: setMatrixUid,
      successLabel: "matrix select after upload",
      afterUpload: async () => {
        try {
          await call_Matrix_bigwig(addLog);
          log("matrix bigwig generation triggered");
        } catch (e) {
          log(`matrix bigwig trigger warning: ${String(e)}`);
        }
      },
    },
  };

  const handleUpload = useCallback(
    async ({ type, file, setBusy }) => {
      const cfg = uploaders[type];
      if (!cfg || !file) return false;

      setBusy(true);
      log(`${cfg.label} start: ${file.name}`);

      try {
        const res = await cfg.uploadFn(file, addLog);
        log(`${cfg.label} ok: ${JSON.stringify(res)}`);

        await cfg.afterUpload?.(res);

        const uid = extractUid(res);
        if (!uid) {
          log(`${cfg.label}: backend returned no uuid`);
          return false;
        }

        return (await selectUid(uid, cfg.setter, cfg.successLabel)) ? uid : false;
      } catch (e) {
        log(`${cfg.label} error: ${String(e)}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [addLog, log, selectUid]
  );

  const handleFastaUpload = useCallback(
    async ({ fastaFile, setBusy }) => {
      if (!fastaFile) {
        log("FASTA upload blocked: no file selected");
        return false;
      }

      if (typeof setChromosomeObject !== "function") {
        log("FASTA upload blocked: setChromosomeObject unavailable");
        return false;
      }

      try {
        setBusy(true);

        const text = await fastaFile.text();
        log(`FASTA file loaded: "${fastaFile.name}" (${text.length} chars)`);

        const chromosomeObject = parseChromosomeObject(text);
        if (!chromosomeObject) {
          log('FASTA upload discarded: expected header format ">NAME:START-END" and non-empty sequence');
          return false;
        }

        const ok = await setChromosomeObject(chromosomeObject);
        if (!ok) {
          log("FASTA upload: setChromosomeObject rejected parsed object");
          return false;
        }

        log(
          `FASTA chromosome object applied: name="${chromosomeObject.name}" sequenceLength=${chromosomeObject.sequence.length} absolutePosition=${chromosomeObject.absolutePosition}`
        );

        return true;
      } catch (e) {
        log(`FASTA read error: ${String(e)}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [log, setChromosomeObject]
  );

  const handleZIPUpload = useCallback(
    async ({ zipFile, setBusy }) => {
      if (!zipFile) return EMPTY_ZIP_RESULT;

      setBusy(true);
      log(`zip upload start: ${zipFile.name}`);

      try {
        const res = await uploadZipFile(zipFile, addLog);
        log(`zip upload ok: ${JSON.stringify(res)}`);

        const uuid_matrix = res?.uuid_matrix || "";
        const uuid_heatmap = res?.uuid_heatmap || "";
        const uuid_logotrack = res?.uuid_logotrack || "";

        const heatmapOk = uuid_heatmap
          ? await selectUid(uuid_heatmap, setMainHeatmapUid, "heatmap select after zip")
          : false;

        const logoOk = uuid_logotrack
          ? await selectUid(uuid_logotrack, setLogoTrackUid, "logo select after zip")
          : false;

        const matrixOk = uuid_matrix
          ? await selectUid(uuid_matrix, setMatrixUid, "matrix select after zip")
          : false;

        let chromosomeOk = false;
        let chromosomeNameForPreset = "";

        if (
          res?.fasta_name &&
          res?.fasta_sequence &&
          Number.isFinite(Number(res?.fasta_startpos))
        ) {
          const chromosomeObject = {
            name: res.fasta_name,
            sequence: res.fasta_sequence,
            absolutePosition: Number(res.fasta_startpos),
          };

          const chromosomeResult = await setChromosomeObject?.(chromosomeObject);
          chromosomeOk = Boolean(chromosomeResult);
          chromosomeNameForPreset =
            chromosomeResult?.chromosomeName ?? chromosomeObject.name ?? "";

          log(
            `chromosome object set after zip: name="${res.fasta_name}" sequenceLength=${res.fasta_sequence.length} absolutePosition=${Number(res.fasta_startpos)} ok=${chromosomeOk} finalName="${chromosomeNameForPreset}"`
          );
        } else {
          log("zip upload: no valid fasta chromosome object returned");
        }

        let presetKey = null;

        if (heatmapOk && addSavedCollection) {
          presetKey = addSavedCollection({
            main_heatmapUid: uuid_heatmap,
            ...(matrixOk && uuid_matrix && { matrixUid: uuid_matrix }),
            ...(logoOk && uuid_logotrack && { logo_trackUid: uuid_logotrack }),
            ...(chromosomeOk &&
              chromosomeNameForPreset && {
                chromosomeName: chromosomeNameForPreset,
              }),
          });

          log(
            presetKey
              ? `zip upload preset created: "${presetKey}"`
              : "zip upload preset creation failed"
          );
        } else {
          log("zip upload preset skipped: missing saved collection callback or valid heatmap");
        }

        if (presetKey && selectSavedCollection) {
          const ok = Boolean(await selectSavedCollection(presetKey));
          log(`zip upload preset selected: key="${presetKey}" ok=${ok}`);

          if (!ok) {
            log(`zip upload warning: preset "${presetKey}" was created but could not be re-applied`);
          }
        }

        return { uuid_matrix, uuid_heatmap, uuid_logotrack, presetKey };
      } catch (e) {
        log(`zip upload error: ${String(e)}`);
        return EMPTY_ZIP_RESULT;
      } finally {
        setBusy(false);
      }
    },
    [
      addLog,
      log,
      setMainHeatmapUid,
      setLogoTrackUid,
      setMatrixUid,
      setChromosomeObject,
      addSavedCollection,
      selectSavedCollection,
      selectUid,
    ]
  );

  return {
    handleUpload,
    handleFastaUpload,
    handleZIPUpload,
  };
}