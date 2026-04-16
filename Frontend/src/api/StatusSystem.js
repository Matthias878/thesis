import { useEffect, useState } from "react";
import { API_BACKEND, HIGLASS_SERVER } from "../config";

const DEFAULT_API_STATUS = {stage: "down", message: "api backend not available",};
const DEFAULT_HIGLASS_STATUS = {reachable: false, message: "not reachable",};

export default function useBackendStatus({apiBaseUrl = API_BACKEND, higlassBaseUrl = HIGLASS_SERVER, pollMs = 500, timeoutMs = 1500, enabled = true,} = {}) {
  const [apiBackend, setApiBackend] = useState(DEFAULT_API_STATUS);
  const [higlassServer, setHiglassServer] = useState(DEFAULT_HIGLASS_STATUS);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let inFlight = false;

    const fetchWithTimeout = async (url) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        return res;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;

      try {
        const apiBase = String(apiBaseUrl).replace(/\/$/, "");
        const higlassBase = String(higlassBaseUrl).replace(/\/$/, "");

        const [apiRes, higlassRes] = await Promise.allSettled([
          fetchWithTimeout(`${apiBase}/status`),
          fetchWithTimeout(`${higlassBase}/tilesets/?limit=1`),
        ]);

        if (!active) return;

        if (apiRes.status === "fulfilled") {
          try {
            const { state = "idle" } = await apiRes.value.json();
            setApiBackend({
              stage: state === "idle" ? "idle" : "busy",
              message: state,
            });
          } catch {
            setApiBackend(DEFAULT_API_STATUS);
          }
        } else {
          setApiBackend(DEFAULT_API_STATUS);
        }

        setHiglassServer(
          higlassRes.status === "fulfilled"
            ? { reachable: true, message: "reachable" }
            : DEFAULT_HIGLASS_STATUS
        );
      } finally {
        inFlight = false;
      }
    };

    tick();
    const id = setInterval(tick, pollMs);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [apiBaseUrl, higlassBaseUrl, pollMs, timeoutMs, enabled]);

  return {
    apiBackend: {
      ...apiBackend,
      dotColor:
        apiBackend.stage === "down"
          ? "#ff3b3b"
          : apiBackend.stage === "idle"
          ? "#2ee66b"
          : "#ff9f1a",
      text:
        apiBackend.stage === "down"
          ? "api backend not available"
          : apiBackend.message,
    },
    higlassServer: {
      ...higlassServer,
      dotColor: higlassServer.reachable ? "#2ee66b" : "#ff3b3b",
      text: `HiGlass server: ${
        higlassServer.reachable ? "reachable" : "not reachable"
      }`,
    },
  };
}