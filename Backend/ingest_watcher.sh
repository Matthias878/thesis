#!/usr/bin/env bash
set -euo pipefail
echo "SHELL=$0  BASH_VERSION=${BASH_VERSION:-no}"

DATA_DIR=/data
COORD_SYSTEM="testchromome"                 # must match exactly
CHROMSIZES_TSV="$DATA_DIR/$COORD_SYSTEM.chrom.sizes"
CHROMSIZES_UID="chromsizes__${COORD_SYSTEM}"

wait_for() {
  echo "Waiting for higlass..."
  for i in {1..360}; do
    if curl -fsS http://higlass:80/ >/dev/null; then
      echo "higlass is up (attempt $i)"
      return 0
    fi
    echo "attempt $i failed"
    sleep 3
  done
  echo "ERROR: higlass never became reachable"
  exit 1
}

migrate_locked() {
  echo "Applying Django migrations (locked with flock)..."
  local lock="$DATA_DIR/.higlass_migrate.lock"
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
  ) 200>"$lock"
}

sanitize_uid() {
  local s="$1"
  s="$(printf '%s' "$s" | tr '[:upper:]' '[:lower:]')"
  s="$(printf '%s' "$s" | sed -E 's/[^a-z0-9_-]+/_/g; s/^_+|_+$//g')"
  s="${s:0:63}"
  [[ -n "$s" ]] || s="tileset"
  printf '%s' "$s"
}

delete_tileset() {
  local uid="$1"
  echo "Deleting tileset uid=$uid if present..."
  python higlass-server/manage.py shell -c "
from tilesets.models import Tileset
qs = Tileset.objects.filter(uuid='${uid}')
print('  found:', qs.count())
qs.delete()
"
}

wait_for_cleanup_outputs() {
  echo "Waiting for cleanup outputs in $DATA_DIR ..."

  for i in {1..300}; do
    # chromsizes must exist and be non-empty
    if [[ -s "$CHROMSIZES_TSV" ]]; then
      # at least one trigger file must exist (can be empty/non-empty, your choice)
      shopt -s nullglob
      local done_files=("$DATA_DIR"/*.done)
      shopt -u nullglob

      if (( ${#done_files[@]} > 0 )); then
        echo "Cleanup outputs found (attempt $i)."
        return 0
      fi
    fi

    echo "attempt $i: not ready yet"
    sleep 1
  done

  echo "ERROR: cleanup outputs never appeared"
  exit 1
}

ingest_chromsizes_once() {
  [[ -f "$CHROMSIZES_TSV" ]] || { echo "ERROR: chromsizes missing: $CHROMSIZES_TSV"; return 1; }

  echo "Checking chromsizes tileset uid=$CHROMSIZES_UID ..."
  local count
  count="$(python higlass-server/manage.py shell -c "
from tilesets.models import Tileset
print(Tileset.objects.filter(uuid='${CHROMSIZES_UID}').count())
")"

  if [[ "$count" != "0" ]]; then
    echo "Chromsizes tileset already present (count=$count). Skipping ingest."
    return 0
  fi

  echo "Chromsizes tileset missing; ingesting: $CHROMSIZES_TSV (uid=$CHROMSIZES_UID coordSystem=$COORD_SYSTEM)"
  python higlass-server/manage.py ingest_tileset \
    --filename "$CHROMSIZES_TSV" \
    --filetype chromsizes-tsv \
    --datatype chromsizes \
    --coordSystem "$COORD_SYSTEM" \
    --uid "$CHROMSIZES_UID" \
    --name "Chromosomes (${COORD_SYSTEM})"
}
ingest_file() {
  local path="$1"
  local stem core uid name filetype datatype

  stem="$(basename "$path")"

  case "$stem" in
    *.multires.mv5)
      core="${stem%.multires.mv5}"
      filetype="multivec"; datatype="multivec"
      ;;
    *.mcool)
      core="${stem%.mcool}"
      filetype="cooler"; datatype="matrix"
      ;;
    *.bigWig|*.bigwig)
      core="${stem%.bigWig}"; core="${core%.bigwig}"
      filetype="bigwig"; datatype="vector"
      ;;
    *)
      echo "Skipping unsupported file type: $path"
      mv -f "$path" "${path}.unsupported"
      return 0
      ;;
  esac

  uid="$(sanitize_uid "$core")"
  name="$core"

  echo "Computed uid=$uid name=$name filetype=$filetype datatype=$datatype coordSystem=$COORD_SYSTEM"
  delete_tileset "$uid"
  echo "Ingesting: file=$path uid=$uid name=$name"
  python higlass-server/manage.py ingest_tileset \
    --filename "$path" \
    --filetype "$filetype" \
    --datatype "$datatype" \
    --coordSystem "$COORD_SYSTEM" \
    --uid "$uid" \
    --name "$name"
  echo "Ingest done for: $path"
}

watch_loop() {
  echo "Watching $DATA_DIR for *.done (rename first, then ingest) ..."
  while true; do
    shopt -s nullglob
    for done_path in "$DATA_DIR"/*.done; do
      [[ "$(basename "$done_path")" == .* ]] && continue

      local data_path="${done_path%.done}"
      if [[ -e "$data_path" ]]; then
        echo "ERROR: cannot rename $done_path -> $data_path (target exists). Quarantining trigger."
        mv -f "$done_path" "${done_path}.conflict"
        continue
      fi

      mv -f "$done_path" "$data_path"
      echo "Renamed trigger/data: $done_path -> $data_path"

      ingest_file "$data_path"
    done
    shopt -u nullglob
    sleep 1
  done
}

wait_for_cleanup_outputs
wait_for
migrate_locked   # or remove migrate as discussed
ingest_chromsizes_once
watch_loop