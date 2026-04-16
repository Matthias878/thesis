### 1. Start Docker
Make sure the Docker engine is running.

### 2. Run the project
```bash
docker compose up --build
```

## Links

- **Open the frontend Web Tool**  
  http://localhost:8080  

- **See all tilesets in the backend**  
  http://localhost:8080/higlass/api/v1/tilesets/?limit=100


## Performance Testing (on windows):
```bash
docker compose --profile test up --build
```
```bash
powershell -ExecutionPolicy Bypass -File .\testtool.ps1
```
