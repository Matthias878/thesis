from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import subprocess
import re
import numpy as np
from pathlib import Path

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
REUPLOAD_DIR = "McoolOutput"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(REUPLOAD_DIR, exist_ok=True)

statuses = {}


def set_status(msg: str):
    statuses["current_input"] = msg


def run_cmd(cmd: list[str], status_prefix: str):
    """
    Runs a subprocess command with robust error reporting.
    """
    set_status(f"{status_prefix}: running {' '.join(cmd)}")
    try:
        cp = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
        )
        statuses["last_stdout"] = (cp.stdout or "")[-4000:]
        statuses["last_stderr"] = (cp.stderr or "")[-4000:]
        set_status(f"{status_prefix}: finished")
        return cp
    except subprocess.CalledProcessError as e:
        out = (e.stdout or "").strip()
        err = (e.stderr or "").strip()
        set_status(f"{status_prefix}: FAILED")
        raise HTTPException(
            status_code=500,
            detail={
                "message": f"{status_prefix} failed",
                "command": cmd,
                "stdout": out[-4000:],
                "stderr": err[-4000:],
            },
        )


def safe_stem(name: str) -> str:
    """
    Very small sanitizer for output basenames.
    """
    stem = Path(name).stem
    stem = "".join(c for c in stem if c.isalnum() or c in ("-", "_"))
    return stem or "finishedFile"


def check_npy_readable(path: str) -> tuple[bool, str]:
    try:
        obj = np.load(path, allow_pickle=True)
        return True, f"npy loaded, shape={getattr(obj, 'shape', None)}"
    except Exception as e:
        return False, f"npy load failed: {type(e).__name__}: {e}"

#helper, index 
def get_next_index(counter_file="counter.txt"):
    # ensure file exists
    counter_file_path = os.path.join(REUPLOAD_DIR, counter_file)
    if not os.path.exists(counter_file_path):
        with open(counter_file_path, "w") as f:
            f.write("100")  # start before 101

    # read current value
    with open(counter_file_path, "r") as f:
        value = int(f.read().strip())

    value += 1

    # write updated value
    with open(counter_file_path, "w") as f:
        f.write(str(value))

    return value

#call with:
#curl.exe -X POST "http://127.0.0.1:8000/new_file" -F "file=@./uploads/start_up_input.npy"
#

# upload main heatmap
@app.post("/new_file")
async def new_file(file: UploadFile = File(...)):
    print(" /new_file endpoint triggered with file: ", file.filename)

    set_status("received new file")

    if not file or not file.filename:
        print("!!! ERROR: No filename provided")
        set_status("error: no filename provided")
        raise HTTPException(status_code=400, detail="No filename provided")

    filename = file.filename

    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    if ext not in (".pt", ".npy"):
        print(f"!!! ERROR: Invalid extension detected: {ext}")
        set_status(f"error: invalid file type ({ext})")
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only .pt and .npy allowed",
        )

    # Saved in uploads/current_input.npy or .pt
    input_path = os.path.join(UPLOAD_DIR, "current_input" + ext)

    set_status(f"saving upload to {input_path}")
    try:
        with open(input_path, "wb") as buffer:
            print(">>> Starting file write...")
            shutil.copyfileobj(file.file, buffer)
            print(">>> File write complete.")
    except Exception as e:
        print(f"!!! ERROR while saving upload: {type(e).__name__}: {e}")
        set_status("error: failed to save upload")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save upload: {type(e).__name__}: {e}",
        )

    print(f">>> Saved file exists? {os.path.exists(input_path)}")
    print(f">>> Saved file size: {os.path.getsize(input_path)} bytes")


    out_base = safe_stem(filename)
    out_dir = Path(REUPLOAD_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)

    # --- Convert based on extension ---
    print(">>> Starting conversion pipeline")
    set_status("starting conversion pipeline")

    #if ext == ".pt":
    #    # get N once for chromsizes
    #    obj = torch.load(input_path, map_location="cpu")
    #    mat = obj if isinstance(obj, torch.Tensor) else next(
    #        v for v in obj.values() if isinstance(v, torch.Tensor)
    #    )
    #    #write_chromsizes_tsv(chrom_len_bp=mat.shape[0])
