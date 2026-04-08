from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import fcntl
import numpy as np
import os
import re
import shutil
import subprocess
import tempfile
import zipfile


UPLOAD_DIR = Path("UserInputFiles")
REUPLOAD_DIR = Path("HiGlassFiles")

UPLOAD_DIR.mkdir(exist_ok=True)
REUPLOAD_DIR.mkdir(exist_ok=True)

server_status = {"state": "idle"}

CONVERSIONS = {
    "heatmap": {
        "script": "heatmapGenerator.py",
        "ext": ".mcool",
        "stage": "handling heatmap",
        "message": "generating heatmap",
        "missing": "Conversion finished but no .mcool file was found in /data",
    },
    "matrix": {
        "script": "matrix_logoGenerator.py",
        "ext": ".multires.mv5",
        "stage": "handling matrix heatmap",
        "message": "generating mv5",
        "missing": "Conversion finished but no .mv5 file was found in /data",
    },
    "logotrack": {
        "script": "matrix_logoGenerator.py",
        "ext": ".multires.mv5",
        "stage": "handling logo track",
        "message": "generating logo track",
        "missing": "Conversion finished but no .mv5 file was found in /data",
    },
}


def set_status(state: str, error: str = "") -> None:
    server_status["state"] = state if not error else f"{state} ERROR: {error}"


def safe_stem(name: str) -> str:
    value = re.sub(r"[^A-Za-z0-9_-]+", "_", Path(name).stem)
    return value or "finishedFile"


def safe_name(name: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(name).name)
    return value or "upload.npy"


def save_upload(file: UploadFile, path: Path) -> str:
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    path.parent.mkdir(parents=True, exist_ok=True)

    try:
        set_status(f"receiving file: {file.filename}")
        with open(path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return str(path)
    except Exception as e:
        error = f"{type(e).__name__}: {e}"
        set_status("failed to save upload", error)
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {error}") from e


def run_cmd(cmd: list[str], stage: str, message: str):
    set_status(f"{stage}: {message}")
    try:
        return subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        stdout = (e.stdout or "").strip()[-4000:]
        stderr = (e.stderr or "").strip()[-4000:]
        error_text = f"stdout:\n{stdout}\n\nstderr:\n{stderr}".strip()
        set_status(f"{stage} failed", error_text)
        raise HTTPException(
            status_code=500,
            detail={
                "message": f"{message} failed",
                "stdout": stdout,
                "stderr": stderr,
            },
        ) from e


def get_next_index(counter_file: str = "counter.txt") -> int:
    counter_path = REUPLOAD_DIR / counter_file
    with open(counter_path, "a+") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            f.seek(0)
            current = int(f.read().strip() or 100)
            value = current + 1
            f.seek(0)
            f.truncate()
            f.write(str(value))
            f.flush()
            os.fsync(f.fileno())
            return value
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)


def convert_file(kind: str, npy_path: str) -> str:
    cfg = CONVERSIONS.get(kind)
    if not cfg:
        raise HTTPException(status_code=400, detail=f"Unsupported conversion kind: {kind}")

    uuid = f"npy_file_{get_next_index()}"
    output_path = REUPLOAD_DIR / f"{uuid}{cfg['ext']}"

    set_status(f"{cfg['stage']}: preparing conversion")
    run_cmd(
        ["python", cfg["script"], npy_path, str(output_path)],
        cfg["stage"],
        cfg["message"],
    )

    if not output_path.exists():
        set_status("expected output file missing", cfg["missing"])
        raise HTTPException(status_code=500, detail=cfg["missing"])

    os.replace(output_path, f"{output_path}.done")

    if kind == "matrix":
        set_status("matrix heatmap done, queued bigwig generation")
    else:
        set_status("idle")

    return uuid


def mark_bigwigs_done(output_basename: str) -> None:
    for file in REUPLOAD_DIR.glob(f"{output_basename}*.bigWig"):
        if file.suffix != ".done" and not str(file).endswith(".done"):
            file.rename(Path(f"{file}.done"))


def run_bigwig_generation(input_path: str, output_basename: str) -> None:
    try:
        set_status("handling bigwig generation")
        run_cmd(
            ["python", "bigwigGenerator.py", input_path, output_basename],
            "handling bigwig generation",
            "generating bigwig files",
        )
        mark_bigwigs_done(output_basename)
        set_status("idle")
    except HTTPException:
        raise
    except Exception as e:
        set_status("bigwig generation failed", f"{type(e).__name__}: {e}")


def read_fasta_name_sequence_startpos(filepath: str):
    text = Path(filepath).read_text(encoding="utf-8")
    if not text.strip():
        raise ValueError("FASTA file is empty")

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    header = next((line for line in lines if line.startswith(">")), "")
    sequence = "".join(line for line in lines if not line.startswith(">"))

    match = re.match(r"^>(.+):(\d+)-(\d+)$", header)
    if not match:
        raise ValueError('Expected header format ">NAME:START-END"')
    if not sequence:
        raise ValueError("Sequence is empty")

    return {
        "name": match.group(1),
        "sequence": sequence,
        "startpos": int(match.group(2)),
    }


