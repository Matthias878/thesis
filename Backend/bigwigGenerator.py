import os
import sys
from pathlib import Path

import numpy as np
import pyBigWig


MAX_TRACKS = 12
OUTPUT_DIR = "HiGlassFiles"
CHROM = "synthetic_maxchr"
CHROM_LEN_BP = 99_999_999


def write_bigwig(values: np.ndarray, out_path: Path) -> None:
    if values.ndim != 1:
        raise ValueError("Track values must be 1D")

    n = int(values.shape[0])
    if n == 0:
        raise ValueError("Track is empty")
    if n > CHROM_LEN_BP:
        raise ValueError(f"Track length {n} exceeds chromosome length {CHROM_LEN_BP}")
    if not np.isfinite(values).all():
        raise ValueError("Track contains NaN or Inf")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        out_path.unlink()

    starts = np.arange(n, dtype=np.int64)
    ends = starts + 1

    bw = pyBigWig.open(str(out_path), "w")
    if bw is None:
        raise RuntimeError(f"Could not open bigWig for writing: {out_path}")

    try:
        bw.addHeader([(CHROM, CHROM_LEN_BP)])
        bw.addEntries(
            [CHROM] * n,
            starts.tolist(),
            ends=ends.tolist(),
            values=np.asarray(values, dtype=np.float64).tolist(),
        )
    finally:
        bw.close()


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python create_bigwigs_from_matrix.py <inpath> <outpath>")

    in_path = Path(sys.argv[1])
    out_arg = Path(sys.argv[2])

    if not in_path.exists():
        raise FileNotFoundError(f"Input file does not exist: {in_path}")

    matrix = np.load(in_path, mmap_mode="r")

    if matrix.ndim != 2:
        raise ValueError(f"Expected a 2D matrix, got shape {matrix.shape}")
    if not np.isfinite(matrix).all():
        raise ValueError("Input matrix contains NaN or Inf")

    n_rows, n_cols = map(int, matrix.shape)
    if n_rows == 0 or n_cols == 0:
        raise ValueError(f"Matrix must be non-empty, got shape {matrix.shape}")
    if n_rows > CHROM_LEN_BP:
        raise ValueError(f"Input has {n_rows} rows, exceeds chromosome length {CHROM_LEN_BP}")

    tracks_to_write = min(n_cols, MAX_TRACKS)

    if out_arg.parent == Path("."):
        output_dir = Path(OUTPUT_DIR)
        stem = out_arg.name
    else:
        output_dir = out_arg.parent
        stem = out_arg.name

    output_dir.mkdir(parents=True, exist_ok=True)

    for old_file in output_dir.glob(f"{stem}_row_*.bigWig"):
        old_file.unlink()

    for i in range(tracks_to_write):
        out_file = output_dir / f"{stem}_row_{i + 1}.bigWig"
        write_bigwig(np.asarray(matrix[:, i], dtype=np.float64), out_file)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())