#
    #    print(">>> Running PTtoMCOOLconverter.py")
    #    run_cmd(["python", "PTtoMCOOLconverter.py", input_path], "pt->mcool")

    if ext == ".npy":
        obj = np.load(input_path, allow_pickle=True)
        #write_chromsizes_tsv(chrom_len_bp=obj.shape[0])

        print(">>> Running DimensionReducer.py")
        run_cmd(["python", "DimensionReducer.py", input_path], "npy:dimension_reducer")

        print(">>> Running NPYtoMCOOLconverter.py")
        idx = get_next_index()
        run_cmd(["python", "NPYtoMCOOLconverter.py", str(idx)], "npy->mcool")
    else:
        print(f"!!! ERROR: Unhandled file extension at conversion step: {ext}")
        set_status(f"error: unhandled file extension at conversion step ({ext})")
        raise HTTPException(
            status_code=500,
            detail=f"Unhandled file extension at conversion step: {ext}",
        )

    print(">>> Conversion pipeline finished.")

    # --- Find produced .mcool ---
    output_path = os.path.join(REUPLOAD_DIR, "npy_file_" + str(idx) + ".mcool")

    print(f">>> Checking expected temp file: {output_path}")
    if not os.path.exists(output_path):
        print("!!! ERROR: No .mcool file found after conversion.")
        set_status("error: conversion finished but no .mcool file found")
        raise HTTPException(
            status_code=500,
            detail="Conversion finished but no .mcool file was found in McoolOutput",
        )
    else:
        print(f">>> Found file: {output_path}")
        mcool_tmp = Path(output_path)
        mcool_done = mcool_tmp.with_suffix(mcool_tmp.suffix + ".done")
        print(f">>> Renaming {mcool_tmp} → {mcool_done}")
        mcool_tmp.rename(mcool_done)

    # Finalize
    print(">>> SUCCESS: Conversion complete.")

    set_status("done: output ready")
    return {
        "status": "success",
        "input_filename": filename,
        "output_name": out_base,
        "output_done": str(mcool_done),
        "message": "File converted and finalized (.mcool.done).",
        "uuid": os.path.join("npy_file_" + str(idx))
    }

def safe_name(name: str) -> str:
    name = Path(name).name  # drops any directories
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name)
    return name or "upload.npy"


name = ""
ouname = ""

@app.post("/upload_nxk_npy")
async def upload_nxk_npy(file: UploadFile = File(...)):
    global name
    global ouname 
    base = safe_name(file.filename)

    save_path = os.path.join(UPLOAD_DIR, f"nxk__{base}")
    name = str(save_path)
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    idx = get_next_index()

    run_cmd(["python", "Create_mv5_fromnpy.py", str(save_path), str(idx)], "npy->mv5")

    output_path = os.path.join(REUPLOAD_DIR, f"npy_file_{idx}.multires.mv5")
    ouname = f"npy_file_{idx}"

    print(f">>> Checking expected temp file: {output_path}")
    if not os.path.exists(output_path):
        set_status("error: conversion finished but no .mv5 file found")
        raise HTTPException(
            status_code=500,
            detail="Conversion finished but no .mv5 file was found in   McoolOutput",
        )
    
    mv5_done = output_path + ".done"   # yields "...mv5.done"
    print(f">>> Renaming {output_path} → {mv5_done}")
    os.replace(output_path, mv5_done)  # atomic rename on same filesystem

    return {"status": "success", "uuid": f"npy_file_{idx}"}

#load N*k matrix as bigwig files - should only be called after upload_nxk_npy by frontend
@app.get("/upload_nxk_npy_bigwig")
async def upload_nxk_npy_bigwig():

    #for each row in the matrix create a new .bigwig file (max 12) from current
    subprocess.run(["python", "create_bigwigs_from_matrix.py", "--in", name, "--out", ouname])
    
    for file in Path(REUPLOAD_DIR).glob("*.bigWig"):
        file.rename(file.with_suffix(".bigWig.done"))
    
    return {
        "status": "success",
        "message": "bigwig files generated and finalized (.bigWig.done)."
    }


#get status
@app.get("/status/{key}")
async def get_status(key: str):
    return {"status": statuses.get(key, "idle")}



#upload logo track -multivec version 0-1 values sum to 1
@app.post("/upload_logo_track")
async def upload_logo_track(file: UploadFile = File(...)):
    base = safe_name(file.filename)

    save_path = os.path.join(UPLOAD_DIR, f"nxk__{base}")
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    idx = get_next_index()

    run_cmd(    ["python", "Create_mv5_fromnpy.py", str(save_path), "--out", f"npy_file_{idx}"],    "npy->mv5")

    output_path = os.path.join(REUPLOAD_DIR, f"npy_file_{idx}.multires.mv5")

    print(f">>> Checking expected temp file: {output_path}")
    if not os.path.exists(output_path):
        set_status("error: conversion finished but no .mv5 file found")
        raise HTTPException(
            status_code=500,
            detail="Conversion finished but no .mv5 file was found in   McoolOutput",
        )
    
    mv5_done = output_path + ".done"   # yields "...mv5.done"
    print(f">>> Renaming {output_path} → {mv5_done}")
    os.replace(output_path, mv5_done)  # atomic rename on same filesystem

    return {"status": "success", "uuid": f"npy_file_{idx}"}


#helper functions


def _safe_delete(path: str) -> None:
    if not path:
        return
    if os.path.exists(path):
        print(f"Deleting existing file: {path}")
        try:
            os.remove(path)
        except OSError as e:
            raise RuntimeError(f"Failed to delete existing file '{path}': {e}") from e
        

@app.get("/health")
async def health():
    return {"status": "ok"}



#------------------Below should no longer be necessary


