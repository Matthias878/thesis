FROM python:3.11-slim

WORKDIR /app

# optional: system deps (falls du welche brauchst)
# RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*

# requirements zuerst für bessere Layer-Caches
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Code rein
COPY . .

EXPOSE 8000

# Dev: reload
CMD ["uvicorn", "serv:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
