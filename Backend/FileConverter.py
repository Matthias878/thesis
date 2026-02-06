#Give me a window that allows the user to choose a pytorch tensor (pickeled) show a simple heatmap from it
# only for .pt files

import torch
import numpy as np
import sys
import os
import pandas as pd
import cooler
from cooler import zoomify_cooler


def load_pt_file(file_path):
    if file_path.lower().endswith('.pt'):
        try:
            in_dat = torch.load(file_path, weights_only=False, map_location=torch.device('cpu'))# AI warning: By setting weights_only=False, you are allowing PyTorch to unpickle arbitrary objects. Only do this if you 100% trust the source of the files, as it can execute malicious code.
            if not isinstance(in_dat, torch.Tensor):
                print(f"Loaded data is not a tensor, attempting to convert to tensor.")
                return None#in_dat = torch.tensor(in_dat) 
            return in_dat
        except Exception as e:
            print(f"Tried to load " + file_path +" as a tensor but failed with Error: {e}")
            return None
    elif file_path.lower().endswith('.npy'):
        try:
            numpy_array = np.load(file_path)
            return torch.from_numpy(numpy_array)
        except Exception as e:
            print(f"Tried to load "+ file_path + " as a numpy_array but failed with Error: {e}")
            return None

#only return true is the tensor is of shape (N, N, 4, 4)
def check_Tensor_shape(tensor):
    if tensor.dim() != 4:
        print("Tensor does not have correct amount of dimensions (expected 4).")
        return False
    if tensor.shape[2] != 4 or tensor.shape[3] != 4:
        print("Last two dimensions of the tensor are not 4x4 matrices.")
        return False
    if tensor.shape[0] != tensor.shape[1]:
        print("The first two dimensions need to be of the same size.")
        return False
    print("Tensor has correct shape (N, N, 4, 4).")
    return True

if __name__ == "__main__": #-1 return code means incorrect shape -2 means failed to load
    # Get path from command line or use default
    mode = 'normal'  # or 'maxpool' #choose the largest value from each 4x4 matrix if mode=='normal' and save in 'data' variable # produce a 2D `data` matrix from loaded `in_dat` #TODO allow mode selection from command line
    if len(sys.argv) > 1:
        path = sys.argv[1] 
        print ("Trying to load specified file at: " + path)
    else:
        path ='uploads/current_input.pt' ##only accepts .pt files currently
        print ("Trying to load standard file at: " + path)
    
    arr = load_pt_file(path)# should be a tensors (N×N×4x4) means a NxN grid of 4x4 matrices of values
    
    if arr is None or not torch.is_tensor(arr):
        print("Failed to load tensor from file, stopping script execution.")
        sys.exit(-2)

    print ("Successfully loaded file as a Tensor.")   
    if not check_Tensor_shape(arr):
        print("Tensor shape is not correct, stopping script execution.")
        sys.exit(-1)

    data = arr.cpu().numpy() #load data as numpy array for processing RAM processing shit, At this moment data is 4D: (N, N, 4, 4)

    # optional maxpool mode: 2x2 non-overlapping max-pool on the resulting 2D grid
    #if mode == 'maxpool' and data is not None:
    #    H, W = data.shape #crashes
    #    pad_h = (2 - (H % 2)) % 2
    #    pad_w = (2 - (W % 2)) % 2
    #    if pad_h or pad_w:
    #        data = np.pad(data, ((0, pad_h), (0, pad_w)), mode='constant', constant_values=-np.inf)
    #    data = data.reshape(data.shape[0]//2, 2, data.shape[1]//2, 2).max(axis=(1, 3))
    if mode == 'normal':
        # Extract the maximum value from each 4x4 matrix
        data = np.max(np.abs(data), axis=(2, 3))
    # more modes todo...

    # since is symmetric, we only need upper triangle including diagonal
    N = data.shape[0]
    row_idx, col_idx = np.triu_indices(N)
    count = data[row_idx, col_idx]
    pixels = {
        'bin1_id': row_idx.astype(np.int32),
        'bin2_id': col_idx.astype(np.int32),
        'count': count.astype(np.float32)
    }

    # 3. PREPARE THE BINS
    # This must match the N from your matrix
    binsize = 1
    bins_df = pd.DataFrame({
        "chrom": ["chr1"] * N,
        "start": np.arange(N) * binsize,
        "end": (np.arange(N) + 1) * binsize,
    })

    # 4. Actual converting
    input_path = "temp/temp.cool"
    output_path = "McoolOutput/finishedFile.mcool"

    print("Creating cooler file...")


    cooler.create_cooler('temp/temp.cool', bins=bins_df, pixels=pixels)

    print("Successfully created 'base_resolution.cool'!")
    return_code = 1 # success code for creating .cool file

    print("Creating .mcool file from .cool file...")

    # This will create resolutions in powers of 2 by default
    # Instead of calling a module, we call the function directly
    try:
        zoomify_cooler(
            base_uris=[input_path], 
            outfile=output_path,           # Changed 'out' to 'outfile'
            resolutions=[1, 2, 4, 8, 16, 32, 64, 128, 256, 512], #(add 1024 only if N≥1024), # Changed string to list of ints
            chunksize=1000000,             # Added required chunksize
            nproc=4,
            balance=True                   # Passed via **kwargs
        )
        print(f"Successfully created .mcool file: '{output_path}'!")
        sys.exit(2)
    except Exception as e:
        print(f"Failed to create mcool: {e}")