def write_chromsizes_tsv(chrom_len_bp: int) -> None:
    """
    Write/overwrite a chromsizes TSV file with exactly:
        <chrom>\t<chrom_len_bp>\n
    """
    out_path = os.path.join("McoolOutput", "testchromome.chrom.sizes")
    chrom = "testchromome"
    out_dir = os.path.dirname(out_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    _safe_delete(out_path)

    line = f"{chrom}\t{int(chrom_len_bp)}\n"
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(line)

    print(f"Wrote chromsizes TSV: {out_path}")
    print(f"  {chrom}\t{int(chrom_len_bp)}")

    
#upload logo track - temp 4 bigwig version
@app.post("/upload_logo_track-TempUnused")
async def upload_logo_track(file: UploadFile = File(...)):
    statuses["current_input"] = "received new logo track file"
    filename = file.filename
    if not filename:
        statuses["current_input"] = "error: no filename"
        return {"status": "error", "message": "No filename provided"}

    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    if ext == ".npy":
        statuses["current_input"] = "logo track has correct extension (.npy)"

        # IMPORTANT: reconstruction_tensor.py expects this exact name
        file_path = os.path.join(UPLOAD_DIR, "logo_track_data.npy")

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        statuses["current_input"] = "saved logo track npy file"
        try:
            obj = np.load(file_path, allow_pickle=True)
            if obj.ndim != 2 or obj.shape[1] != 4:
                statuses["current_input"] = f"error: invalid shape {obj.shape}, expected Nx4"
                raise HTTPException(status_code=400, detail=f"Invalid shape {obj.shape}. Expected Nx4 format")
            #write_chromsizes_tsv(chrom_len_bp=obj.shape[0])
        except HTTPException:
            raise
        except Exception:
            statuses["current_input"] = "Failed to load npy file"
            return {"status": "error", "message": "Failed to load npy file"}
    else:
        statuses["current_input"] = "error: invalid file type, logo track must be .npy an Nx4 tensor"
        return {"status": "error", "message": "Invalid file type. Only .npy of shape Nx4 allowed"}

    statuses["current_input"] = "generating logo track files"
    subprocess.run(["python", "reconstruction_tensor.py"])
    
    for file in Path(REUPLOAD_DIR).glob("*.bigWig"):
        file.rename(file.with_suffix(".bigWig.done"))
    
    return {
        "status": "success",
        "message": "Logo track files generated and finalized (.bigWig.done)."
    }


@app.get("/mcool-files")
async def list_mcool_files():
    os.makedirs(REUPLOAD_DIR, exist_ok=True)

    raw = os.listdir(REUPLOAD_DIR)
    in_progress = []
    done = []

    for name in raw:
        if name.endswith(".mcool.done"):
            done.append(name[:-len(".mcool.done")])
            continue
        if name.endswith(".mcool"):
            in_progress.append(name[:-len(".mcool")])

    in_progress = sorted(set(in_progress))
    done = sorted(set(done))
    all_names = sorted(set(in_progress) | set(done))

    return {
        "all": all_names,
        "in_progress": in_progress,
        "done": done,
    }

# File upload endpoint - TODO upload 'any?' file - check if .pt or .npy and check safe, return that info to frontend
@app.post("/upload")  # TODO allow correct shapes (...) and exclude all others
async def upload_file(file: UploadFile = File(...)):
    statuses["current_input"] = "received new file"
    filename = file.filename
    if not filename:
        statuses["current_input"] = "error: no filename"
        return {"status": "error", "message": "No filename provided"}

    _, ext = os.path.splitext(filename)
    ext = ext.lower()

    if ext in (".pt",):
        file_path = os.path.join(UPLOAD_DIR, "current_input" + ext)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        statuses["current_input"] = "saved pt file"
        # TODO check shape

    elif ext in (".npy",):
        file_path = os.path.join(UPLOAD_DIR, "current_input" + ext)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        statuses["current_input"] = "saved npy file"
        try:
            obj = np.load(file_path, allow_pickle=True)
            statuses["current_input"] = (
                "saved npy tensor with shape "
                + str(obj.shape)
                + " next Step: convert to mcool file"
            )
        except Exception:
            statuses["current_input"] = "Failed to load npy file"
            return {"status": "error", "message": "Failed to load npy file"}

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

    statuses["current_input"] = "converting"
    subprocess.run(["python", "DimensionReducer.py", file_path])
    subprocess.run(
    ["python", "NPYtoMCOOLconverter.py", file_path],
    check=True,
    capture_output=False
)
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

    renamed = 0
    for mcool in mcool_files:
        out_base = mcool.name[:-len(".mcool")]
        mcool_done = output_dir / f"{out_base}.mcool.done"
        mcool.replace(mcool_done)
        renamed += 1

    statuses["current_input"] = "reupload should be imminent"

    return {
        "status": "success",
        "message": f"{renamed} file(s) renamed (.mcool -> .mcool.done)"
    }


# Check format npy
def check_npy_format(path):
    try:
        obj = np.load(path, allow_pickle=True)
        print("Loaded object type:", type(obj))
        print("Tensor shape is:", obj.shape)
        return obj.shape
    except Exception as e:
        print("Failed to load file:", e)
        return None
