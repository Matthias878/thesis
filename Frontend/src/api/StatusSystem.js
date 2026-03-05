import { useEffect, useState } from "react";

/**
 * Polls backend status endpoint and returns:
 * { level: "down"|"idle"|"busy", text: string, raw: string|null }
 */
export function useBackendStatus({
  baseUrl = import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:8000",
  key = "current_input",
  pollMs = 1000,
  timeoutMs = 1500,
  enabled = true, 
} = {}) {
  const [backend, setBackend] = useState({
    level: "down",
    text: "backend not available",
    raw: null,
  });

  useEffect(() => {
    if (!enabled) return; 

    let alive = true;
    let timer = null;

    const classify = (msg) => {
      const s = String(msg ?? "").trim();
      if (!s) return { level: "idle", text: "backend ready (idle)", raw: s };

      const t = s.toLowerCase();

      const idleHints = [
        "idle",
        "done",
        "finished",
        "converted",
        "saved",
        "ready",
        "output ready",
        "success",
        "reupload should be imminent",
      ];

      const busyHints = [
        "running",
        "starting",
        "converting",
        "uploading",
        "locating",
        "renaming",
        "finalizing",
        "received new file",
        "saving upload",
        "dimension_reducer",
        "pt->mcool",
        "npy->mcool",
      ];

      if (idleHints.some((h) => t.includes(h))) {
        return { level: "idle", text: `backend ready (idle) — ${s}`, raw: s };
      }
      if (busyHints.some((h) => t.includes(h))) {
        return { level: "busy", text: `backend busy — ${s}`, raw: s };
      }

      return { level: "busy", text: `backend — ${s}`, raw: s };
    };

    const tick = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const r = await fetch(`${baseUrl}/status/${key}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);

        const j = await r.json(); 

        if (!alive) return;
        setBackend(classify(j?.status));
      } catch {
        if (!alive) return;
        setBackend({ level: "down", text: "backend not available", raw: null });
      } finally {
        clearTimeout(timeout);
      }
    };

    tick();
    timer = setInterval(tick, pollMs);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [baseUrl, key, pollMs, timeoutMs, enabled]); 

  return backend;
}