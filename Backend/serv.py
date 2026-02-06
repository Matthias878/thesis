from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import FileConverter
import HiGlassServer
import DimensionReducer
import NPYtoMCOOLconverter
import subprocess
import numpy as np

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
        statuses["current_input"] = "saved file"
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
            return {"Failed to load npy file"}
    else:
        statuses["current_input"] = "error: invalid file type"
        return {"status": "error", "message": "Invalid file type. Only .pt and .npy allowed"}

    
    return {"filename": file.filename, "status": "saved"}


# Trigger conversion endpoint
@app.post("/convert")
async def convert_file():
    file_path = os.path.join(UPLOAD_DIR, "current_input.pt")
    
    if not os.path.exists(file_path):
        return {"status": "error", "message": "No file to convert"}
    
    # Run FileConverter.py on the saved file
    statuses["current_input"] = "converting"
    subprocess.run(["python", "FileConverter.py", file_path])
    statuses["current_input"] = "converted"
    
    return {"status": "success", "message": "converted pt to mcool file"}


# Trigger npy conversion endpoint
@app.post("/convert_npy")
async def convert_file():
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
    file_path = os.path.join(UPLOAD_DIR, "current_input.pt")
    
    if not os.path.exists(file_path):
        return {"status": "error", "message": "No file to reupload"}
    
    # Run FileConverter.py on the saved file
    statuses["current_input"] = "uploading"
    subprocess.run(["python", "HiGlassServer.py"])
    statuses["current_input"] = "reuploaded"
    
    return {"status": "success", "message": "File reupload triggered"}

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