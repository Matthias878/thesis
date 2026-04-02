import { useEffect, useMemo, useState } from "react";//unnecessary, remove?

const DEFAULT_BASE_URL =
  import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:8000";

const DEFAULT_STATUS = {
  level: "down",
  text: "backend not available",
  raw: null,
};

const IDLE_HINTS = [ "idle", "done", "finished", "converted", "saved", "ready", "output ready", "success", "reupload should be imminent",
];

const BUSY_HINTS = [ "running", "starting", "converting", "uploading", "locating", "renaming", "finalizing", "received new file", "saving upload", "dimension_reducer", "pt->mcool", "npy->mcool",
];

export function getBackendDotColor(backend) {
  if (backend?.level === "down" || backend?.ok === false) return "#ff3b3b";
  if (backend?.level === "busy") return "#ff9f1a";
  return "#2ee66b";
}

export function getBackendText(backend) {
  return (
    backend?.text ??
    (typeof backend?.ok === "boolean"
      ? backend.ok
        ? "backend ok"
        : "backend down"
      : "backend status: —")
  );
}

export function getPosLeftRight(pos) {
  return {
    posLeft: pos?.i ?? (typeof pos?.x1 === "number" ? Math.round(pos.x1) : null),
    posRight:
      pos?.j ?? (typeof pos?.x2 === "number" ? Math.round(pos.x2) : null),
  };
}

function classifyBackendStatus(message) {
  const raw = String(message ?? "").trim();

  if (!raw) {
    return {
      level: "idle",
      text: "backend ready (idle)",
      raw,
    };
  }

  const normalized = raw.toLowerCase();

  if (IDLE_HINTS.some((hint) => normalized.includes(hint))) {
    return {
      level: "idle",
      text: `backend ready (idle) — ${raw}`,
      raw,
    };
  }

  if (BUSY_HINTS.some((hint) => normalized.includes(hint))) {
    return {
      level: "busy",
      text: `backend busy — ${raw}`,
      raw,
    };
  }

  return {
    level: "busy",
    text: `backend — ${raw}`,
    raw,
  };
}

async function fetchBackendStatus({ baseUrl, key, timeoutMs }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/status/${key}`, {
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return classifyBackendStatus(data?.status);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function useBackendStatus({
  baseUrl = DEFAULT_BASE_URL,
  key = "current_input",
  pollMs = 1000,
  timeoutMs = 1500,
  enabled = true,
} = {}) {
  const [backend, setBackend] = useState(DEFAULT_STATUS);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    const tick = async () => {
      try {
        const next = await fetchBackendStatus({ baseUrl, key, timeoutMs });
        if (active) setBackend(next);
      } catch {
        if (active) setBackend(DEFAULT_STATUS);
      }
    };

    tick();
    const intervalId = setInterval(tick, pollMs);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [baseUrl, key, pollMs, timeoutMs, enabled]);

  return useMemo(
    () => ({
      ...backend,
      dotColor: getBackendDotColor(backend),
    }),
    [backend]
  );
}