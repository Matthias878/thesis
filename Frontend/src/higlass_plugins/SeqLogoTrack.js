const SeqLogoTrack = function SeqLogoTrack(HGC, ...args) {

  const { PIXI } = HGC.libraries;
  const BaseTrack =
    HGC.tracks.HorizontalTiled1DPixiTrack ||
    HGC.tracks.Tiled1DPixiTrack ||
    HGC.tracks.BarTrack ||
    HGC.tracks.PixiTrack;


  class SeqLogoTrackClass extends BaseTrack {
    constructor(context, options) {
      super(context, options);

      this._textLayer = new PIXI.Container();
      this.pMain?.addChild(this._textLayer);

      this._textPool = [];
      this._activeTexts = [];

      const style = (fill) =>
        new PIXI.TextStyle({
          fontFamily: 'Arial Black, Arial, sans-serif',
          fontSize: 40,
          fill,
          align: 'center',
          fontWeight: '900',
          trim: true,
        });

      this._styles = {
        A: style(0x00aa00),
        C: style(0x0000aa),
        G: style(0xff9900),
        T: style(0xaa0000),
      };
    }

    _getVisibleFetchedTiles() {
      try {
        const tiles = this.visibleAndFetchedTiles?.();
        if (Array.isArray(tiles)) return tiles;
      } catch {}

      const src = this.fetchedTiles || this.tiles || this.visibleTiles || this._tiles;
      if (!src) return [];
      if (src instanceof Map) return [...src.values()];
      return Array.isArray(src) ? src : Object.values(src);
    }

    _getTileGenomeSpan(tile) {
      const td = tile?.tileData || tile || {};

      if (Number.isFinite(td.minX) && Number.isFinite(td.maxX)) {
        return [td.minX, td.maxX];
      }

      if (Number.isFinite(td.min_pos?.[0]) && Number.isFinite(td.max_pos?.[0])) {
        return [td.min_pos[0], td.max_pos[0]];
      }

      if (
        Number.isFinite(td.min_position) &&
        Number.isFinite(td.max_position)
      ) {
        return [td.min_position, td.max_position];
      }

      const id = tile?.tileId || tile?.id || td.tileId || td.id;
      const tsInfo = this.tilesetInfo || this.dataConfig || this.options?.tilesetInfo;
      if (typeof id !== 'string' || !id.includes('.')) return null;

      const [z, x] = id.split('.').map(Number);
      if (!Number.isFinite(z) || !Number.isFinite(x)) return null;

      if (Number.isFinite(tsInfo?.max_width)) {
        const origin = Number.isFinite(tsInfo?.min_pos?.[0]) ? tsInfo.min_pos[0] : 0;
        const width = tsInfo.max_width / 2 ** z;
        const start = origin + x * width;
        return [start, start + width];
      }

      if (Number.isFinite(tsInfo?.min_pos?.[0]) && Number.isFinite(tsInfo?.max_pos?.[0])) {
        const width = (tsInfo.max_pos[0] - tsInfo.min_pos[0]) / 2 ** z;
        const start = tsInfo.min_pos[0] + x * width;
        return [start, start + width];
      }

      return null;
    }

    _releaseTextSprites() {
      for (const text of this._activeTexts) {
        text.visible = false;
        text.parent?.removeChild(text);
        this._textPool.push(text);
      }
      this._activeTexts.length = 0;
    }

    _acquireTextSprite() {
      const text = this._textPool.pop() || new PIXI.Text('A', this._styles.A);
      text.resolution = 2;
      text.visible = true;
      text.alpha = 1;
      text.x = 0;
      text.y = 0;
      text.scale.set(1);
      text.anchor?.set?.(0, 0);

      this._textLayer.addChild(text);
      this._activeTexts.push(text);
      return text;
    }

    draw(...args) {
      super.draw?.(...args);
      if (!this._textLayer) return;

      const xScale = this._xScale || this.xScale;
      if (typeof xScale !== 'function') {
        this._releaseTextSprites();
        return;
      }

      this._releaseTextSprites();

      const tiles = this._getVisibleFetchedTiles();
      if (!tiles.length) return;

      const viewWidth = this.dimensions?.[0] > 0 ? this.dimensions[0] : 300;
      const height = this.dimensions?.[1] > 0 ? this.dimensions[1] : 80;
      const xOffset = Number.isFinite(this.position?.[0]) ? this.position[0] : 0;
      const yOffset = Number.isFinite(this.position?.[1]) ? this.position[1] : 0;
      const drawableHeight = Math.max(1, height - 1);
      const drawableBottom = yOffset + drawableHeight;

      let domainStart, domainEnd;
      try {
        [domainStart, domainEnd] = xScale.domain?.() || [];
      } catch {}

      const bases = ['A', 'C', 'G', 'T'];

      for (const tile of tiles) {
        const td = tile?.tileData || tile;
        const dense = td?.dense;
        const shape = td?.shape;
        if (!dense?.length) continue;

        const rows = Number.isFinite(shape?.[0]) ? shape[0] : 4;
        const padded = Number.isFinite(shape?.[1]) ? shape[1] : dense.length / 4;

        if (rows !== 4 || !Number.isFinite(padded) || padded <= 0 || dense.length < rows * padded) {
          continue;
        }

        const span = this._getTileGenomeSpan(tile);
        if (!span) continue;

        const [tileStart, tileEnd] = span;
        const positions = Math.min(Math.max(0, Math.round(tileEnd - tileStart)), padded);
        if (positions <= 0) continue;

        const startIdx = Number.isFinite(domainStart)
          ? Math.max(0, Math.floor(domainStart - tileStart))
          : 0;
        const endIdx = Number.isFinite(domainEnd)
          ? Math.min(positions, Math.ceil(domainEnd - tileStart))
          : positions;

        for (let i = startIdx; i < endIdx; i++) {
          const vals = [
            dense[i],
            dense[padded + i],
            dense[2 * padded + i],
            dense[3 * padded + i],
          ];

          let maxIdx = 0;
          for (let j = 1; j < 4; j++) {
            if ((vals[j] ?? -Infinity) > (vals[maxIdx] ?? -Infinity)) maxIdx = j;
          }

          const maxVal = vals[maxIdx];
          if (!Number.isFinite(maxVal) || maxVal <= 0) continue;

          let x0 = xOffset + xScale(tileStart + i);
          let x1 = xOffset + xScale(tileStart + i + 1);
          if (!Number.isFinite(x0) || !Number.isFinite(x1)) continue;
          if (x1 < x0) [x0, x1] = [x1, x0];
          if (x1 < 0 || x0 > viewWidth) continue;

          const clippedX0 = Math.max(0, x0);
          const clippedX1 = Math.min(viewWidth, x1);
          const colW = clippedX1 - clippedX0;
          if (colW <= 0) continue;

          const text = this._acquireTextSprite();
          const base = bases[maxIdx];
          const letterH = Math.max(1, Math.min(1, maxVal) * drawableHeight);

          text.text = base;
          text.style = this._styles[base];
          text.updateText?.(true);

          const bounds = text.getLocalBounds();
          const nativeW = Math.max(1, bounds.width);
          const nativeH = Math.max(1, bounds.height);
          const scaleX = colW / nativeW;
          const scaleY = letterH / nativeH;
          const centerX = clippedX0 + colW / 2;

          text.scale.set(scaleX, scaleY);
          text.x = centerX - (bounds.x + bounds.width / 2) * scaleX;
          text.y = drawableBottom - (bounds.y + bounds.height) * scaleY;
        }
      }
    }

    rerender(...args) {
      super.rerender?.(...args);
      this.draw(...args);
    }

    zoomed(...args) {
      super.zoomed?.(...args);
      this.draw(...args);
    }

    moved(...args) {
      super.moved?.(...args);
      this.draw(...args);
    }

    destroy() {
      try {
        this._releaseTextSprites();
        for (const text of this._textPool) text.destroy();
        this._textPool.length = 0;

        if (this._textLayer) {
          this.pMain?.removeChild(this._textLayer);
          this._textLayer.destroy({ children: false });
          this._textLayer = null;
        }
      } finally {
        super.destroy?.();
      }
    }
  }

  return new SeqLogoTrackClass(...args);
};

SeqLogoTrack.config = {
  type: 'seqlogo',
  orientation: '1d-horizontal',
  name: 'SeqLogo',
  thumbnail: null,
  datatype: ['vector'],
  local: false,
  availableOptions: [],
  defaultOptions: {},
};

export default SeqLogoTrack;