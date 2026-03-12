# --- Convert NxK .npy matrix to multires .mv5 (HiGlass multivec) ---

import os
import re
import sys
import time
import shutil
import subprocess
from pathlib import Path

import numpy as np
import h5py


OUT_DIR = "McoolOutput"
PREFIX = "npy_file_"


def next_out_base(out_dir=OUT_DIR, prefix=PREFIX):
    """
    Finds the next available base name in out_dir by scanning for:
      <prefix><n>.mv5 (or .multires.mv5) or <prefix><n>.h5
    and returning <prefix>(max+1) without extension.
    """
    os.makedirs(out_dir, exist_ok=True)

    max_idx = 0
    for name in os.listdir(out_dir):
        m = re.fullmatch(rf"{re.escape(prefix)}(\d+)\.(mv5|multires\.mv5|h5|hdf5)", name)
        if m:
            max_idx = max(max_idx, int(m.group(1)))

    return os.path.join(out_dir, f"{prefix}{max_idx + 1}")


def _is_int_string(s: str) -> bool:
    return bool(re.fullmatch(r"\d+", str(s).strip()))


def _stat_line(p: str) -> str:
    try:
        st = os.stat(p)
        return f"exists=True size={st.st_size} mtime={st.st_mtime}"
    except FileNotFoundError:
        return "exists=False"
    except Exception as e:
        return f"stat_error={type(e).__name__}: {e}"


def read_chromsizes_tsv(path: str):
    """
    Read a chromsizes TSV: chrom <tab> size
    Returns list[(chrom, size_int)] in file order.
    """
    chroms = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = re.split(r"\s+", line)
            if len(parts) < 2:
                raise ValueError(f"Invalid chromsizes line: {line!r}")
            chrom = parts[0]
            size = int(parts[1])
            chroms.append((chrom, size))
    if not chroms:
        raise ValueError("chromsizes file had no usable lines")
    return chroms


def write_chromsizes_for_single_chrom(path: str, chrom: str, total_bp: int):
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"{chrom}\t{int(total_bp)}\n")


def write_default_row_infos(path: str, k: int):
    with open(path, "w", encoding="utf-8") as f:
        for i in range(k):
            f.write(f"row_{i}\n")


def ensure_clodius_cmd():
    """
    Return a command prefix list to invoke clodius.
    Prefer `clodius` if on PATH. Otherwise fail with a clear message.
    """
    if shutil.which("clodius"):
        return ["clodius"]
    # Some installs might only expose it as a module, but this is not guaranteed.
    # We keep this strict to avoid silently doing the wrong thing.
    raise FileNotFoundError(
        "Could not find `clodius` on PATH. Install it (e.g. `pip install clodius`) "
        "and ensure the `clodius` command works in your shell."
    )


