# create_bigwigs_from_matrix.py
# called with create_bigwigs_from_matrix.py --in filename
#
# Loads /uploads/filename.npy and writes up to 12 bigWig files to /McoolOutput/.
# Each output file is named: filename_row_<row_number>.bigWig
# If --out <name> is provided, it will instead use: <name>_row_<row_number>.bigWig
#
#
# IMPORTANT:
# - The bigWig chromosome header is hardcoded to CHROM_LEN_BP
# - This must match the HiGlass chromsizes entry for DEFAULT_CHROM exactly

import argparse
import os
import sys
from pathlib import Path

import numpy as np
import pyBigWig


MAX_TRACKS = 12
UPLOAD_DIR = "uploads"
OUTPUT_DIR = "McoolOutput"
DEFAULT_CHROM = "testchromome" # hardcoded to match
CHROM_LEN_BP = 99_999_999  # hardcoded to match HiGlass chromsizes


def safe_delete(path: str) -> None:
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError as e:
            raise RuntimeError(f"Failed to delete existing file '{path}': {e}") from e


def normalize_input_name(name: str) -> str:
    return name if name.endswith(".npy") else f"{name}.npy"


def write_bigwig(
    values: np.ndarray,
    out_bw: str,
    chrom: str,
    chrom_len_bp: int,
) -> None:
    if values.ndim != 1:
        raise ValueError("values must be a 1D array.")

    n = int(values.shape[0])
    if n <= 0:
        raise ValueError("Track length must be > 0.")

    if n > chrom_len_bp:
        raise ValueError(
            f"Track length ({n}) exceeds hardcoded chromosome length ({chrom_len_bp})."
        )

    if not np.isfinite(values).all():
        raise ValueError("Track contains NaN or Inf values.")

    out_dir = os.path.dirname(out_bw)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    safe_delete(out_bw)

    starts = np.arange(n, dtype=np.int64)
    ends = starts + 1
    vals = np.asarray(values, dtype=np.float64)

    bw = pyBigWig.open(out_bw, "w")
    if bw is None:
        raise RuntimeError(f"Could not open bigWig for writing: {out_bw}")

    try:
        bw.addHeader([(chrom, chrom_len_bp)])
        bw.addEntries(
            [chrom] * n,
            starts.tolist(),
            ends=ends.tolist(),
            values=vals.tolist(),
        )
    finally:
        bw.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create up to 12 bigWig files from the columns of a .npy matrix."
    )
    parser.add_argument(
        "--in",
        dest="infile",
        required=True,
        help="Input filename, with or without .npy extension. File is read from /uploads/",
    )
    parser.add_argument(
        "--out",
        dest="outname",
        default=None,
        help="Optional base name for output files. Files will be named <outname>_row_<n>.bigWig",
    )
    parser.add_argument(
        "--chrom",
        default=DEFAULT_CHROM,
        help=f'Chromosome name to use in the bigWig header (default: "{DEFAULT_CHROM}").',
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    input_name = normalize_input_name(args.infile)
    input_path = Path(input_name)

    if not input_path.exists():
        input_path = Path(UPLOAD_DIR) / Path(input_name).name

    output_dir = Path(OUTPUT_DIR)

    if args.outname:
        stem = Path(args.outname).stem
    else:
        stem = Path(input_name).stem

    print("========== create_bigwigs_from_matrix.py START ==========")
    print(f"[DEBUG] Python executable: {sys.executable}")
    print(f"[DEBUG] Working directory: {os.getcwd()}")
    print(f"[INFO] Input path: {input_path}")

    if not input_path.exists():
        raise FileNotFoundError(f"Input file does not exist: {input_path}")

    X = np.load(input_path, mmap_mode="r")

    print(f"[DEBUG] Loaded array type: {type(X)}")
    print(f"[DEBUG] Array shape: {X.shape}")
    print(f"[DEBUG] Array dtype: {X.dtype}")

    if X.ndim != 2:
        raise ValueError(f"Expected a 2D matrix, got shape {X.shape}")

    if not np.isfinite(X).all():
        raise ValueError("Input matrix contains NaN or Inf values.")

    n_rows, n_cols = map(int, X.shape)
    if n_rows <= 0 or n_cols <= 0:
        raise ValueError(f"Matrix must be non-empty, got shape {X.shape}")

    tracks_to_write = min(n_cols, MAX_TRACKS)
    chrom_len_bp = CHROM_LEN_BP

    output_dir.mkdir(parents=True, exist_ok=True)

    # Remove old outputs from previous runs for the same stem
    for old_file in output_dir.glob(f"{stem}_row_*.bigWig"):
        old_file.unlink()

    print(f"[INFO] Writing {tracks_to_write} column track(s) to: {output_dir}")
    print(f"[INFO] Chromosome: {args.chrom}")
    print(f"[INFO] Hardcoded chromosome length: {chrom_len_bp}")

    if n_cols > MAX_TRACKS:
        print(
            f"[WARN] Matrix has {n_cols} columns; "
            f"only the first {MAX_TRACKS} columns will be written."
        )

    if n_rows > chrom_len_bp:
        raise ValueError(
            f"Input has {n_rows} rows, which exceeds hardcoded chromosome length {chrom_len_bp}."
        )

    for track_idx in range(tracks_to_write):
        values = np.asarray(X[:, track_idx], dtype=np.float64)
        out_bw = output_dir / f"{stem}_row_{track_idx + 1}.bigWig"

        print(f"[INFO] Processing column {track_idx + 1}/{tracks_to_write}: {out_bw.name}")
        print(f"[DEBUG] First 5 values: {values[:5]}")

        write_bigwig(
            values=values,
            out_bw=str(out_bw),
            chrom=args.chrom,
            chrom_len_bp=chrom_len_bp,
        )

        print(
            f"[STATS] row_{track_idx + 1}: "
            f"min={float(values.min()):.6f} "
            f"max={float(values.max()):.6f} "
            f"mean={float(values.mean()):.6f}"
        )

    print("\n========== OUTPUT FILES ==========")
    for track_idx in range(tracks_to_write):
        path = output_dir / f"{stem}_row_{track_idx + 1}.bigWig"
        exists = path.exists()
        size = path.stat().st_size if exists else 0
        print(f"[RESULT] {path} | exists={exists} | size={size} bytes")

    print("========== create_bigwigs_from_matrix.py END ==========")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())