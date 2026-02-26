import { HIGLASS_SERVER } from "../config";

function baseView(tilesetUid) {
  return {
    editable: true,
    trackSourceServers: [HIGLASS_SERVER, "https://higlass.io/api/v1"],
    views: [
      {
        uid: "view-1",
        layout: { w: 12, h: 12, x: 0, y: 0 },
        tracks: {
          top: [],
          center: [
            {
              type: "heatmap",
              uid: "heatmap-track-1",
              tilesetUid,
              server: HIGLASS_SERVER,
              options: {
                labelPosition: "bottomRight",
                labelText: tilesetUid,
                colorRange: [
                  "white",
                  "rgba(245, 166, 35, 1.0)",
                  "rgba(208, 2, 27, 1.0)",
                  "black",
                ],
                maxZoom: null,
              },
            },
          ],
        },
      },
    ],
  };
}

export function buildHeatmapViewConfig(tilesetUid) {
  return baseView(tilesetUid);
}

export function buildHeatmapWithTracksViewConfig(tilesetUid) {
  const config = baseView(tilesetUid);

  config.views[0].tracks.top = [
    {
      type: "line",
      uid: "pA",
      height: 40,
      tilesetUid: "a_track",
      server: HIGLASS_SERVER,
      options: { label: "P(A)", valueScaleMin: 0, valueScaleMax: 1 },
    },
    {
      type: "line",
      uid: "pC",
      height: 40,
      tilesetUid: "c_track",
      server: HIGLASS_SERVER,
      options: { label: "P(C)", valueScaleMin: 0, valueScaleMax: 1 },
    },
    {
      type: "line",
      uid: "pG",
      height: 40,
      tilesetUid: "g_track",
      server: HIGLASS_SERVER,
      options: { label: "P(G)", valueScaleMin: 0, valueScaleMax: 1 },
    },
    {
      type: "line",
      uid: "pT",
      height: 40,
      tilesetUid: "t_track",
      server: HIGLASS_SERVER,
      options: { label: "P(T)", valueScaleMin: 0, valueScaleMax: 1 },
    },
  ];

  return config;
}