import subprocess

def run(cmd):
    subprocess.run(cmd, shell=True, check=False)

run("npm run dev")

#OR

#subprocess.run(["npm", "run", "dev"], check=True)

#OR

#import subprocess#

#def run(cmd):
#    subprocess.run(cmd, shell=True, check=True)#

#run("npm run dev")