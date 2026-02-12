#TODO files need to written as finishedFile.mcool and then when done writing as finsihedFile.mcool.done - to avoid ingestion during writing


from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
#import PTtoMCOOLconverter #alle imports werden einmal executed beim laden - main nicht
#import HiGlassServer # important, starts the server 
#import DimensionReducer
#import NPYtoMCOOLconverter
import subprocess
import numpy as np
from pathlib import Path; 




app = FastAPI()

# WICHTIG: Erlaubt React den Zugriff (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Im Production-Einsatz auf deine Domain einschränken
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
REUPLOAD_DIR = "McoolOutput"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(REUPLOAD_DIR, exist_ok=True)

# einfacher In-Memory-Status für Polling durch das Frontend
statuses = {}

# File upload endpoint - TODO upload 'any?' file - check if .pt or .npy and check safe, return that info to frontend
@app.post("/upload") #TODO allow correct shapes (NxN | NxNx4x4 | Nx4xNx4 | NxNx3x4 | Nx3xNx4) and exlude all others
async def upload_file(file: UploadFile = File(...)):
    statuses["current_input"] = "received new file"
    filename = file.filename
    if not filename:
        statuses["current_input"] = "error: no filename"
        return {"status": "error", "message": "No filename provided"}

    
    _, ext = os.path.splitext(filename)
    if ext.lower() in (".pt"):
        file_path = os.path.join(UPLOAD_DIR, "current_input" + ext.lower())
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        # setze einfachen Status, den das Frontend abfragen kann
        statuses["current_input"] = "saved pt file"
        #TODO check shape
    elif ext.lower() in (".npy"):
        file_path = os.path.join(UPLOAD_DIR, "current_input" + ext.lower())
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        # setze einfachen Status, den das Frontend abfragen kann
        statuses["current_input"] = "saved npy file"
        try:
            obj = np.load(file_path, allow_pickle=True)
            #shape = obj.shape
            statuses["current_input"] = "saved npy tensor with shape " + str(obj.shape) + "next Step: convert to mcool file"
        except Exception as e:
            statuses["current_input"] = "Failed to load npy file: "
            return {"Failed to load npy file"}
    else:
        statuses["current_input"] = "error: invalid file type"
        return {"status": "error", "message": "Invalid file type. Only .pt and .npy allowed"}

    
    return {"filename": file.filename, "status": "saved"}


# Trigger conversion endpoint
@app.post("/convert_pt")
async def convert_file_pt():
    file_path = os.path.join(UPLOAD_DIR, "current_input.pt")
    
    if not os.path.exists(file_path):
        return {"status": "error", "message": "No file to convert"}
    
    # Run FileConverter.py on the saved file
    statuses["current_input"] = "converting"
    subprocess.run(["python", "PTtoMCOOLconverter.py", file_path])
    statuses["current_input"] = "converted"
    
    return {"status": "success", "message": "converted pt to mcool file"}


# Trigger npy conversion endpoint
@app.post("/convert_npy")
async def convert_file_npy():
    file_path = os.path.join(UPLOAD_DIR, "current_input.npy")
    
    if not os.path.exists(file_path):
        return {"status": "error", "message": "No file to convert"}
    
    # Run FileConverter.py on the saved file
    statuses["current_input"] = "converting"
    subprocess.run(["python", "DimensionReducer.py", file_path])

    subprocess.run(["python", "NPYtoMCOOLconverter.py", file_path])
    statuses["current_input"] = "converted"
    
    return {"status": "success", "message": "converted npy to mcool file"}

# Trigger conversion endpoint
@app.post("/reupload")
async def reupload_file():
    output_dir = Path("McoolOutput")

    if not output_dir.exists():
        return {"status": "error", "message": "Output folder not found"}

    mcool_files = list(output_dir.glob("*.mcool"))

    if not mcool_files:
        return {"status": "error", "message": "No .mcool files found"}

    statuses["current_input"] = "uploading"

    for file in mcool_files:
        new_name = file.with_suffix(file.suffix + ".done")
        file.replace(new_name)

    statuses["current_input"] = "reupload should be imminent"

    return {
        "status": "success",
        "message": f"{len(mcool_files)} file(s) renamed"
    }

#Check format npy
def check_npy_format(path):
    try:
        obj = np.load(path, allow_pickle=True)
        print("Loaded object type:", type(obj))
        print("Tensor shape is:", obj.shape)
        return obj.shape
    except Exception as e:
        print("Failed to load file:", e)
        return None


@app.get("/status/{key}")
async def get_status(key: str):
    """Einfache Polling-Endpoint: Frontend fragt regelmäßig /status/current_input ab."""
    return {"status": statuses.get(key, "idle")}



@app.get("/mcool-files")
async def list_mcool_files():
    # Ensure folder exists
    os.makedirs(REUPLOAD_DIR, exist_ok=True)

    raw = os.listdir(REUPLOAD_DIR)

    in_progress = []
    done = []

    for name in raw:
        # done files: finishedFile.mcool.done  ->  finishedFile
        if name.endswith(".mcool.done"):
            done.append(name[:-len(".mcool.done")])
            continue

        # in-progress files: finishedFile.mcool -> finishedFile
        # (but exclude any accidental ".mcool.done" already handled above)
        if name.endswith(".mcool"):
            in_progress.append(name[:-len(".mcool")])

    # stable output
    in_progress = sorted(set(in_progress))
    done = sorted(set(done))

    # combined set (names that exist in either state)
    all_names = sorted(set(in_progress) | set(done))

    return {
        "all": all_names,
        "in_progress": in_progress,
        "done": done,
    }