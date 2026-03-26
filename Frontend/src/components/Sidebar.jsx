import { useEffect, useMemo, useRef, useState } from "react";
import { useUploads } from "../api/useUploads";
import { sidebar, divider, sectionTitle, select, selectOption, backendRowInStatus, backendDotSmall, backendTextEllipsis, hoverBlock, hoverLine, button, sectionGrid8, sectionGrid10, wrapRow, consoleBox, consoleWrap, sidebarScrollHiddenCss, uploadButton,
} from "../styles/appStyles";

const asArray = (v) => (Array.isArray(v) ? v : []);
const text = (v) =>
  v instanceof Error ? `Error: ${v.message}` : v == null ? "—" : String(v);
const pair = (a, b) => `${a ?? "—"},${b ?? "—"}`;
const currentLabel = (label, value, prefix = false) =>
  value ? `${prefix ? "Current " : "current "}${label}: ${value}` : "empty";

const formatRelativePosition = (d) => (d ? pair(d.cellX, d.cellY) : "—");
const formatAbsolutePosition = (d) =>
  !d
    ? "—"
    : d.absoluteStart != null || d.absoluteEnd != null
      ? pair(d.absoluteStart, d.absoluteEnd)
      : d.absoluteCoordinateBase != null
        ? pair(d.absoluteCoordinateBase + (d.cellX ?? 0), d.absoluteCoordinateBase + (d.cellY ?? 0))
        : "—";

const formatDisplayLine = (d) =>
  d
    ? `value=${text(d.value)} · relative=${formatRelativePosition(d)} · absolute=${formatAbsolutePosition(d)}`
    : "—";

function FilePicker({ file, setFile, busy, accept }) {
  const inputRef = useRef(null);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "center", width: "100%" }}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={busy}
        style={{ display: "none" }}
        onChange={({ target }) => setFile(target.files?.[0] ?? null)}
      />
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} style={uploadButton(busy)}>
        Browse
      </button>
      <div
        style={{
          minWidth: 0,
          padding: "8px 10px",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          color: file ? "white" : "rgba(255,255,255,0.65)",
          background: "rgba(255,255,255,0.04)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={file?.name || "No file selected"}
      >
        {file?.name || "No file selected"}
      </div>
    </div>
  );
}

function FileUpload({ file, setFile, onUpload, busy, accept, buttonText = "Upload", items, value = "", onSelect, emptyText = "empty", selectTitle = "", getValue = (x) => x, getLabel = (x) => String(x ?? ""),
}) {
  const hasDropdown = items && onSelect;

  return (
    <div style={sectionGrid10}>
      <FilePicker file={file} setFile={setFile} busy={busy} accept={accept} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: hasDropdown ? "1fr 1fr" : "1fr",
          gap: 8,
          width: "100%",
        }}
      >
        <button
          type="button"
          onClick={onUpload}
          disabled={!file || busy}
          style={uploadButton(!file || busy)}
          title={!file ? "Please select a file first" : ""}
        >
          {busy ? "Uploading..." : buttonText}
        </button>

        {hasDropdown && (
          <select
            value={value}
            onChange={(e) => onSelect?.(e.target.value)}
            style={{ ...select, width: "100%" }}
            title={selectTitle}
          >
            <option value="" style={selectOption}>
              {emptyText}
            </option>
            {items.map((item, index) => {
              const optionValue = String(getValue(item) ?? "");
              const label = getLabel(item) || "(empty)";
              return (
                <option key={optionValue || `item-${index}`} value={optionValue} style={selectOption}>
                  {label}
                </option>
              );
            })}
          </select>
        )}
      </div>
    </div>
  );
}

function ConsoleBoxInline({ lines }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <pre ref={ref} style={consoleBox}>
      {lines.join("\n")}
    </pre>
  );
}

