import { useCallback } from "react";
import {
  uploadFileWithNewUid,
  uploadlogoTrackFile,
  uploadNxknpyFile,
  uploadZipFile,
  call_Matrix_bigwig,
} from "./higlassApi";

const extractUid = (j) => j?.uuid || "";

export function useUploads({
  addLog,
  setMainHeatmapUid,
  setLogoTrackUid,
  setMatrixUid,
  setChromosomeObject,
}) {
  const runUpload = useCallback(
    async ({ file, setBusy, label, uploadFn, selectFn, successLabel }) => {
      if (!file) return false;

      setBusy(true);
      addLog?.(`${label} start: ${file.name}`);

      try {
        const res = await uploadFn(file, addLog);
        addLog?.(`${label} ok: ${JSON.stringify(res)}`);

        const uid = extractUid(res);
        if (!uid) {
          addLog?.(`${label}: backend returned no uuid`);
          return false;
        }

        const ok = await selectFn?.(uid);
        addLog?.(`${successLabel}: uid="${uid}" ok=${Boolean(ok)}`);

        return Boolean(ok) ? uid : false;
      } catch (e) {
        addLog?.(`${label} error: ${String(e)}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [addLog]
  );

  const makeUploadHandler = useCallback(
    ({ fileKey, label, uploadFn, selectFn, successLabel }) =>
      async ({ [fileKey]: file, setBusy }) =>
        runUpload({
          file,
          setBusy,
          label,
          uploadFn,
          selectFn,
          successLabel,
        }),
    [runUpload]
  );

  const handleUpload = useCallback(
    makeUploadHandler({
      fileKey: "file",
      label: "upload",
      uploadFn: uploadFileWithNewUid,
      selectFn: setMainHeatmapUid,
      successLabel: "heatmap select after upload",
    }),
    [makeUploadHandler, setMainHeatmapUid]
  );

  const handleLogoTrackUpload = useCallback(
    makeUploadHandler({
      fileKey: "logoTrackFile",
      label: "logo_track upload",
      uploadFn: uploadlogoTrackFile,
      selectFn: setLogoTrackUid,
      successLabel: "logo select after upload",
    }),
    [makeUploadHandler, setLogoTrackUid]
  );

  const handleNpyMatrixUpload = useCallback(
    async ({ npyMatrixFile, setBusy }) => {
      if (!npyMatrixFile) return false;

      setBusy(true);
      addLog?.(`npy NxK upload start: ${npyMatrixFile.name}`);

      try {
        const res = await uploadNxknpyFile(npyMatrixFile, addLog);
        addLog?.(`npy NxK upload ok: ${JSON.stringify(res)}`);

        try {
          await call_Matrix_bigwig(addLog);
          addLog?.("matrix bigwig generation triggered");
        } catch (e) {
          addLog?.(`matrix bigwig trigger warning: ${String(e)}`);
        }

        const uid = extractUid(res);
        if (!uid) {
          addLog?.("npy NxK upload: backend returned no uuid");
          return false;
        }

        const matrixOk = await setMatrixUid?.(uid);
        addLog?.(`matrix select after upload: uid="${uid}" ok=${Boolean(matrixOk)}`);

        if (!matrixOk) {
          return false;
        }


        return uid;
      } catch (e) {
        addLog?.(`npy NxK upload error: ${String(e)}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [addLog, setMatrixUid]
  );

const handleZIPUpload = useCallback(
  async ({ zipFile, setBusy }) => {
    if (!zipFile) {
      return {
        uuid_matrix: "",
        uuid_heatmap: "",
        uuid_logotrack: "",
      };
    }

    setBusy(true);
    addLog?.(`zip upload start: ${zipFile.name}`);

    try {
      const res = await uploadZipFile(zipFile, addLog);
      addLog?.(`zip upload ok: ${JSON.stringify(res)}`);

      const uuid_matrix = res?.uuid_matrix || "";
      const uuid_heatmap = res?.uuid_heatmap || "";
      const uuid_logotrack = res?.uuid_logotrack || "";

      const fasta_name = res?.fasta_name || "";
      const fasta_sequence = res?.fasta_sequence || "";
      const fasta_startpos = res?.fasta_startpos;

      if (uuid_heatmap) {
        const heatmapOk = await setMainHeatmapUid?.(uuid_heatmap);
        addLog?.(
          `heatmap select after zip: uid="${uuid_heatmap}" ok=${Boolean(heatmapOk)}`
        );
      }

      if (uuid_logotrack) {
        const logoOk = await setLogoTrackUid?.(uuid_logotrack);
        addLog?.(
          `logo select after zip: uid="${uuid_logotrack}" ok=${Boolean(logoOk)}`
        );
      }

      if (uuid_matrix) {
        const matrixOk = await setMatrixUid?.(uuid_matrix);
        addLog?.(
          `matrix select after zip: uid="${uuid_matrix}" ok=${Boolean(matrixOk)}`
        );
      }

      if (
        fasta_name &&
        fasta_sequence &&
        Number.isFinite(Number(fasta_startpos))
      ) {
        const chromosomeOk = setChromosomeObject?.({
          name: fasta_name,
          sequence: fasta_sequence,
          absolutePosition: Number(fasta_startpos),
        });

        addLog?.(
          `chromosome object set after zip: name="${fasta_name}" sequenceLength=${fasta_sequence.length} absolutePosition=${Number(fasta_startpos)} ok=${Boolean(chromosomeOk)}`
        );
      } else {
        addLog?.("zip upload: no valid fasta chromosome object returned");
      }

      return {
        uuid_matrix,
        uuid_heatmap,
        uuid_logotrack,
      };
    } catch (e) {
      addLog?.(`zip upload error: ${String(e)}`);
      return {
        uuid_matrix: "",
        uuid_heatmap: "",
        uuid_logotrack: "",
      };
    } finally {
      setBusy(false);
    }
  },
  [
    addLog,
    setMainHeatmapUid,
    setLogoTrackUid,
    setMatrixUid,
    setChromosomeObject,
  ]
);

  return {
    handleUpload,
    handleLogoTrackUpload,
    handleNpyMatrixUpload,
    handleZIPUpload,
  };
}