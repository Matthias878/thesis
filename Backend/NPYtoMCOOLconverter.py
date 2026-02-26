# --- Convert dense .npy matrix (NxN) to .cool and .mcool format ---

import numpy as np
import pandas as pd
import cooler
import scipy.sparse as sp
import subprocess
import os
import re
import sys
from pathlib import Path
import time

OUT_DIR = "McoolOutput"
PREFIX = "npy_file_"  # <-- new prefix per your request


def next_npyfile_base(out_dir=OUT_DIR, prefix=PREFIX):
    """
    Finds the next available base name in out_dir by scanning for:
      <prefix><n>.cool or <prefix><n>.mcool
    and returning <prefix>(max+1) without extension.
    """
    os.makedirs(out_dir, exist_ok=True)

    max_idx = 0
    for name in os.listdir(out_dir):
        m = re.fullmatch(rf"{re.escape(prefix)}(\d+)\.(cool|mcool)", name)
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


if __name__ == "__main__":
    print("\n" + "=" * 80)
    print(">>> NPYtoMCOOLconverter.py starting")
    print(f">>> argv: {sys.argv}")
    print(f">>> cwd: {os.getcwd()}")
    print(f">>> python: {sys.executable}")
    print("=" * 80)

    # ---- defaults ----
    default_npy_path = "uploads/current_input.npy"
    binsize = 1
    chrom = "testchromome"
    label_offset = 0  # currently unused, kept for compatibility

    # ---------------------------------------------------------------------
    # NEW OUTPUT NAMING BEHAVIOR:
    # - If a number x is passed as argv[1] OR argv[2], output is:
    #     McoolOutput/npy_file_x.mcool (and .cool)
    # - If no number is passed, output is from internal counting:
    #     McoolOutput/npy_file_<next>.mcool
    #
    # Input path behavior:
    # - If a non-number argument is present, it's treated as the input npy path.
    # - If no non-number argument is present, uses default input path.
    # ---------------------------------------------------------------------

    arg1 = sys.argv[1] if len(sys.argv) >= 2 else None
    arg2 = sys.argv[2] if len(sys.argv) >= 3 else None

    x = None
    npy_path = default_npy_path

    # detect numeric index in arg1/arg2
    if arg1 is not None and _is_int_string(arg1):
        x = int(arg1)
        # if arg2 exists and is not a number, treat it as input path
        if arg2 is not None and not _is_int_string(arg2):
            npy_path = arg2
        # if both are numbers, we'll keep default input and ignore arg2
        if arg2 is not None and _is_int_string(arg2):
            print(f">>> WARNING: both argv[1] and argv[2] are numbers; using x={x} and default input.")
    elif arg2 is not None and _is_int_string(arg2):
        x = int(arg2)
        # arg1 is non-number -> input path
        if arg1 is not None and not _is_int_string(arg1):
            npy_path = arg1
    else:
        # no numeric index provided; any non-number arg1 is input path
        if arg1 is not None:
            npy_path = arg1

    # decide output base name
    if x is not None:
        base_path = os.path.join(OUT_DIR, f"{PREFIX}{x}")
        mode = "indexed"
    else:
        base_path = next_npyfile_base(OUT_DIR, prefix=PREFIX)
        mode = "auto-increment"

    cool_path = base_path + ".cool"
    mcool_path = base_path + ".mcool"

    print(f">>> Mode: {mode}")
    print(f">>> Input npy: {npy_path}  ({_stat_line(npy_path)})")
    print(f">>> Output .cool: {cool_path}")
    print(f">>> Output .mcool: {mcool_path}")

    # Ensure output directories exist
    Path(cool_path).parent.mkdir(parents=True, exist_ok=True)
    Path(mcool_path).parent.mkdir(parents=True, exist_ok=True)

    # Clean stale outputs so downstream logic isn't confused
    for p in [cool_path, mcool_path]:
        if os.path.exists(p):
            print(f">>> Removing stale output: {p}")
            try:
                os.remove(p)
            except Exception as e:
                print(f"!!! Failed removing stale file {p}: {type(e).__name__}: {e}")
                raise

    # --- load dense matrix ---
    t0 = time.time()
    try:
        A = np.load(npy_path)
    except Exception as e:
        print(f"!!! np.load failed: {type(e).__name__}: {e}")
        raise

    print(f">>> Loaded npy in {time.time() - t0:.3f}s")
    print(f">>> Array dtype={A.dtype} shape={getattr(A, 'shape', None)} ndim={getattr(A, 'ndim', None)}")

    # Must be NxN
    if not (hasattr(A, "ndim") and A.ndim == 2 and A.shape[0] == A.shape[1]):
        msg = f"Expected a 2D square matrix (NxN). Got shape={getattr(A, 'shape', None)}"
        print(f"!!! ERROR: {msg}")
        raise AssertionError(msg)

    N = A.shape[0]
    print(f">>> Matrix is square: N={N}")

    # --- bins table ---
    print(">>> Building bins table...")
    bins = pd.DataFrame({
        "chrom": chrom,
        "start": np.arange(N) * binsize,
        "end": (np.arange(N) + 1) * binsize
    })

    # --- pixels table (upper triangle) ---
    print(">>> Building pixels table (upper triangle)...")
    Au = np.triu(A, k=0)
    coo = sp.coo_matrix(Au)

    pixels = pd.DataFrame({
        "bin1_id": coo.row.astype(np.int64),
        "bin2_id": coo.col.astype(np.int64),
        "count":   coo.data
    })

    print(f">>> pixels rows: {len(pixels)}")
    if len(pixels) > 0:
        print(f">>> pixels count dtype: {pixels['count'].dtype}")
        print(f">>> pixels count min/max: {np.min(pixels['count'])}/{np.max(pixels['count'])}")

    # Write .cool
    print(">>> Writing .cool with cooler.create_cooler() ...")
    t1 = time.time()
    try:
        cooler.create_cooler(
            cool_uri=cool_path,
            bins=bins,
            pixels=pixels,
            dtypes={"count": np.float64}
        )
    except Exception as e:
        print(f"!!! create_cooler failed: {type(e).__name__}: {e}")
        raise

    print(f">>> .cool written in {time.time() - t1:.3f}s: {cool_path} ({_stat_line(cool_path)})")

    # Convert .cool -> .mcool
    print(">>> Running: cooler zoomify ...")
    cmd = ["cooler", "zoomify", cool_path, "-o", mcool_path]
    print(f">>> cmd: {cmd}")

    t2 = time.time()
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"!!! zoomify failed: returncode={e.returncode}")
        raise
    except Exception as e:
        print(f"!!! zoomify error: {type(e).__name__}: {e}")
        raise

    print(f">>> .mcool written in {time.time() - t2:.3f}s: {mcool_path} ({_stat_line(mcool_path)})")
    print(">>> Done.")
    print("=" * 80 + "\n")