if __name__ == "__main__":
    print("\n" + "=" * 80)
    print(">>> NPYtoMV5converter.py starting")
    print(f">>> argv: {sys.argv}")
    print(f">>> cwd: {os.getcwd()}")
    print(f">>> python: {sys.executable}")
    print("=" * 80)


    default_npy_path = "uploads/current_input.npy"

    binsize = 1

    
    default_single_chrom = "testchromome"

    chromsizes_path = None         # TSV: chrom  size
    row_infos_path = None          # TXT: K lines (row labels)
    label_offset = 0               # unused, kept for compatibility
    out_name = None

    # ---------------------------------------------------------------------
    # Arg behavior
    #
    # Numeric index x:
    #   if a number x is passed as argv[1] OR argv[2], output is:
    #       OUT_DIR/npy_file_x.multires.mv5
    #
    # Input path:
    #   first non-flag, non-number argument is treated as input npy path
    #
    # Flags (optional, order-independent): - irrelevant
    #   --binsize <int>
    #   --chromsizes <path>
    #   --row-infos <path>
    #   --chrom <name>          
    # ---------------------------------------------------------------------

    args = sys.argv[1:]

    # detect numeric index in arg1/arg2 (before stripping flags)
    arg1 = args[0] if len(args) >= 1 else None
    arg2 = args[1] if len(args) >= 2 else None

    x = None
    if arg1 is not None and _is_int_string(arg1):
        x = int(arg1)
    elif arg2 is not None and _is_int_string(arg2):
        x = int(arg2)

    def pop_flag_value(flag: str):
        global args
        if flag in args:
            i = args.index(flag)
            if i + 1 >= len(args):
                raise ValueError(f"Missing value after {flag}")
            val = args[i + 1]
            args = args[:i] + args[i + 2 :]
            return val
        return None

    v = pop_flag_value("--binsize")
    if v is not None:
        binsize = int(v)

    v = pop_flag_value("--chromsizes")
    if v is not None:
        chromsizes_path = v

    v = pop_flag_value("--row-infos")
    if v is not None:
        row_infos_path = v

    v = pop_flag_value("--chrom")
    if v is not None:
        default_single_chrom = v

    v = pop_flag_value("--out")
    if v is not None:
        out_name = v

    # remaining non-number, non-flag arg = npy path (first one)
    npy_path = default_npy_path
    for a in args:
        if a.startswith("-"):
            continue
        if _is_int_string(a):
            continue
        npy_path = a
        break

    # decide output base name
    if out_name is not None:
        base_path = os.path.join(OUT_DIR, out_name)
        mode = "custom-name"
    elif x is not None:
        base_path = os.path.join(OUT_DIR, f"{PREFIX}{x}")
        mode = "indexed"
    else:
        base_path = next_out_base(OUT_DIR, prefix=PREFIX)
        mode = "auto-increment"

    base_h5_path = base_path + ".h5"
    mv5_path = base_path + ".multires.mv5"   # common naming used in practice

    print(f">>> Mode: {mode}")
    print(f">>> Input npy: {npy_path}  ({_stat_line(npy_path)})")
    print(f">>> binsize: {binsize}")
    print(f">>> chromsizes: {chromsizes_path}")
    print(f">>> row-infos: {row_infos_path}")
    print(f">>> Output base HDF5: {base_h5_path}")
    print(f">>> Output multires mv5: {mv5_path}")

    # Ensure output dir exists
    Path(base_h5_path).parent.mkdir(parents=True, exist_ok=True)
    Path(mv5_path).parent.mkdir(parents=True, exist_ok=True)

    # Clean stale outputs
    for p in [base_h5_path, mv5_path]:
        if os.path.exists(p):
            print(f">>> Removing stale output: {p}")
            os.remove(p)

    # --- load NxK matrix ---
    t0 = time.time()
    try:
        A = np.load(npy_path)
    except Exception as e:
        print(f"!!! np.load failed: {type(e).__name__}: {e}")
        raise

    print(f">>> Loaded npy in {time.time() - t0:.3f}s")
    print(f">>> Array dtype={A.dtype} shape={getattr(A, 'shape', None)} ndim={getattr(A, 'ndim', None)}")

    if not (hasattr(A, "ndim") and A.ndim == 2):
        msg = f"Expected a 2D matrix (N x K). Got shape={getattr(A, 'shape', None)}"
        print(f"!!! ERROR: {msg}")
        raise AssertionError(msg)

    N, K = A.shape
    print(f">>> Matrix is 2D: N={N} K={K}")


    # leads to create a single chromosome.
    tmp_files = []

    if chromsizes_path is not None:
        chroms = read_chromsizes_tsv(chromsizes_path)
        # compute number of bins per chrom at this binsize
        chrom_bins = []
        for chrom, size_bp in chroms:
            nbins = int(np.ceil(size_bp / binsize))
            chrom_bins.append((chrom, nbins, size_bp))

        total_bins = sum(nbins for _, nbins, _ in chrom_bins)
        print(f">>> chromsizes implies total_bins={total_bins} (sum over ceil(size/binsize))")

        if total_bins != N:
            raise ValueError(
                f"chromsizes/binning mismatch: matrix has N={N} rows, but chromsizes imply {total_bins} bins "
                f"at binsize={binsize}. Provide a matching chromsizes file or correct binsize."
            )

    else:
        # create a temporary chromsizes file for a single chromosome
        chroms = [(default_single_chrom, N * binsize)]
        chrom_bins = [(default_single_chrom, N, N * binsize)]
        chromsizes_path = os.path.join(OUT_DIR, Path(base_path).name + ".chromsizes.tsv")
        write_chromsizes_for_single_chrom(chromsizes_path, default_single_chrom, N * binsize)
        tmp_files.append(chromsizes_path)
        print(f">>> Wrote auto chromsizes: {chromsizes_path} ({_stat_line(chromsizes_path)})")

    # --- row infos ---
    if row_infos_path is None:
        row_infos_path = os.path.join(OUT_DIR, Path(base_path).name + ".row_infos.txt")
        write_default_row_infos(row_infos_path, K)
        tmp_files.append(row_infos_path)
        print(f">>> Wrote default row infos: {row_infos_path} ({_stat_line(row_infos_path)})")

    # --- write base HDF5 multivec ---
    print(">>> Writing base HDF5 multivec (datasets per chromosome) ...")
    t1 = time.time()
    row0 = 0
    with h5py.File(base_h5_path, "w") as f:
        for chrom, nbins, size_bp in chrom_bins:
            row1 = row0 + nbins
            data = A[row0:row1, :]
            # gzip compression is recommended by HiGlass docs
            dset = f.create_dataset(chrom, data.shape, compression="gzip")
            dset[:] = data
            row0 = row1

    print(f">>> Base HDF5 written in {time.time() - t1:.3f}s: {base_h5_path} ({_stat_line(base_h5_path)})")

    # --- run clodius aggregate multivec -> multires mv5 ---
    print(">>> Running: clodius aggregate multivec ...")
    clodius_prefix = ensure_clodius_cmd()
    cmd = (
        clodius_prefix
        + [
            "aggregate",
            "multivec",
            "--output-file",
            mv5_path,
            "--chromsizes-filename",
            chromsizes_path,
            "--starting-resolution",
            str(binsize),
            "--row-infos-filename",
            row_infos_path,
            base_h5_path,
        ]
    )
    print(f">>> cmd: {cmd}")

    t2 = time.time()
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"!!! clodius failed: returncode={e.returncode}")
        raise
    except Exception as e:
        print(f"!!! clodius error: {type(e).__name__}: {e}")
        raise

    print(f">>> .mv5 written in {time.time() - t2:.3f}s: {mv5_path} ({_stat_line(mv5_path)})")

    #delete temporary helper files
    for p in tmp_files:
        try:
            os.remove(p)
        except Exception:
            pass

    print(">>> Done.")
    print("=" * 80 + "\n")