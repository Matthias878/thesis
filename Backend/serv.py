from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import subprocess
import re
import numpy as np
from pathlib import Path
import zipfile
import tempfile

#TODO duplicate functionality, refactor -> callers/doers

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


def read_fasta_name_sequence_startpos(filepath):
    """
    Expected FASTA format:

    >CHROMOSOME_NAME:STARTNUMBER-ENDNUMBER
    SEQUENCE

    Example:
    >myawesomeChromosome79:7558-7567
    AACCGGTTTG

    Returns:
        dict with:
        - name
        - sequence
        - startpos

    Raises:
        ValueError: if the file content does not match the expected format
    """
    text = Path(filepath).read_text(encoding="utf-8")

    if not text.strip():
        raise ValueError("FASTA file is empty")

    lines = [line.strip() for line in text.splitlines() if line.strip()]

    header = next((line for line in lines if line.startswith(">")), "")
    sequence = "".join(line for line in lines if not line.startswith(">"))

    match = re.match(r"^>(.+):(\d+)-(\d+)$", header)
    if not match:
        raise ValueError('Expected header format ">NAME:START-END"')

    name = match.group(1)
    startpos = int(match.group(2))
    # endpos = int(match.group(3))  # parsed the same way, but unused here

    if not sequence:
        raise ValueError("Sequence is empty")

    return {
        "name": name,
        "sequence": sequence,
        "startpos": startpos,
    }


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


# helper, index
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


def safe_name(name: str) -> str:
    name = Path(name).name  # drops any directories
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name)
    return name or "upload.npy"


def _safe_delete(path: str) -> None:
    if not path:
        return
    if os.path.exists(path):
        print(f"Deleting existing file: {path}")
        try:
            os.remove(path)
        except OSError as e:
            raise RuntimeError(f"Failed to delete existing file '{path}': {e}") from e


def classify_npy_file(path: str) -> tuple[str, tuple]:
    """
    Returns (kind, shape), where kind is one of:
      - 'heatmap'
      - 'matrix'
      - 'logotrack'
      - 'unknown'

    Heuristics:
      1. Filename hints first
      2. 4D Nx3xNx4 => heatmap
      3. Square 2D => heatmap
      4. Non-square 2D with values in [0,1] and row sums ~1 => logotrack
      5. Other non-square 2D => matrix
    """
    filename = Path(path).name.lower()

    try:
        arr = np.load(path, allow_pickle=True)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read npy file '{Path(path).name}': {type(e).__name__}: {e}",
        )

    shape = getattr(arr, "shape", ())

    # filename hints first
    if "heatmap" in filename or "mcool" in filename:
        return "heatmap", shape
    if "logo" in filename or "track" in filename:
        return "logotrack", shape
    if "matrix" in filename:
        return "matrix", shape

    # explicit heatmap tensor format: Nx3xNx4
    if arr.ndim == 4:
        if len(shape) == 4 and shape[0] == shape[2] and shape[1] == 3 and shape[3] == 4:
            return "heatmap", shape

    # square 2D heatmap fallback
    if arr.ndim == 2 and shape[0] == shape[1]:
        return "heatmap", shape

    # 2D non-square: logotrack vs matrix
    if arr.ndim == 2 and shape[0] != shape[1]:
        try:
            arrf = np.asarray(arr, dtype=float)
            finite = np.isfinite(arrf).all()
            in_01 = arrf.min() >= 0 and arrf.max() <= 1
            row_sums = arrf.sum(axis=1)
            rows_sum_to_1 = np.allclose(row_sums, 1.0, atol=1e-3)

            if finite and in_01 and rows_sum_to_1:
                return "logotrack", shape
        except Exception:
            pass

        return "matrix", shape

    return "unknown", shape

