Step 0: have the docker engine running
Step 1: run '
        docker compose up --build
        '

only npy files of format Nx3xNx4 are accepted (not pt files of format NxNx4x4)

Info:

Frontend: http://localhost:8080  //Browser darkmode is not helpful

Backend: http://localhost:8000

HiGlass: http://localhost:8989   (http://localhost:8989/api/v1/tilesets/  to see what uuIds are uploaded)

reload frontend: 
docker compose up -d --build frontend
(this for some reason kills the higlass server?)

To control containers:
docker compose down --remove-orphans /docker rm -f ba-frontend-1 / docker rm -f ba-frontend-dev-1
docker compose up

show running things: docker compose ls

