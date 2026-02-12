#.npy saves arrays //
import numpy as np
import os
#import tkinter as tk
#from tkinter import filedialog

#gives a file dialog to choose a .npy file
#def choose_file(initialdir=None, filetypes=(("NumPy files", "*.npy"), ("All files", "*.*")), multiple=False, title="Select file"):
#    root = tk.Tk()
#    root.withdraw()
#    if initialdir is None:
#        initialdir = os.path.expanduser("~")
#    if multiple:
#        return list(filedialog.askopenfilenames(parent=root, initialdir=initialdir, title=title, filetypes=filetypes))
#    return filedialog.askopenfilename(parent=root, initialdir=initialdir, title=title, filetypes=filetypes)

if __name__ == "__main__":
    #path = choose_file()
    path = "./uploads/current_input.npy"
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
        print("Tensor shape is:", obj.shape)
    
