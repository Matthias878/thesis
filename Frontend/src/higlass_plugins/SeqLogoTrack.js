// src/SeqLogoTrack.js
//
// Debug-friendly HiGlass track scaffold that *stores* incoming bigWig tile data.
// Works with HorizontalTiled1DPixiTrack-style bases by capturing receivedTiles().
//
// After loading, you can inspect in DevTools:
//   window.__SEQLOGO_TRACK__._debug.tileDataById
//   window.__SEQLOGO_TRACK__._debug.tileDataById.get("17.0")
//   window.__SEQLOGO_TRACK__._debug.tileDataById.get("17.0").dense
//const x = this._debug.tileDataById.get("17.0").dense[2]; to get the 3rd value of the dense array for tile "17.0" - but why does each tile have 1024 values? bin size = 1 - tile is a block of positions so first 1024 positions!
//

const SeqLogoTrack = function SeqLogoTrack(HGC, ...args) {
  if (!new.target) {
    throw new Error(
      'Uncaught TypeError: Class constructor cannot be invoked without "new"'
    );
  }

  const { PIXI } = HGC.libraries;

  // Prefer a tiled 1D base if present, otherwise fall back safely.
  const BaseTrack =
    HGC.tracks.HorizontalTiled1DPixiTrack ||
    HGC.tracks.Tiled1DPixiTrack ||
    HGC.tracks.BarTrack ||
    HGC.tracks.PixiTrack;

  if (!BaseTrack) {
    throw new Error("seqlogo: no suitable base track found on HGC.tracks");
  }

  const baseName = BaseTrack?.name || "(anonymous base track)";

  class SeqLogoTrackClass extends BaseTrack {
    constructor(context, options) {
      super(context, options);

      // Keep a graphics object so PIXI container assumptions never break.
      this._g = new PIXI.Graphics();
      if (this.pMain) this.pMain.addChild(this._g);

      // Debug storage (includes internal saved tile data)
      this._debug = {
        baseName,

        // lifecycle args
        lastSetDataArgs: null,
        lastDrawArgs: null,
        lastZoomedArgs: null,
        lastMovedArgs: null,
        lastRerenderArgs: null,

        // incoming tiles
        lastReceivedTilesArgs: null,
        lastReceivedTilesRaw: null,

        // optional hooks
        lastRenderTile: null,

        // internal "what do we currently have" snapshot
        lastTilesSnapshot: null,

        // raw tile objects as received: tileId -> tileObject
        tileMap: new Map(),

        // SAVED bigWig values (copied so they won't mutate):
        // tileId -> { dtype, min_value, max_value, denseLen, dense(Float32Array copy), ... }
        tileDataById: new Map(),
      };

      // Expose the instance for easy DevTools inspection
      window.__SEQLOGO_TRACK__ = this;

      console.log("SeqLogoTrack constructed", { baseName, context, options });
      console.log("SeqLogoTrack instance -> window.__SEQLOGO_TRACK__");
    }

    // ---- Debug helpers ----------------------------------------------------

    _snapshotTiles() {
      const t = this.tiles || this.visibleTiles || this._tiles;
      if (!t) return [];

      try {
        const entries =
          t instanceof Map ? Array.from(t.entries()) : Object.entries(t);

        return entries.slice(0, 20).map(([k, v]) => ({
          key: k,
          hasTileData: !!(v && (v.tileData || v.data || v.dense || v.sparse)),
          vKeys: v && typeof v === "object" ? Object.keys(v).slice(0, 30) : [],
        }));
      } catch (e) {
        return [{ error: String(e) }];
      }
    }

    // ---- HiGlass hooks ----------------------------------------------------

    // Some bases never call setData; keep it anyway.
    setData(...args) {
      this._debug.lastSetDataArgs = args;
      console.log("SeqLogoTrack setData", args);
      if (super.setData) super.setData(...args);
    }

    /**
     * HorizontalTiled1DPixiTrack bigWig data arrives here as:
     *   tiles = { "<tileId>": { dense: Float32Array(1024), min_value, max_value, dtype, ... }, ... }
     *
     * We store:
     *   - raw tile object (tileMap)
     *   - a copied dense array + metadata (tileDataById)
     */
    receivedTiles(tiles, ...rest) {
      this._debug.lastReceivedTilesArgs = [tiles, ...rest];
      this._debug.lastReceivedTilesRaw = tiles;

      const tileIds =
        tiles && typeof tiles === "object" ? Object.keys(tiles) : [];

      console.log("SeqLogoTrack receivedTiles:", {
        tileCount: tileIds.length,
        tileIds: tileIds.slice(0, 20),
        restCount: rest.length,
      });

      for (const id of tileIds) {
        const t = tiles[id];

        // store raw
        this._debug.tileMap.set(id, t);

        // bigWig dense values: copy to make a stable snapshot
        const dense = t?.dense;
        const denseCopy =
          dense && dense.buffer ? new Float32Array(dense) : null;

        const saved = {
          id,
          dtype: t?.dtype ?? null,
          size: t?.size ?? null,
          min_value: t?.min_value ?? null,
          max_value: t?.max_value ?? null,
          denseLen: dense ? dense.length : null,
          dense: denseCopy, // <-- saved internal values
          // include these if present on your tiles (harmless if absent)
          shape: t?.shape ?? null,
        };

        this._debug.tileDataById.set(id, saved);

        // Print a readable preview
        const previewN = 12;
        const preview =
          dense ? Array.from(dense.slice(0, previewN)) : null;

        console.log(`tile ${id} (bigWig) saved:`, {
          dtype: saved.dtype,
          min_value: saved.min_value,
          max_value: saved.max_value,
          denseLen: saved.denseLen,
          densePreview: preview,
          topKeys: t ? Object.keys(t).slice(0, 30) : [],
        });
      }

      if (super.receivedTiles) super.receivedTiles(tiles, ...rest);
    }

    // Often not needed for bigWig debug, but kept safe.
    renderTile(tile) {
      this._debug.lastRenderTile = tile;

      const tileId =
        tile?.tileId ??
        tile?.tile_id ??
        tile?.id ??
        tile?.remoteId ??
        "(unknown tile id)";

      console.log("SeqLogoTrack renderTile:", {
        tileId,
        hasGraphics: !!tile?.graphics,
        tileKeys:
          tile && typeof tile === "object"
            ? Object.keys(tile).slice(0, 40)
            : [],
        tileDataKeys:
          tile?.tileData && typeof tile.tileData === "object"
            ? Object.keys(tile.tileData).slice(0, 40)
            : null,
      });

      if (tile && tile.graphics) tile.graphics.clear();

      if (super.renderTile) super.renderTile(tile);
    }

    draw(...args) {
      this._debug.lastDrawArgs = args;
      console.log("SeqLogoTrack draw args", args);

      // Snapshot what the base track thinks tiles are
      const snap = this._snapshotTiles();
      this._debug.lastTilesSnapshot = snap;
      console.log("SeqLogoTrack tiles snapshot", snap);

      if (this._g) this._g.clear();

      if (super.draw) super.draw(...args);
    }

    rerender(...args) {
      this._debug.lastRerenderArgs = args;
      console.log("SeqLogoTrack rerender args", args);

      this.draw(...args);
      if (super.rerender) super.rerender(...args);
    }

    zoomed(...args) {
      this._debug.lastZoomedArgs = args;
      console.log("SeqLogoTrack zoomed args", args);

      this.draw(...args);
      if (super.zoomed) super.zoomed(...args);
    }

    moved(...args) {
      this._debug.lastMovedArgs = args;
      console.log("SeqLogoTrack moved args", args);

      this.draw(...args);
      if (super.moved) super.moved(...args);
    }

    destroy() {
      console.log("SeqLogoTrack destroy", this._debug);

      try {
        if (this._g) {
          if (this.pMain) this.pMain.removeChild(this._g);
          this._g.destroy(true);
          this._g = null;
        }
      } finally {
        if (super.destroy) super.destroy();
      }
    }
  }

  return new SeqLogoTrackClass(...args);
};

SeqLogoTrack.config = {
  type: "seqlogo",
  orientation: "1d-horizontal",
  name: "SeqLogo (debug + saved bigWig tiles)",
  thumbnail: null,
  datatype: ["vector"], // bigWig in HiGlass is delivered as vector-like 1D quantitative tiles
  local: false,
  availableOptions: [],
  defaultOptions: {},
};

export default SeqLogoTrack;