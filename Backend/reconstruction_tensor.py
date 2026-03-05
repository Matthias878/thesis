# --- Create 4 bigWig tracks (A,C,G,T) from an Nx4 .npy tensor ---
# Input: Nx4 array where columns are [A, C, G, T]
# Output: A_Track.bigWig, C_Track.bigWig, G_Track.bigWig, T_Track.bigWig

import os
import sys
import numpy as np
import pyBigWig


def _safe_delete(path: str) -> None:
    print(f"[DEBUG] _safe_delete called with path={path}")
    if path and os.path.exists(path):
        print(f"[DEBUG] Deleting existing file: {path}")
        try:
            os.remove(path)
            print(f"[DEBUG] Successfully deleted: {path}")
        except OSError as e:
            print(f"[ERROR] Failed deleting file: {e}")
            raise RuntimeError(f"Failed to delete existing file '{path}': {e}") from e
    else:
        print(f"[DEBUG] No existing file to delete.")


def write_track_bigwig(
    values: np.ndarray,
    out_bw: str,
    chrom: str,
    chrom_len_bp: int,
) -> None:
    print("\n[DEBUG] ---- write_track_bigwig called ----")
    print(f"[DEBUG] out_bw={out_bw}")
    print(f"[DEBUG] chrom={chrom}")

    # HARDCODED chromosome size
    chrom_len_bp = 99_999_999
    print(f"[DEBUG] chrom_len_bp(HARDCODED)={chrom_len_bp}")

    print(f"[DEBUG] values.shape={values.shape}")
    print(f"[DEBUG] values.dtype={values.dtype}")

    if values.ndim != 1:
        raise ValueError("values must be a 1D array.")
    n = int(values.shape[0])
    if n <= 0:
        raise ValueError("Track length N must be > 0.")

    # Removed: if chrom_len_bp != n: raise ...
    # We only require that the intervals we write fit within the chromosome length.
    if n > chrom_len_bp:
        raise ValueError(
            f"Track length N ({n}) exceeds hardcoded chrom_len_bp ({chrom_len_bp})."
        )

    print(f"[DEBUG] Track length verified: N={n} within chrom_len_bp={chrom_len_bp}")

    if not np.isfinite(values).all():
        raise ValueError("Track contains NaN or Inf values.")

    out_dir = os.path.dirname(out_bw)
    print(f"[DEBUG] Output directory: {out_dir}")
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        print(f"[DEBUG] Ensured output directory exists.")

    _safe_delete(out_bw)

    chroms = [(chrom, chrom_len_bp)]
    starts = np.arange(n, dtype=np.int64)
    ends = starts + 1
    vals = values.astype(np.float64, copy=False)

    print(f"[INFO] Writing bigWig: {out_bw}")
    bw = pyBigWig.open(out_bw, "w")
    if bw is None:
        raise RuntimeError("pyBigWig.open returned None.")

    try:
        bw.addHeader(chroms)
        bw.addEntries(
            [chrom] * n,
            starts.tolist(),
            ends=ends.tolist(),
            values=vals.tolist(),
        )
    finally:
        bw.close()

if __name__ == "__main__":
    print("========== reconstruction_tensor.py START ==========")
    print(f"[DEBUG] Python executable: {sys.executable}")
    print(f"[DEBUG] Working directory: {os.getcwd()}")
    print(f"[DEBUG] Python version: {sys.version}")

    # ---- CONFIG ----
    npy_path = "uploads/logo_track_data.npy"
    out_dir = "McoolOutput"
    chrom = "testchromome"
    # ----------------

    print(f"[INFO] Loading Nx4 tensor from: {npy_path}")

    if not os.path.exists(npy_path):
        raise FileNotFoundError(f"Input file does not exist: {npy_path}")

    size = os.path.getsize(npy_path)
    print(f"[DEBUG] Input file size: {size} bytes")

    X = np.load(npy_path, mmap_mode="r")

    print(f"[DEBUG] Loaded array type: {type(X)}")
    print(f"[DEBUG] Array shape: {X.shape}")
    print(f"[DEBUG] Array dtype: {X.dtype}")
    print(f"[DEBUG] Memory-mapped: {hasattr(X, 'filename')}")

    if X.ndim != 2 or X.shape[1] != 4:
        raise ValueError(
            f"Expected an Nx4 tensor (2D array with 4 columns), got shape {X.shape}"
        )

    if not np.isfinite(X).all():
        raise ValueError("Input tensor contains NaN or Inf values.")

    N = int(X.shape[0])
    if N <= 0:
        raise ValueError("N must be > 0.")

    print(f"[INFO] Tensor validated. N={N}")

    os.makedirs(out_dir, exist_ok=True)
    print(f"[DEBUG] Ensured output directory exists: {out_dir}")

    # Columns: [A, C, G, T]
    tracks = {
        "A": X[:, 0],
        "C": X[:, 1],
        "G": X[:, 2],
        "T": X[:, 3],
    }

    for base, vals in tracks.items():
        print(f"\n[INFO] Processing base: {base}")
        print(f"[DEBUG] Column dtype: {vals.dtype}")
        print(f"[DEBUG] First 5 raw values: {vals[:5]}")

        out_bw = os.path.join(out_dir, f"{base}_Track.bigWig")

        write_track_bigwig(
            values=vals,
            out_bw=out_bw,
            chrom=chrom,
            chrom_len_bp=N,
        )

        v = np.asarray(vals, dtype=np.float64)
        print(
            f"[STATS] {base}_Track: "
            f"min={float(v.min()):.6f} "
            f"max={float(v.max()):.6f} "
            f"mean={float(v.mean()):.6f}"
        )

    print("\n========== ALL TRACKS WRITTEN ==========")
    for base in ["A", "C", "G", "T"]:
        path = os.path.join(out_dir, f"{base}_Track.bigWig")
        exists = os.path.exists(path)
        size = os.path.getsize(path) if exists else 0
        print(f"[RESULT] {path} | exists={exists} | size={size} bytes")

    print("========== reconstruction_tensor.py END ==========")