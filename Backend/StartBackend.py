import subprocess

def run(cmd):
    subprocess.run(cmd, shell=True, check=False)

run("uvicorn serv:app --reload")
