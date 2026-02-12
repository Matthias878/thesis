#!/usr/bin/env bash

echo "SHELL=$0  BASH_VERSION=${BASH_VERSION:-no}"


set -e

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

# Turn an arbitrary filename into something safe for HiGlass uid/name-ish usage
sanitize_uid() {
  local s="$1"
  # lowercase, keep only [a-z0-9_-], collapse others to "_", trim edges, cap length
  s="$(printf '%s' "$s" | tr '[:upper:]' '[:lower:]')"
  s="$(printf '%s' "$s" | sed -E 's/[^a-z0-9_-]+/_/g; s/^_+|_+$//g')"
  s="${s:0:63}"
  if [ -z "$s" ]; then
    s="tileset"
  fi
  printf '%s' "$s"
}

echo "Watching ${DATA_DIR} for *.mcool.done ..."
while true; do
  shopt -s nullglob
  done_files=("${DATA_DIR}"/*.mcool.done)
  shopt -u nullglob

  for done_path in "${done_files[@]}"; do
    # done_path like /data/foo.mcool.done
    base="$(basename "$done_path")"            # foo.mcool.done
    stem="${base%.done}"                      # foo.mcool
    mcool_path="${DATA_DIR}/${stem}"          # /data/foo.mcool

    # derive uid/name from the core (strip .mcool too)
    core="${stem%.mcool}"                     # foo
    uid="$(sanitize_uid "$core")"
    name="$core"

    echo "Trigger found: $done_path"
    echo "Renaming to:   $mcool_path"
    mv "$done_path" "$mcool_path"

    

    echo "Ingesting: file=$mcool_path uid=$uid name=$name"
    python higlass-server/manage.py ingest_tileset \
      --filename "$mcool_path" \
      --filetype cooler \
      --datatype matrix \
      --uid "$uid" \
      --name "$name"

    echo "Ingest done for: $mcool_path"
  done

  sleep 2
done
