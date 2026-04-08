import { useEffect, useState } from "react";
import { API_BACKEND } from "../config";

const DEFAULT_STATUS = {
  stage: "down",
  message: "backend not available",
};

async function fetchBackendStatus({ baseUrl, timeoutMs }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/status`, {
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const state = (await response.json())?.state || "idle";

    return {
      stage: state === "idle" ? "idle" : "busy",
      message: state,
    };
  } catch {
    return DEFAULT_STATUS;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default function useBackendStatus({
  baseUrl = API_BACKEND,
  pollMs = 500,
  timeoutMs = 1500,
  enabled = true,
} = {}) {
  const [backend, setBackend] = useState(DEFAULT_STATUS);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    const tick = async () => {
      const next = await fetchBackendStatus({ baseUrl, timeoutMs });
      if (active) setBackend(next);
    };

    tick();
    const intervalId = setInterval(tick, pollMs);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [baseUrl, pollMs, timeoutMs, enabled]);

  return {
    ...backend,
    dotColor:
      backend.stage === "down"
        ? "#ff3b3b"
        : backend.stage === "idle"
        ? "#2ee66b"
        : "#ff9f1a",
    text: backend.stage === "down" ? "backend not available" : backend.message,
  };
}