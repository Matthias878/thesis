#needs Docker Desktop installed and running on the pc
import subprocess
import os
import sys


FILE_PATH = "C:/Stuff/BA/Backend/McoolOutput/finishedFile.mcool"

def run(cmd):
    subprocess.run(cmd, shell=True, check=False)

# 0) Optional sanity check: is Docker running?
if subprocess.run("docker info", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
    raise RuntimeError("Docker is not running. Start Docker Desktop first.")

# 1. Pull image (FIXED)
run("docker pull higlass/higlass-docker")

# 2. Start container if not running (also check stopped containers)
result = subprocess.run(
    "docker ps -aq -f name=^higlass$",
    shell=True,
    capture_output=True,
    text=True
)

if not result.stdout.strip():
    run(
        "docker run -d "
        "--name higlass "
        "-p 8989:80 "
        "-v C:/Stuff/BA/Backend/McoolOutput:/data "
        "higlass/higlass-docker"
    )
else:
    # if it exists but is stopped, start it
    run("docker start higlass")

    
# 3. Check if file exists before ingesting
if not os.path.isfile(FILE_PATH):
    print(f"no .mcool file at: {FILE_PATH} please upload and convert a file before starting the server")
else:

    # 2.5 Upload file to container
    run('docker cp "C:/Stuff/BA/Backend/McoolOutput/finishedFile.mcool" higlass:/tmp/file.mcool')
    

    # 3. Delete old tileset (ignore errors)
    run(
        "docker exec -it higlass python higlass-server/manage.py delete_tileset --uuid finishedfile"
    )

    # 4. Ingest tileset
    run(
        "docker exec -it higlass python higlass-server/manage.py ingest_tileset --filename /tmp/file.mcool --filetype cooler --datatype matrix --uid finishedfile --name finishedFile"
    )