export default function Sidebar(props) {
  const { addLog, setMainHeatmapUid, setLogoTrackUid, setMatrixUid, setChromosomeObject, currentMainHeatmapUid, currentLogoTrackUid, matrixUid, currentChromosomeObject, matrixEnabled, lineModeEnabled, canActivateLines, toggleMatrixMode, toggleLineMode, logs, backendDotColor, backendText, hoverDisplay, clickedDisplay, fastaFile, setFastaFile, fastaBusy, handleFastaUpload, heatmapUids, matrixUids, logoUids, fastaData,
  } = props;

  const [busy, setBusy] = useState(false);
  const [zipFile, setZipFile] = useState(null);
  const [file, setFile] = useState(null);
  const [logoTrackFile, setLogoTrackFile] = useState(null);
  const [npyMatrixFile, setNpyMatrixFile] = useState(null);

  const { handleUpload, handleLogoTrackUpload, handleNpyMatrixUpload, handleZIPUpload } = useUploads({
    addLog,
    setMainHeatmapUid,
    setLogoTrackUid,
    setMatrixUid,
    setChromosomeObject,
  });

  const allBusy = busy || fastaBusy;

  const selectUid = async (value, setter, kind) => {
    if (!value) return;
    const ok = await setter?.(value);
    addLog?.(`${kind} dropdown select: uid="${value}" ok=${Boolean(ok)}`);
  };

  const sections = useMemo(
    () => [
      {
        title: "zip file upload",
        grid: sectionGrid10,
        file: zipFile,
        setFile: setZipFile,
        onUpload: () => handleZIPUpload({ zipFile, setBusy }),
        accept: ".zip",
        buttonText: "Upload ZIP",
      },
      {
        title: "main heatmap upload Nx3xNx4.npy file",
        grid: sectionGrid10,
        file,
        setFile,
        onUpload: () => handleUpload({ file, setBusy }),
        accept: ".npy",
        items: asArray(heatmapUids),
        value: String(currentMainHeatmapUid ?? ""),
        onSelect: (value) => selectUid(value, setMainHeatmapUid, "heatmap"),
        emptyText: currentLabel("heatmap", currentMainHeatmapUid),
        selectTitle: currentLabel("heatmap UID", currentMainHeatmapUid, true),
      },
      {
        title: "logo track upload Nx4.npy file",
        grid: sectionGrid8,
        file: logoTrackFile,
        setFile: setLogoTrackFile,
        onUpload: () => handleLogoTrackUpload({ logoTrackFile, setBusy }),
        accept: ".npy",
        items: asArray(logoUids),
        value: String(currentLogoTrackUid ?? ""),
        onSelect: (value) => selectUid(value, setLogoTrackUid, "logo"),
        emptyText: currentLabel("logo track", currentLogoTrackUid),
        selectTitle: currentLabel("logo track", currentLogoTrackUid, true),
      },
      {
        title: "matrix upload NxK.npy file",
        grid: sectionGrid8,
        file: npyMatrixFile,
        setFile: setNpyMatrixFile,
        onUpload: () => handleNpyMatrixUpload({ npyMatrixFile, setBusy }),
        accept: ".npy",
        items: asArray(matrixUids),
        value: String(matrixUid ?? ""),
        onSelect: (value) => selectUid(value, setMatrixUid, "matrix"),
        emptyText: currentLabel("matrix", matrixUid),
        selectTitle: currentLabel("matrix UID", matrixUid, true),
        extra: (
          <div style={wrapRow}>
            <button type="button" onClick={toggleMatrixMode} style={button} title={matrixUid ? `matrixUid=${matrixUid}` : ""}>
              {matrixEnabled ? "matrix tracks: on" : "matrix tracks: off"}
            </button>
            <button
              type="button"
              onClick={toggleLineMode}
              disabled={!canActivateLines}
              style={{ ...button, opacity: canActivateLines ? 1 : 0.4, cursor: canActivateLines ? "pointer" : "not-allowed" }}
            >
              {lineModeEnabled ? "line mode: on" : "line mode: off"}
            </button>
          </div>
        ),
      },
      {
        title: 'sequence upload {">name:startpos-endpos\\nSEQ.fasta file"}',
        grid: sectionGrid8,
        file: fastaFile,
        setFile: setFastaFile,
        onUpload: handleFastaUpload,
        accept: ".fasta,.fa,.txt",
        items: asArray(fastaData),
        value: String(currentChromosomeObject?.name ?? ""),
        onSelect: (value) => selectUid(value, setChromosomeObject, "chromosome"),
        emptyText: currentLabel("chromosome", currentChromosomeObject?.name),
        selectTitle: currentLabel("chromosome", currentChromosomeObject?.name, true),
      },
    ],
    [ zipFile, file, logoTrackFile, npyMatrixFile, fastaFile, heatmapUids, logoUids, matrixUids, fastaData, currentMainHeatmapUid, currentLogoTrackUid, matrixUid, currentChromosomeObject, handleZIPUpload, handleUpload, handleLogoTrackUpload, handleNpyMatrixUpload, handleFastaUpload, toggleMatrixMode, toggleLineMode, matrixEnabled, lineModeEnabled, canActivateLines,
    ]
  );

  return (
    <>
      <style>{sidebarScrollHiddenCss}</style>

      <aside
        className="sidebar-scroll-hidden"
        style={{ ...sidebar, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
      >
        {sections.map(({ title, grid, extra, ...uploadProps }, i) => (
          <div key={title}>
            <div style={grid}>
              <div style={sectionTitle}>{title}</div>
              <FileUpload {...uploadProps} busy={allBusy} />
              {extra}
            </div>
            {i < sections.length - 1 && <div style={divider} />}
          </div>
        ))}

        <div style={divider} />

        <div style={hoverBlock}>
          <div>Hover cell: {formatDisplayLine(hoverDisplay)}</div>
          <div style={hoverLine}>Last click: {formatDisplayLine(clickedDisplay)}</div>
          <div style={hoverLine}>chromosome name: {currentChromosomeObject?.name || "unknown"}</div>
          <div style={hoverLine}>absolute position: {currentChromosomeObject?.absolutePosition ?? "—"}</div>
        </div>

        <div style={divider} />

        <div style={consoleWrap}>
          <ConsoleBoxInline lines={logs} />
        </div>

        <div style={divider} />

        <div style={backendRowInStatus}>
          <span style={backendDotSmall(backendDotColor)} />
          <div style={backendTextEllipsis}>Backend availability: {backendText}</div>
        </div>
      </aside>
    </>
  );
}