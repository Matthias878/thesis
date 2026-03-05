// src/utils/appUtils.js

// normalize base URL: remove trailing slash
export const baseUrl = (s) => String(s).replace(/\/$/, "");

// async timing helper
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// stringify values safely for logging / UI
export const cellValue = (v) =>
  v instanceof Error ? `Error: ${v.message}\n${v.stack ?? ""}` : v == null ? String(v) : String(v);

// poll helper: repeatedly call `check()` until it returns truthy or timeout hits
export async function waitFor(check, { timeoutMs = 60000, intervalMs = 500 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await check()) return true;
    } catch {
      // suppress; caller logs
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(intervalMs);
  }
  return false;
}

// try different keys returned by backend for tileset ID
export const extractUuid = (j) => j?.uuid || j?.tilesetUid || j?.uid || "";