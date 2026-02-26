import React, { useEffect, useRef } from "react";

export default function LogoOverlay({ hgApiRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const api = hgApiRef.current;
    if (!api) return;

    const viewUid = api.getViewConfig()?.views?.[0]?.uid;
    if (!viewUid) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const draw = () => {
      const loc = api.getLocation(viewUid);
      if (!loc?.xDomain || !loc?.xRange) return;

      let [x0, x1] = loc.xDomain;
      const [px0, px1] = loc.xRange;

      if (x0 > x1) [x0, x1] = [x1, x0];

      const widthPx = Math.max(1, px1 - px0);
      const unitsPerPx = (x1 - x0) / widthPx;

      // only render when zoomed in enough
      if (unitsPerPx > 5) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const heightPx = 80;

      // keep canvas sized to the viewport
      if (canvas.width !== widthPx) canvas.width = widthPx;
      if (canvas.height !== heightPx) canvas.height = heightPx;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const pxPerUnit = widthPx / (x1 - x0);

      const start = Math.ceil(x0);
      const end = Math.floor(x1);

      ctx.font = "bold 14px monospace";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "green";

      for (let i = start; i <= end; i++) {
        const prob = Math.random(); // random probability
        const xPx = (i - x0) * pxPerUnit;

        // scale letter height by prob
        ctx.save();
        ctx.translate(xPx, heightPx);
        ctx.scale(1, prob);
        ctx.fillText("A", 0, 0);
        ctx.restore();
      }
    };

    const id = window.setInterval(draw, 250);
    return () => window.clearInterval(id);
  }, [hgApiRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        pointerEvents: "none",
      }}
    />
  );
}