def classify_npy_file(path: str) -> tuple[str, tuple]:
    filename = Path(path).name.lower()

    try:
        arr = np.load(path, allow_pickle=True)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read npy file '{Path(path).name}': {type(e).__name__}: {e}",
        ) from e

    shape = getattr(arr, "shape", ())

    if "heatmap" in filename or "mcool" in filename:
        return "heatmap", shape
    if "logo" in filename or "track" in filename:
        return "logotrack", shape
    if "matrix" in filename:
        return "matrix", shape

    if arr.ndim == 4 and len(shape) == 4 and shape[0] == shape[2] and shape[1] == 3 and shape[3] == 4:
        return "heatmap", shape

    if arr.ndim == 2 and shape[0] == shape[1]:
        return "heatmap", shape

    if arr.ndim == 2:
        try:
            arrf = np.asarray(arr, dtype=float)
            if (
                np.isfinite(arrf).all()
                and arrf.min() >= 0
                and arrf.max() <= 1
                and np.allclose(arrf.sum(axis=1), 1.0, atol=1e-3)
            ):
                return "logotrack", shape
        except Exception:
            pass
        return "matrix", shape

    return "unknown", shape


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/new_file")
def new_file(file: UploadFile = File(...)):
    filename = file.filename or ""
    if Path(filename).suffix.lower() != ".npy":
        raise HTTPException(status_code=400, detail="Invalid file type. Only .npy allowed")

    input_path = UPLOAD_DIR / "current_input.npy"
    save_upload(file, input_path)
    uuid = convert_file("heatmap", str(input_path))

    return {
        "status": "success",
        "input_filename": filename,
        "output_name": safe_stem(filename),
        "output_done": str(REUPLOAD_DIR / f"{uuid}.mcool.done"),
        "uuid": uuid,
    }


@app.post("/upload_nxk_npy")
def upload_nxk_npy(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    save_path = UPLOAD_DIR / f"nxk__{safe_name(file.filename or '')}"
    save_upload(file, save_path)

    uuid = convert_file("matrix", str(save_path))
    background_tasks.add_task(run_bigwig_generation, str(save_path), uuid)

    return {
        "status": "success",
        "uuid": uuid,
        "mv5_status": "done",
        "bigwig_status": "queued",
    }


@app.post("/upload_logo_track")
def upload_logo_track(file: UploadFile = File(...)):
    save_path = UPLOAD_DIR / f"nxk__{safe_name(file.filename or '')}"
    save_upload(file, save_path)
    uuid = convert_file("logotrack", str(save_path))
    return {"status": "success", "uuid": uuid}


@app.post("/upload_zip_file")
def upload_zip_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    set_status("received zip file")
    save_path = UPLOAD_DIR / f"zip__{safe_name(file.filename or '')}"
    save_upload(file, save_path)

    try:
        with tempfile.TemporaryDirectory(prefix="zip_extract_") as tmpdir:
            try:
                set_status("extracting zip file")
                with zipfile.ZipFile(save_path, "r") as zf:
                    zf.extractall(tmpdir)
            except zipfile.BadZipFile as e:
                set_status("invalid zip file", "Uploaded file is not a valid zip archive")
                raise HTTPException(status_code=400, detail="Uploaded file is not a valid zip archive") from e

            root = Path(tmpdir)
            npy_files = list(root.rglob("*.npy"))
            fasta_files = [p for p in root.rglob("*") if p.suffix.lower() in {".fasta", ".fa", ".fna"}]

            if not npy_files:
                set_status("zip processing failed", "Zip archive contains no .npy files")
                raise HTTPException(status_code=400, detail="Zip archive contains no .npy files")

            uuid_matrix = ""
            uuid_heatmap = ""
            uuid_logotrack = ""
            fasta_name = ""
            fasta_sequence = ""
            fasta_startpos = None

            detected = []
            grouped = {kind: [] for kind in ("heatmap", "matrix", "logotrack", "unknown")}

            if fasta_files:
                set_status("reading fasta from zip")
                fasta_meta = read_fasta_name_sequence_startpos(str(fasta_files[0]))
                fasta_name = fasta_meta["name"]
                fasta_sequence = fasta_meta["sequence"]
                fasta_startpos = fasta_meta["startpos"]
                detected.append({"file": fasta_files[0].name, "kind": "fasta"})

            set_status("classifying zip contents")
            for npy_path in npy_files:
                kind, shape = classify_npy_file(str(npy_path))
                grouped[kind].append(str(npy_path))
                detected.append(
                    {
                        "file": npy_path.name,
                        "kind": kind,
                        "shape": list(shape) if isinstance(shape, tuple) else shape,
                    }
                )

            if grouped["heatmap"]:
                set_status("handling heatmap from zip")
                src = Path(grouped["heatmap"][0])
                dst = UPLOAD_DIR / f"zip_heatmap__{safe_name(src.name)}"
                shutil.copy2(src, dst)
                uuid_heatmap = convert_file("heatmap", str(dst))

            if grouped["matrix"]:
                set_status("handling matrix heatmap from zip")
                src = Path(grouped["matrix"][0])
                matrix_path = UPLOAD_DIR / f"zip_matrix__{safe_name(src.name)}"
                shutil.copy2(src, matrix_path)
                uuid_matrix = convert_file("matrix", str(matrix_path))
                background_tasks.add_task(run_bigwig_generation, str(matrix_path), uuid_matrix)

            if grouped["logotrack"]:
                set_status("handling logo track from zip")
                src = Path(grouped["logotrack"][0])
                dst = UPLOAD_DIR / f"zip_logotrack__{safe_name(src.name)}"
                shutil.copy2(src, dst)
                uuid_logotrack = convert_file("logotrack", str(dst))

            if not uuid_matrix:
                set_status("idle")

            return {
                "status": "success",
                "uuid_matrix": uuid_matrix,
                "uuid_heatmap": uuid_heatmap,
                "uuid_logotrack": uuid_logotrack,
                "matrix_bigwig_status": "queued" if uuid_matrix else "",
                "fasta_name": fasta_name,
                "fasta_sequence": fasta_sequence,
                "fasta_startpos": fasta_startpos,
                "detected": detected,
            }

    except HTTPException:
        raise
    except Exception as e:
        set_status("zip processing failed", f"{type(e).__name__}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Zip processing failed: {type(e).__name__}: {e}",
        ) from e


@app.get("/status")
async def get_status():
    return server_status