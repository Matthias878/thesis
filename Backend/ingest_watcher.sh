#!/usr/bin/env bash
echo "SHELL=$0  BASH_VERSION=${BASH_VERSION:-no}"
set -euo pipefail

echo "Waiting for higlass..."
for i in {1..360}; do
  if curl -fsS http://higlass:80/ >/dev/null; then
    echo "higlass is up (attempt $i)"
    break
  else
    echo "attempt $i failed"
  fi
  sleep 3
done

DATA_DIR="/data"

# ---- FIRST RUN SENTINEL (kept, but no longer needed for UUID uniqueness) ----
INIT_SENTINEL="${DATA_DIR}/.higlass_initialized"
if [[ ! -f "$INIT_SENTINEL" ]]; then
  echo "First run detected."
  touch "$INIT_SENTINEL"
else
  echo "Not first run."
fi

# ---- MIGRATIONS (locked with flock to avoid sqlite races) ----
echo "Applying Django migrations (locked with flock)..."
LOCKFILE="${DATA_DIR}/.higlass_migrate.lock"
(
  flock -x 200

  for i in {1..30}; do
    if python higlass-server/manage.py migrate --noinput; then
      echo "Migrations done."
      exit 0
    fi
    echo "migrate failed (attempt $i), retrying..."
    sleep 2
  done

  echo "ERROR: migrate keeps failing"
  exit 1
) 200>"$LOCKFILE"

# --- IMPORTANT: must match chromosome name exactly ---
COORD_SYSTEM="testchromome"
CHROMSIZES_TSV="${DATA_DIR}/${COORD_SYSTEM}.chrom.sizes"
CHROMSIZES_UID="chromsizes__${COORD_SYSTEM}"

sanitize_uid() {
  local s="$1"
  s="$(printf '%s' "$s" | tr '[:upper:]' '[:lower:]')"
  s="$(printf '%s' "$s" | sed -E 's/[^a-z0-9_-]+/_/g; s/^_+|_+$//g')"
  s="${s:0:63}"
  [[ -z "$s" ]] && s="tileset"
  printf '%s' "$s"
}

delete_tileset_always() {
  local uid="$1"
  echo "Deleting tileset uid=$uid if present..."
  python higlass-server/manage.py shell -c "
from tilesets.models import Tileset
qs = Tileset.objects.filter(uuid='${uid}')
print('  found:', qs.count())
qs.delete()
"
}

ingest_chromsizes_every_time() {
  if [[ ! -f "$CHROMSIZES_TSV" ]]; then
    echo "ERROR: chromsizes file missing: $CHROMSIZES_TSV"
    return 1
  fi

  # Idempotent: always delete then ingest
  delete_tileset_always "$CHROMSIZES_UID"

  echo "Ingesting chromsizes: file=$CHROMSIZES_TSV uid=$CHROMSIZES_UID coordSystem=$COORD_SYSTEM"
  python higlass-server/manage.py ingest_tileset \
    --filename "$CHROMSIZES_TSV" \
    --filetype chromsizes-tsv \
    --datatype chromsizes \
    --coordSystem "$COORD_SYSTEM" \
    --uid "$CHROMSIZES_UID" \
    --name "Chromosomes (${COORD_SYSTEM})"
}

echo "Watching ${DATA_DIR} for ANY *.done (rename first, then ingest) ..."

while true; do
  shopt -s nullglob

  done_files=("${DATA_DIR}"/*.done)
  for done_path in "${done_files[@]}"; do
    base="$(basename "$done_path")"
    [[ "$base" == .* ]] && continue

    # Rename FIRST: remove the .done suffix
    data_path="${done_path%.done}"
    stem="$(basename "$data_path")"

    if [[ -e "$data_path" ]]; then
      echo "ERROR: cannot rename $done_path -> $data_path (target exists). Quarantining trigger."
      mv -f "$done_path" "${done_path}.conflict"
      continue
    fi

    mv -f "$done_path" "$data_path"
    echo "Renamed trigger/data: $done_path -> $data_path"

    # ALWAYS ingest chromsizes before each file
    ingest_chromsizes_every_time

    # Determine ingest params from the renamed filename
    uid=""
    name=""
    filetype=""
    datatype=""

    if [[ "$stem" == *.mcool ]]; then
      core="${stem%.mcool}"
      uid="$(sanitize_uid "$core")"
      name="$core"
      filetype="cooler"
      datatype="matrix"
    elif [[ "$stem" == *.bigWig || "$stem" == *.bigwig ]]; then
      core="${stem%.bigWig}"
      core="${core%.bigwig}"
      uid="$(sanitize_uid "$core")"
      name="$core"
      filetype="bigwig"
      datatype="vector"
    else
      echo "Skipping unsupported file type: $data_path"
      mv -f "$data_path" "${data_path}.unsupported"
      continue
    fi

    echo "Computed uid=$uid name=$name filetype=$filetype datatype=$datatype coordSystem=$COORD_SYSTEM"

    # Idempotent: always delete then ingest
    delete_tileset_always "$uid"

    echo "Ingesting: file=$data_path uid=$uid name=$name"
    python higlass-server/manage.py ingest_tileset \
      --filename "$data_path" \
      --filetype "$filetype" \
      --datatype "$datatype" \
      --coordSystem "$COORD_SYSTEM" \
      --uid "$uid" \
      --name "$name"

    echo "Ingest done for: $data_path"
  done

  shopt -u nullglob
  sleep 2
done