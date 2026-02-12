Step 0: have the docker engine running
Step 1: run '
        docker compose --profile prod up --build
        ' in the folder (for development: docker compose --profile dev up --build) - ?does not work? - still need docker up/down?

only pt files of format NxNx4x4 and npy files of format Nx3xNx4 are accepted

Info:

Frontend: http://localhost:8080

Backend: http://localhost:8000

HiGlass: http://localhost:8989



To control containers:
docker compose down --remove-orphans /docker rm -f ba-frontend-1 / docker rm -f ba-frontend-dev-1
docker compose up

show running things: docker compose ls

