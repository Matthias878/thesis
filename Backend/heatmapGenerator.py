import os
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import cooler

BINSIZE = 1
CHROM = "synthetic_maxchr"


def parse_args():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python heatmapGenerator.py <input_npy_path> <output_mcool_path>")

    npy_path = sys.argv[1]
    output_path = sys.argv[2]

    if not npy_path.lower().endswith(".npy"):
        raise SystemExit("Input path must point to a .npy file")

    if not output_path.lower().endswith(".mcool"):
        raise SystemExit("Output path must end with .mcool")

    return npy_path, output_path


def load_array(path: str) -> np.ndarray:
    arr = np.load(path, allow_pickle=True)
    if not isinstance(arr, np.ndarray):
        raise ValueError("Loaded object is not an ndarray")
    return arr


def reduce_heatmap_array(arr: np.ndarray) -> np.ndarray:
    if arr.ndim == 2 and arr.shape[0] == arr.shape[1]:
        return arr

    if arr.ndim != 4 or arr.shape[1] != 3 or arr.shape[3] != 4 or arr.shape[0] != arr.shape[2]:
        raise ValueError(
            f"Unexpected array shape: {getattr(arr, 'shape', None)}. "
            "Expected (N, N) or (N, 3, N, 4)."
        )

    n = arr.shape[0]
    flat = arr.transpose(0, 2, 1, 3).reshape(n, n, 12)
    idx = np.argmax(np.abs(flat), axis=2)
    r, c = np.ogrid[:n, :n]
    return np.abs(flat[r, c, idx])


def dense_matrix_to_mcool(matrix: np.ndarray, mcool_path: str):
    if matrix.ndim != 2 or matrix.shape[0] != matrix.shape[1]:
        raise ValueError(f"Expected square 2D matrix, got {getattr(matrix, 'shape', None)}")

    n = matrix.shape[0]

    bins = pd.DataFrame({
        "chrom": CHROM,
        "start": np.arange(n) * BINSIZE,
        "end": (np.arange(n) + 1) * BINSIZE,
    })

    upper = np.triu(matrix, k=0)
    rows, cols = np.where(np.abs(upper) > 1e-12)
    values = upper[rows, cols]

    pixels = pd.DataFrame({
        "bin1_id": rows.astype(np.int64),
        "bin2_id": cols.astype(np.int64),
        "count": values.astype(np.float64),
    })

    with tempfile.TemporaryDirectory(prefix="cooler_tmp_") as tmpdir:
        cool_path = str(Path(tmpdir) / "base.cool")

        cooler.create_cooler(
            cool_uri=cool_path,
            bins=bins,
            pixels=pixels,
            dtypes={"count": np.float64},
        )

        cooler.zoomify_cooler(
            base_uris=[cool_path],
            outfile=mcool_path,
            resolutions=[BINSIZE],
            chunksize=1000000,
        )


if __name__ == "__main__":
    npy_path, mcool_path = parse_args()
    mcool_path = os.path.abspath(mcool_path)

    Path(mcool_path).parent.mkdir(parents=True, exist_ok=True)

    if os.path.exists(mcool_path):
        os.remove(mcool_path)

    arr = load_array(npy_path)
    matrix = reduce_heatmap_array(arr)
    dense_matrix_to_mcool(matrix, mcool_path)

    print(mcool_path)