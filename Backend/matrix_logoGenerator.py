import argparse
import os
import shutil
import subprocess
from pathlib import Path

import h5py
import numpy as np


CHROM = "synthetic_maxchr"
BINSIZE = 1


def ensure_clodius():
    cmd = shutil.which("clodius")
    if not cmd:
        raise FileNotFoundError("clodius not found on PATH")
    return cmd


def write_row_infos(path: Path, k: int) -> None:
    with path.open("w", encoding="utf-8") as f:
        for i in range(k):
            f.write(f"row_{i}\n")


def write_chromsizes(path: Path, n: int) -> None:
    with path.open("w", encoding="utf-8") as f:
        f.write(f"{CHROM}\t{n * BINSIZE}\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_path")
    parser.add_argument("output_path")
    args = parser.parse_args()

    output_path = Path(args.output_path)
    output_dir = output_path.parent
    output_dir.mkdir(parents=True, exist_ok=True)

    if output_path.suffix != ".mv5":
        raise ValueError("output_path must end with .mv5")

    base = output_path.with_suffix("")
    h5_path = base.with_suffix(".h5")
    mv5_path = output_path
    chromsizes_path = output_dir / f"{base.name}.chromsizes.tsv"
    row_infos_path = output_dir / f"{base.name}.row_infos.txt"

    for path in (h5_path, mv5_path, chromsizes_path, row_infos_path):
        if path.exists():
            path.unlink()

    matrix = np.load(args.input_path)
    if getattr(matrix, "ndim", None) != 2:
        raise ValueError(f"expected 2D array, got shape={getattr(matrix, 'shape', None)}")

    n, k = matrix.shape

    write_chromsizes(chromsizes_path, n)
    write_row_infos(row_infos_path, k)

    with h5py.File(h5_path, "w") as f:
        dset = f.create_dataset(CHROM, matrix.shape, compression="gzip")
        dset[:] = matrix

    cmd = [
        ensure_clodius(),
        "aggregate",
        "multivec",
        "--output-file",
        str(mv5_path),
        "--chromsizes-filename",
        str(chromsizes_path),
        "--starting-resolution",
        str(BINSIZE),
        "--row-infos-filename",
        str(row_infos_path),
        str(h5_path),
    ]
    subprocess.run(cmd, check=True)

    chromsizes_path.unlink(missing_ok=True)
    row_infos_path.unlink(missing_ok=True)
    h5_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()