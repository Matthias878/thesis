import { useCallback } from "react";
import {
  uploadFileWithNewUid,
  uploadlogoTrackFile,
  uploadNxknpyFile,
  uploadZipFile,
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

export function useUploads({addLog, setMainHeatmapUid, setLogoTrackUid, setMatrixUid, setChromosomeObject, addSavedCollection, selectSavedCollection, setBlockUI,}) {

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
    },
  };

  const handleUpload = useCallback(
    async ({ type, file}) => {
      const cfg = uploaders[type];
      if (!cfg || !file) return false;


      setBlockUI?.(true);
      log(`${cfg.label} start: ${file.name}`);

      try {
        const res = await cfg.uploadFn(file);
        log(`${cfg.label} ok: ${JSON.stringify(res)}`);

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
        setBlockUI?.(false);
      }
    },
    [addLog, log, selectUid]
  );

  const handleFastaUpload = useCallback(
    async ({ fastaFile }) => {
      if (!fastaFile) {
        log("FASTA upload blocked: no file selected");
        return false;
      }

      if (typeof setChromosomeObject !== "function") {
        log("FASTA upload blocked: setChromosomeObject unavailable");
        return false;
      }

      try {
        setBlockUI?.(true);

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
        setBlockUI?.(false);
      }
    },
    [log, setChromosomeObject]
  );

const handleZIPUpload = useCallback(
  async ({ zipFile }) => {
    if (!zipFile) return EMPTY_ZIP_RESULT;

    setBlockUI?.(true);
    log(`zip upload start: ${zipFile.name}`);

    try {
      const res = await uploadZipFile(zipFile);
      log(`zip upload ok: ${JSON.stringify(res)}`);

      const uuid_matrix = res?.uuid_matrix || "";
      const uuid_heatmap = res?.uuid_heatmap || "";
      const uuid_logotrack = res?.uuid_logotrack || "";

      const hasChromosome =
        res?.fasta_name &&
        res?.fasta_sequence &&
        Number.isFinite(Number(res?.fasta_startpos));

      const chromosomeObject = hasChromosome
        ? {
            name: res.fasta_name,
            sequence: res.fasta_sequence,
            absolutePosition: Number(res.fasta_startpos),
          }
        : null;

      if (!chromosomeObject) {
        log("zip upload: no valid fasta chromosome object returned");
      }

      const [
        heatmapOk,
        logoOk,
        matrixOk,
        chromosomeResult,
      ] = await Promise.all([
        uuid_heatmap
          ? selectUid(uuid_heatmap, setMainHeatmapUid, "heatmap select after zip")
          : false,

        uuid_logotrack
          ? selectUid(uuid_logotrack, setLogoTrackUid, "logo select after zip")
          : false,

        uuid_matrix
          ? selectUid(uuid_matrix, setMatrixUid, "matrix select after zip")
          : false,

        chromosomeObject ? setChromosomeObject?.(chromosomeObject) : false,
      ]);

      let chromosomeOk = false;
      let chromosomeNameForPreset = "";

      if (chromosomeObject) {
        chromosomeOk = Boolean(chromosomeResult);
        chromosomeNameForPreset =
          chromosomeResult?.chromosomeName ?? chromosomeObject.name ?? "";

        log(
          `chromosome object set after zip: name="${chromosomeObject.name}" sequenceLength=${chromosomeObject.sequence.length} absolutePosition=${chromosomeObject.absolutePosition} ok=${chromosomeOk} finalName="${chromosomeNameForPreset}"`
        );
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
      setBlockUI?.(false);
    }
  },
  [addLog, log, setMainHeatmapUid, setLogoTrackUid, setMatrixUid, setChromosomeObject, addSavedCollection, selectSavedCollection, selectUid,]
);

  return {handleUpload,handleFastaUpload,handleZIPUpload,};
}