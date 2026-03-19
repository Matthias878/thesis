const SequenceTextTrack = function SequenceTextTrack(HGC, ...args) {
  const { PIXI } = HGC.libraries;
  const BaseTrack = HGC.tracks.PixiTrack;

  class SequenceTextTrackClass extends BaseTrack {
    constructor(context, options) {
      super(context, options);

      this.sequence =
        typeof this.options?.sequence === "string"
          ? this.options.sequence
          : "";

      this.fontSize = Number.isFinite(this.options?.fontSize)
        ? this.options.fontSize
        : 18;

      this.leftPadding = Number.isFinite(this.options?.leftPadding)
        ? this.options.leftPadding
        : 6;

      this.rowOffset = Number.isFinite(this.options?.rowOffset)
        ? this.options.rowOffset
        : 0;

      this._textLayer = new PIXI.Container();
      this.pMain?.addChild(this._textLayer);

      this._textPool = [];
      this._activeTexts = [];

      const style = (fill) =>
        new PIXI.TextStyle({
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: this.fontSize,
          fill,
          align: "left",
          fontWeight: "900",
          trim: true,
        });

      this._styles = {
        A: style(0x00aa00),
        C: style(0x0000aa),
        G: style(0xff9900),
        T: style(0xaa0000),
        N: style(0x666666),
      };
    }

    setSequence(seq) {
      this.sequence = typeof seq === "string" ? seq : "";
      this.draw();
    }

    _releaseTexts() {
      for (const t of this._activeTexts) {
        t.visible = false;
        t.parent?.removeChild(t);
        this._textPool.push(t);
      }
      this._activeTexts.length = 0;
    }

    _acquireText() {
      const t = this._textPool.pop() || new PIXI.Text("A", this._styles.A);
      t.visible = true;
      t.alpha = 1;
      t.x = 0;
      t.y = 0;
      t.scale.set(1, 1);
      t.resolution = 2;

      this._textLayer.addChild(t);
      this._activeTexts.push(t);
      return t;
    }

    _getSequence() {
      return (this.sequence || "").toUpperCase().replace(/[^ACGT]/g, "N");
    }

    draw(...args) {
      super.draw?.(...args);

      if (!this._textLayer) return;

      const yScale = this._yScale || this.yScale;
      if (typeof yScale !== "function") {
        this._releaseTexts();
        return;
      }

      this._releaseTexts();

      const seq = this._getSequence();
      if (!seq.length) return;

      const xOffset = Number.isFinite(this.position?.[0]) ? this.position[0] : 0;
      const yOffset = Number.isFinite(this.position?.[1]) ? this.position[1] : 0;

      const trackHeight =
        this.dimensions?.[1] > 0 ? this.dimensions[1] : 300;

      let domainStart = 0;
      let domainEnd = seq.length;

      try {
        [domainStart, domainEnd] = yScale.domain?.() || [0, seq.length];
      } catch {}

      const start = Math.max(
        0,
        Math.floor(Math.min(domainStart, domainEnd))
      );
      const end = Math.min(
        seq.length + this.rowOffset,
        Math.ceil(Math.max(domainStart, domainEnd))
      );

      for (let row = start; row < end; row++) {
        const seqIndex = row - this.rowOffset;
        if (seqIndex < 0 || seqIndex >= seq.length) continue;

        let y0 = yOffset + yScale(row);
        let y1 = yOffset + yScale(row + 1);

        if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
        if (y1 < y0) [y0, y1] = [y1, y0];

        const clippedY0 = Math.max(yOffset, y0);
        const clippedY1 = Math.min(yOffset + trackHeight, y1);
        const rowH = clippedY1 - clippedY0;

        if (rowH <= 0) continue;
        if (rowH < 1) continue;

        const base = seq[seqIndex] || "N";
        const text = this._acquireText();
        text.text = base;
        text.style = this._styles[base] || this._styles.N;
        text.scale.set(1, 1);
        text.updateText?.(true);

        const bounds = text.getLocalBounds();

        text.x = xOffset + this.leftPadding;
        text.y = clippedY0 + rowH / 2 - (bounds.y + bounds.height / 2);
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

    setPosition(newPosition) {
      super.setPosition?.(newPosition);
      this.draw();
    }

    setDimensions(newDimensions) {
      super.setDimensions?.(newDimensions);
      this.draw();
    }

    destroy() {
      try {
        this._releaseTexts();

        for (const t of this._textPool) t.destroy();
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

  return new SequenceTextTrackClass(...args);
};

SequenceTextTrack.config = {
  type: "sequence-text",
  orientation: "1d-vertical",
  name: "Sequence Text Vertical",
  datatype: ["vector"],
  local: true,
  availableOptions: [],
  defaultOptions: {
    sequence: "",
    fontSize: 18,
    leftPadding: 6,
    rowOffset: 0,
  },
};

export default SequenceTextTrack;