# --- Convert dense .npy matrix (NxN) to .cool and .mcool format ---

import numpy as np
import pandas as pd
import cooler
import scipy.sparse as sp
import subprocess
import os
import re

def next_npyfile_base(out_dir="McoolOutput", prefix="npyfile_"):
    os.makedirs(out_dir, exist_ok=True)

    max_idx = 0
    for name in os.listdir(out_dir):
        m = re.fullmatch(rf"{re.escape(prefix)}(\d+)\.(cool|mcool)", name)
        if m:
            max_idx = max(max_idx, int(m.group(1)))

    return os.path.join(out_dir, f"{prefix}{max_idx + 1}")


if __name__ == "__main__":
# --- inputs ---
    npy_path = "uploads/current_input.npy"
    binsize = 10000            # choose a genomic bin size that makes sense
    chrom = "chr1"
    base_path = next_npyfile_base("McoolOutput", prefix="npyfile_")
    cool_path = base_path + ".cool"
    mcool_path = base_path + ".mcool"   

    print(f"Output will be saved as:")
    print(f"  {cool_path}")
    print(f"  {mcool_path}")

    
    # --- load dense matrix ---
    A = np.load(npy_path)
    assert A.ndim == 2 and A.shape[0] == A.shape[1]
    N = A.shape[0]
    
    # --- bins table (genomic axis labeling) ---
    bins = pd.DataFrame({
        "chrom": chrom,
        "start": np.arange(N) * binsize,
        "end": (np.arange(N) + 1) * binsize
    })
    
    # --- pixels table (sparse entries) ---
    # If your matrix is symmetric, store only upper triangle to avoid double-counting.
    Au = np.triu(A, k=0)
    
    coo = sp.coo_matrix(Au)
    pixels = pd.DataFrame({
        "bin1_id": coo.row.astype(np.int64),
        "bin2_id": coo.col.astype(np.int64),
        "count":   coo.data
    })
    
    # Write .cool
    cooler.create_cooler(
        cool_uri=cool_path,
        bins=bins,
        pixels=pixels,
        dtypes={"count": np.float64}  # or int if your counts are integers
    )
    
    # Convert .cool -> .mcool (multires)
    subprocess.run(
    ["cooler", "zoomify", cool_path, "-o", mcool_path],
    check=True
    )

    # produces out.10000.mcool by default
