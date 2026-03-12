import { API_BACKEND } from "../config";
import { HIGLASS_SERVER } from "../config";

async function readErrorBody(r) {
  return await r.text().catch(() => "");
}

export async function convertNpy(addLog) {
  addLog("convert npy called");
  const r = await fetch(`${API_BACKEND}/convert_npy`, { method: "POST" });
  if (!r.ok) throw new Error(`convert failed: ${r.status} ${r.statusText}${await readErrorBody(r)}`);
  return await r.json();
}

export async function convertPt(addLog) {
  addLog("convert pt called");
  const r = await fetch(`${API_BACKEND}/convert_pt`, { method: "POST" });
  if (!r.ok) throw new Error(`convert failed: ${r.status} ${r.statusText}${await readErrorBody(r)}`);
  return await r.json();
}

export async function reupload(addLog) {
  addLog("reupload called");
  const r = await fetch(`${API_BACKEND}/reupload`, { method: "POST" });
  if (!r.ok) throw new Error(`reupload failed: ${r.status} ${r.statusText}${await readErrorBody(r)}`);
  return await r.json();
}

export async function fetchMcoolFiles(addLog) {
  const r = await fetch(`${API_BACKEND}/mcool-files`);
  if (!r.ok) throw new Error(`mcool-files failed: ${r.status} ${r.statusText}${await readErrorBody(r)}`);
  const j = await r.json();
  return Array.isArray(j.all) ? j.all : [];
}

export async function uploadFileWithNewUid(file, addLog) {
  const form = new FormData();
  form.append("file", file);

  const r = await fetch(`${API_BACKEND}/new_file`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`upload failed: ${r.status} ${r.statusText}${await readErrorBody(r)}`);
  return await r.json().catch(() => ({}));
}

export async function uploadNxknpyFile(file, addLog) {
  const form = new FormData();
  form.append("file", file);

  const r = await fetch(`${API_BACKEND}/upload_nxk_npy`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`upload failed: ${r.status} ${r.statusText}${await readErrorBody(r)}`);
  return await r.json().catch(() => ({}));
}

export async function call_Matrix_bigwig(addLog) {

  fetch(`${API_BACKEND}/upload_nxk_npy_bigwig`, { method: "GET" });
  return;
}

export async function uploadlogoTrackFile(file, addLog) {
  const form = new FormData();
  form.append("file", file);

  const r = await fetch(`${API_BACKEND}/upload_logo_track`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`upload failed: ${r.status} ${r.statusText}${await readErrorBody(r)}`);
  return await r.json().catch(() => ({}));
}

export async function fetchAllTilesets(addLog, { pageSize = 1000 } = {}) {
  const rawBase = String(HIGLASS_SERVER).replace(/\/+$/, "");

  // If base already ends with /api/v1, don't append it again.
  const baseHasApiV1 = /\/api\/v1$/i.test(rawBase);
  const baseRoot = baseHasApiV1 ? rawBase.replace(/\/api\/v1$/i, "") : rawBase;

  // Build the first page URL consistently:
  const apiPrefix = "/api/v1";
  const firstUrl = `${baseRoot}${apiPrefix}/tilesets/?limit=${pageSize}&offset=0`;

  let url = firstUrl;

  const all = [];
  const seen = new Set();

  // IMPORTANT: don't log every GET here (polling would spam)
  // addLog?.(`fetchAllTilesets: GET ${url}`);

  while (url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`fetchAllTilesets failed (${res.status}): ${txt || res.statusText}`);
    }

    const data = await res.json();

    // HiGlass typically responds with { count, next, previous, results: [...] }
    const results = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];

    for (const t of results) {
      const uuid = t?.uuid || t?.tilesetUid || t?.uid;
      if (!uuid || seen.has(uuid)) continue;
      seen.add(uuid);
      all.push({
        uuid,
        name: t?.name ?? "",
        datatype: t?.datatype ?? t?.data_type ?? "",
        raw: t,
      });
    }

    url = data?.next || null;

    // Some servers return relative next URLs
    if (url && url.startsWith("/")) url = `${baseRoot}${url}`;
  }

  // Don't log "loaded N" by default; leave it to the caller to decide.
  // addLog?.(`fetchAllTilesets: loaded ${all.length} tilesets`);

  return all;
}