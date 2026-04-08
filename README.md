### 1. Start Docker
Make sure the Docker engine is running.

### 2. Run the project
```bash
docker compose up --build
```

## Sites

- **Frontend**  
  http://localhost:8080  

- **Python Backend**  
  http://localhost:8000  

- **HiGlass Backend**  
  http://localhost:8989  
  List available tilesets:  
  http://localhost:8989/api/v1/tilesets/?limit=100

## Performance Testing (on windows):
```bash
docker compose --profile test up --build
```
```bash
powershell -ExecutionPolicy Bypass -File .\testtool.ps1 
```
