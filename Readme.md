Step 0: have the docker engine running
Step 1: run '
        docker compose --profile prod up --build
        ' in the folder (for development: docker compose --profile dev up --build)


Info:

Frontend: http://localhost:8080

Backend: http://localhost:8000

HiGlass: http://localhost:8989



To control containers:
docker compose down
docker compose up