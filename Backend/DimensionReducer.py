#TODO one: turn a .npy file of Nx3xNx4 shape into a (absolut-max) NxN .npy file -DONE/WORKS

import numpy as np
import os
import tkinter as tk
from tkinter import filedialog

##gives a file dialog to choose a .npy file
#def choose_file(initialdir=None, filetypes=(("NumPy files", "*.npy"), ("All files", "*.*")), multiple=False, title="Select file"):
#    root = tk.Tk()
#    root.withdraw()
#    if initialdir is None:
#        initialdir = os.path.expanduser("~")
#    if multiple:
#        return list(filedialog.askopenfilenames(parent=root, initialdir=initialdir, title=title, filetypes=filetypes))
#    return filedialog.askopenfilename(parent=root, initialdir=initialdir, title=title, filetypes=filetypes)
if __name__ == "__main__":
    path = "uploads/current_input.npy"
    if path:
        print("Selected:", path)
        # load the selected file into a Python object
        try:
            if path.lower().endswith(".npz"):
                with np.load(path, allow_pickle=True) as z:
                    keys = z.files
                    obj = z[keys[0]] if len(keys) == 1 else {k: z[k] for k in keys}
            else:
                obj = np.load(path, allow_pickle=True)
            print("Loaded object type:", type(obj))
        except Exception as e:
            print("Failed to load file:", e)
    arr = None
    if isinstance(obj, dict):
        for v in obj.values():
            if isinstance(v, np.ndarray):
                arr = v
                break
    elif isinstance(obj, np.ndarray):
        arr = obj
    if arr is None:
        print("No ndarray found in loaded object")
    else:
        if arr.ndim != 4 or arr.shape[1] != 3 or arr.shape[3] != 4 or arr.shape[0] != arr.shape[2]:
            print("Unexpected array shape:", getattr(arr, "shape", None))
        else:
            N = arr.shape[0]
            # reshape to (N, N, 12) where each entry corresponds to flattened 3x4 block
            flat = arr.transpose(0, 2, 1, 3).reshape(N, N, 12)
            # index of max absolute value within each 12-element block
            idx = np.argmax(np.abs(flat), axis=2)
            r, c = np.ogrid[:N, :N]
            out = np.abs(flat[r, c, idx])
            outpath = "uploads/current_input.npy"
            np.save(outpath, out)
            print("Saved:", outpath, "shape:", out.shape)
    
