import { API_BACKEND, HIGLASS_SERVER } from "../config";
import { baseUrl } from "../utils/appUtils";

async function readErrorBody(r) {
  return await r.text().catch(() => "");
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


export async function uploadZipFile(file, addLog) {
  const form = new FormData();
  form.append("file", file);

  const r = await fetch(`${API_BACKEND}/upload_zip_file`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`upload failed: ${r.status} ${r.statusText}${await readErrorBody(r)}`);
  return await r.json().catch(() => ({}));
}

