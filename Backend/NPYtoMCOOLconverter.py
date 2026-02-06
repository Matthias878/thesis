# --- Convert dense .npy matrix (NxN) to .cool and .mcool format ---



import numpy as np
import pandas as pd
import cooler
import scipy.sparse as sp
import subprocess

if __name__ == "__main__":
# --- inputs ---
    npy_path = "uploads/current_input.npy"
    binsize = 10000            # choose a genomic bin size that makes sense
    chrom = "chr1"
    cool_path = "McoolOutput/finishedFile.cool"
    
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
    subprocess.run(["cooler", "zoomify", cool_path], check=True)
    # produces out.10000.mcool by default