def convert_heatmap_file(npy_path: str, original_name: str | None = None) -> str:
    filename = original_name or Path(npy_path).name
    out_base = safe_stem(filename)
    out_dir = Path(REUPLOAD_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(">>> Starting conversion pipeline")
    set_status("starting conversion pipeline")

    obj = np.load(npy_path, allow_pickle=True)
    print(f">>> Heatmap shape: {getattr(obj, 'shape', None)}")

    print(">>> Running DimensionReducer.py")
    run_cmd(["python", "DimensionReducer.py", npy_path], "npy:dimension_reducer")

    print(">>> Running NPYtoMCOOLconverter.py")
    idx = get_next_index()
    run_cmd(["python", "NPYtoMCOOLconverter.py", str(idx)], "npy->mcool")

    print(">>> Conversion pipeline finished.")

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

    print(">>> SUCCESS: Conversion complete.")
    set_status("done: output ready")

    return os.path.join("npy_file_" + str(idx))


def convert_matrix_file(npy_path: str) -> str:
    global name
    global ouname

    idx = get_next_index()

    run_cmd(["python", "Create_mv5_fromnpy.py", str(npy_path), str(idx)], "npy->mv5")

    output_path = os.path.join(REUPLOAD_DIR, f"npy_file_{idx}.multires.mv5")
    ouname_local = f"npy_file_{idx}"

    print(f">>> Checking expected temp file: {output_path}")
    if not os.path.exists(output_path):
        set_status("error: conversion finished but no .mv5 file found")
        raise HTTPException(
            status_code=500,
            detail="Conversion finished but no .mv5 file was found in   McoolOutput",
        )

    mv5_done = output_path + ".done"
    print(f">>> Renaming {output_path} → {mv5_done}")
    os.replace(output_path, mv5_done)

    # keep globals aligned with current matrix upload flow
    name = str(npy_path)
    ouname = ouname_local

    # create bigwigs for the matrix, same intent as upload_nxk_npy_bigwig
    subprocess.run(
        ["python", "create_bigwigs_from_matrix.py", "--in", name, "--out", ouname]
    )

    for file in Path(REUPLOAD_DIR).glob("*.bigWig"):
        if not str(file).endswith(".done"):
            file.rename(file.with_suffix(".bigWig.done"))

    return ouname_local


def convert_logotrack_file(npy_path: str) -> str:
    idx = get_next_index()

    run_cmd(
        ["python", "Create_mv5_fromnpy.py", str(npy_path), "--out", f"npy_file_{idx}"],
        "npy->mv5",
    )

    output_path = os.path.join(REUPLOAD_DIR, f"npy_file_{idx}.multires.mv5")

    print(f">>> Checking expected temp file: {output_path}")
    if not os.path.exists(output_path):
        set_status("error: conversion finished but no .mv5 file found")
        raise HTTPException(
            status_code=500,
            detail="Conversion finished but no .mv5 file was found in   McoolOutput",
        )

    mv5_done = output_path + ".done"
    print(f">>> Renaming {output_path} → {mv5_done}")
    os.replace(output_path, mv5_done)

    return f"npy_file_{idx}"


# call with:
# curl.exe -X POST "http://127.0.0.1:8000/new_file" -F "file=@./uploads/start_up_input.npy"


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

    print(">>> Starting conversion pipeline")
    set_status("starting conversion pipeline")

    if ext == ".npy":
        obj = np.load(input_path, allow_pickle=True)

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

    mv5_done = output_path + ".done"
    print(f">>> Renaming {output_path} → {mv5_done}")
    os.replace(output_path, mv5_done)

    return {"status": "success", "uuid": f"npy_file_{idx}"}


# load N*k matrix as bigwig files - should only be called after upload_nxk_npy by frontend
@app.get("/upload_nxk_npy_bigwig")
async def upload_nxk_npy_bigwig():
    subprocess.run(["python", "create_bigwigs_from_matrix.py", "--in", name, "--out", ouname])

    for file in Path(REUPLOAD_DIR).glob("*.bigWig"):
        file.rename(file.with_suffix(".bigWig.done"))

    return {
        "status": "success",
        "message": "bigwig files generated and finalized (.bigWig.done)."
    }


# get status
@app.get("/status/{key}")
async def get_status(key: str):
    return {"status": statuses.get(key, "idle")}


@app.post("/upload_zip_file")
async def upload_zip_file(file: UploadFile = File(...)):
    base = safe_name(file.filename)

    save_path = os.path.join(UPLOAD_DIR, f"zip__{base}")
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    print(f">>> Saved zip file: {save_path} (size: {os.path.getsize(save_path)} bytes)")
    set_status(f"zip uploaded: {base}")

    uuid_matrix = ""
    uuid_heatmap = ""
    uuid_logotrack = ""

    fasta_name = ""
    fasta_sequence = ""
    fasta_startpos = None

    detected = []

    try:
        with tempfile.TemporaryDirectory(prefix="zip_extract_") as tmpdir:
            try:
                with zipfile.ZipFile(save_path, "r") as zf:
                    zf.extractall(tmpdir)
            except zipfile.BadZipFile:
                raise HTTPException(status_code=400, detail="Uploaded file is not a valid zip archive")

            npy_files = []
            fasta_files = []

            for root, _, files in os.walk(tmpdir):
                for fname in files:
                    full_path = os.path.join(root, fname)
                    lower_name = fname.lower()

                    if lower_name.endswith(".npy"):
                        npy_files.append(full_path)
                    elif lower_name.endswith(".fasta") or lower_name.endswith(".fa") or lower_name.endswith(".fna"):
                        fasta_files.append(full_path)

            if not npy_files:
                raise HTTPException(
                    status_code=400,
                    detail="Zip archive contains no .npy files",
                )

            print(f">>> Found {len(npy_files)} npy files in zip")
            print(f">>> Found {len(fasta_files)} fasta files in zip")

            # parse first fasta file if present
            if fasta_files:
                fasta_path = fasta_files[0]
                print(f">>> Using fasta file: {fasta_path}")
                fasta_meta = read_fasta_name_sequence_startpos(fasta_path)

                fasta_name = fasta_meta["name"]
                fasta_sequence = fasta_meta["sequence"]
                fasta_startpos = fasta_meta["startpos"]

                detected.append(
                    {
                        "file": Path(fasta_path).name,
                        "kind": "fasta",
                    }
                )

            classified = []
            for npy_path in npy_files:
                kind, shape = classify_npy_file(npy_path)
                classified.append((npy_path, kind, shape))
                detected.append(
                    {
                        "file": Path(npy_path).name,
                        "kind": kind,
                        "shape": list(shape) if isinstance(shape, tuple) else shape,
                    }
                )
                print(f">>> classify: {Path(npy_path).name} -> {kind} shape={shape}")

            heatmaps = [item for item in classified if item[1] == "heatmap"]
            matrices = [item for item in classified if item[1] == "matrix"]
            logotracks = [item for item in classified if item[1] == "logotrack"]
            unknowns = [item for item in classified if item[1] == "unknown"]

            if unknowns:
                print(">>> Unknown files found in zip:")
                for p, _, s in unknowns:
                    print(f"    - {Path(p).name}: shape={s}")

            # use the first matching file for each type
            if heatmaps:
                heatmap_path = heatmaps[0][0]
                print(f">>> Using heatmap file: {heatmap_path}")
                uuid_heatmap = convert_heatmap_file(heatmap_path, Path(heatmap_path).name)

            if matrices:
                matrix_path = matrices[0][0]
                print(f">>> Using matrix file: {matrix_path}")
                uuid_matrix = convert_matrix_file(matrix_path)

            if logotracks:
                logo_path = logotracks[0][0]
                print(f">>> Using logo track file: {logo_path}")
                uuid_logotrack = convert_logotrack_file(logo_path)

            return {
                "status": "success",
                "message": "Zip file uploaded and conversion finished.",
                "uuid_matrix": uuid_matrix,
                "uuid_heatmap": uuid_heatmap,
                "uuid_logotrack": uuid_logotrack,
                "fasta_name": fasta_name,
                "fasta_sequence": fasta_sequence,
                "fasta_startpos": fasta_startpos,
                "detected": detected,
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Zip processing failed: {type(e).__name__}: {e}",
        )

# upload logo track -multivec version 0-1 values sum to 1
@app.post("/upload_logo_track")
async def upload_logo_track(file: UploadFile = File(...)):
    base = safe_name(file.filename)

    save_path = os.path.join(UPLOAD_DIR, f"nxk__{base}")
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    idx = get_next_index()

    run_cmd(
        ["python", "Create_mv5_fromnpy.py", str(save_path), "--out", f"npy_file_{idx}"],
        "npy->mv5",
    )

    output_path = os.path.join(REUPLOAD_DIR, f"npy_file_{idx}.multires.mv5")

    print(f">>> Checking expected temp file: {output_path}")
    if not os.path.exists(output_path):
        set_status("error: conversion finished but no .mv5 file found")
        raise HTTPException(
            status_code=500,
            detail="Conversion finished but no .mv5 file was found in   McoolOutput",
        )

    mv5_done = output_path + ".done"
    print(f">>> Renaming {output_path} → {mv5_done}")
    os.replace(output_path, mv5_done)

    return {"status": "success", "uuid": f"npy_file_{idx}"}


@app.get("/health")
async def health():
    return {"status": "ok"}