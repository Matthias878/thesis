import { API_BACKEND, HIGLASS_SERVER } from "../config";
import { baseUrl } from "../utils/appUtils";

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
  const baseHasApiV1 = /\/api\/v1$/i.test(rawBase);
  const baseRoot = baseHasApiV1 ? rawBase.replace(/\/api\/v1$/i, "") : rawBase;

  const apiPrefix = "/api/v1";
  const firstUrl = `${baseRoot}${apiPrefix}/tilesets/?limit=${pageSize}&offset=0`;

  let url = firstUrl;

  const all = [];
  const seen = new Set();

  while (url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`fetchAllTilesets failed (${res.status}): ${txt || res.statusText}`);
    }

    const data = await res.json();
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
    if (url && url.startsWith("/")) url = `${baseRoot}${url}`;
  }

  return all;
}

export async function waitForHiGlassTilesetInfo(
  uids,
  {
    addLog,
    timeoutMs = 60000,
    intervalMs = 1000,
    onReady,
  } = {},
) {
  const want = Array.isArray(uids) ? uids : [uids].filter(Boolean);
  if (want.length === 0) {
    addLog?.("waitForHiGlassTilesetInfo skipped: no uids requested");
    return true;
  }

  const base = baseUrl(HIGLASS_SERVER);
  const url = `${base}/tilesets/?limit=1000`;
  const start = Date.now();

  addLog?.(`waitForHiGlassTilesetInfo start: want=[${want.join(", ")}] url=${url}`);

  let attempt = 0;

  while (Date.now() - start < timeoutMs) {
    attempt += 1;

    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        credentials: "omit",
      });

      const text = await res.text();
      const snippet = text.slice(0, 200).replace(/\s+/g, " ");

      addLog?.(`poll ${attempt}: status=${res.status} ok=${res.ok} body="${snippet}"`);

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        addLog?.(`poll ${attempt}: JSON parse failed (${String(e)})`);
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }

      const have = new Set((data?.results ?? []).map((t) => t?.uuid ?? t?.uid).filter(Boolean));
      const missing = want.filter((u) => !have.has(u));

      addLog?.(`poll ${attempt}: results=${data?.results?.length ?? 0} missing=[${missing.join(", ")}]`);

      if (missing.length === 0) {
        addLog?.("tilesets ready");
        if (typeof onReady === "function") onReady();
        return true;
      }
    } catch (err) {
      addLog?.(`poll ${attempt}: fetch error: ${String(err)}`);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  addLog?.(`waitForHiGlassTilesetInfo TIMEOUT: want=[${want.join(", ")}]`);
  return false;
}