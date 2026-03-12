#!/usr/bin/env bash
set -euo pipefail

echo "SHELL=$0  BASH_VERSION=${BASH_VERSION:-no}"

DATA_DIR=/data
COORD_SYSTEM="testchromome"
CHROMSIZES_TSV="$DATA_DIR/$COORD_SYSTEM.chrom.sizes"
CHROMSIZES_UID="chromsizes__${COORD_SYSTEM}"

wait_for_higlass() {
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

wait_for_chromsizes() {
  echo "Waiting for chromsizes file: $CHROMSIZES_TSV"
  for i in {1..300}; do
    if [[ -s "$CHROMSIZES_TSV" ]]; then
      echo "Chromsizes found (attempt $i)"
      return 0
    fi
    echo "attempt $i: chromsizes not ready yet"
    sleep 1
  done
  echo "ERROR: chromsizes file never appeared: $CHROMSIZES_TSV"
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

validate_chromsizes_file() {
  echo "Validating chromsizes file: $CHROMSIZES_TSV"
  python - <<'PY'
import sys
from pathlib import Path

path = Path("/data/testchromome.chrom.sizes")

if not path.exists():
    print(f"ERROR: chromsizes file missing: {path}")
    sys.exit(1)

seen = {}
with path.open() as f:
    for lineno, line in enumerate(f, 1):
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) != 2:
            print(f"ERROR: invalid chromsizes line {lineno}: {line!r}")
            sys.exit(1)
        chrom, size = parts
        try:
            size = int(size)
        except ValueError:
            print(f"ERROR: invalid size on line {lino}: {line!r}")
            sys.exit(1)
        if size <= 0:
            print(f"ERROR: non-positive size on line {lineno}: {line!r}")
            sys.exit(1)
        if chrom in seen and seen[chrom] != size:
            print(f"ERROR: duplicate chromosome with conflicting size: {chrom}")
            sys.exit(1)
        seen[chrom] = size

if not seen:
    print("ERROR: chromsizes file is empty")
    sys.exit(1)

print("Chromsizes validation OK:", seen)
PY
}

ingest_chromsizes_once() {
  [[ -f "$CHROMSIZES_TSV" ]] || {
    echo "ERROR: chromsizes missing: $CHROMSIZES_TSV"
    return 1
  }

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

chromsizes_matches_bigwig() {
  local path="$1"

  python - "$path" "$CHROMSIZES_TSV" <<'PY'
import sys
import pyBigWig

bw_path = sys.argv[1]
cs_path = sys.argv[2]

bw = pyBigWig.open(bw_path)
bw_chroms = bw.chroms()
bw.close()

cs_chroms = {}
with open(cs_path) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        chrom, size = line.split()[:2]
        cs_chroms[chrom] = int(size)

if bw_chroms != cs_chroms:
    print("ERROR: bigWig/chromsizes mismatch")
    print("bigWig chroms:", bw_chroms)
    print("chromsizes :", cs_chroms)
    sys.exit(2)

print("bigWig/chromsizes match OK")
PY
}

quarantine_file() {
  local path="$1"
  local suffix="$2"
  local target="${path}.${suffix}"
  echo "Quarantining: $path -> $target"
  mv -f "$path" "$target"
}

ingest_file() {
  local path="$1"
  local stem core uid name filetype datatype

  stem="$(basename "$path")"

  case "$stem" in
    *.multires.mv5)
      core="${stem%.multires.mv5}"
      filetype="multivec"
      datatype="multivec"
      ;;
    *.mcool)
      core="${stem%.mcool}"
      filetype="cooler"
      datatype="matrix"
      ;;
    *.bigWig|*.bigwig)
      core="${stem%.bigWig}"
      core="${core%.bigwig}"
      filetype="bigwig"
      datatype="vector"
      ;;
    *)
      echo "Skipping unsupported file type: $path"
      quarantine_file "$path" "unsupported"
      return 0
      ;;
  esac

  uid="$(sanitize_uid "$core")"
  name="$core"

  echo "Computed uid=$uid name=$name filetype=$filetype datatype=$datatype coordSystem=$COORD_SYSTEM"

  if [[ "$filetype" == "bigwig" ]]; then
    echo "Validating bigWig chromsizes match for: $path"
    if ! chromsizes_matches_bigwig "$path"; then
      echo "ERROR: bigWig does not match chromsizes tileset for coordSystem=$COORD_SYSTEM"
      quarantine_file "$path" "failed"
      return 1
    fi
  fi

  delete_tileset "$uid"
  echo "Ingesting: file=$path uid=$uid name=$name"

  if python higlass-server/manage.py ingest_tileset \
    --filename "$path" \
    --filetype "$filetype" \
    --datatype "$datatype" \
    --coordSystem "$COORD_SYSTEM" \
    --uid "$uid" \
    --name "$name"; then
    echo "Ingest done for: $path"
    return 0
  else
    echo "ERROR: ingest failed for: $path"
    quarantine_file "$path" "failed"
    return 1
  fi
}

watch_loop() {
  echo "Watching $DATA_DIR for *.done (rename first, then ingest, then mark uploaded) ..."
  while true; do
    shopt -s nullglob
    for done_path in "$DATA_DIR"/*.done; do
      [[ "$(basename "$done_path")" == .* ]] && continue

      local data_path="${done_path%.done}"

      if [[ -e "$data_path" ]]; then
        echo "ERROR: cannot rename $done_path -> $data_path (target exists). Quarantining trigger."
        quarantine_file "$done_path" "conflict"
        continue
      fi

      mv -f "$done_path" "$data_path"
      echo "Renamed trigger/data: $done_path -> $data_path"

      if ingest_file "$data_path"; then
        local uploaded_path="${done_path}.uploaded"
        echo "Marking upload complete: $data_path -> $uploaded_path"
        mv -f "$data_path" "$uploaded_path"
      fi
    done
    shopt -u nullglob
    sleep 1
  done
}

main() {
  wait_for_chromsizes
  validate_chromsizes_file
  wait_for_higlass
  migrate_locked
  ingest_chromsizes_once
  watch_loop
}

main "$@"