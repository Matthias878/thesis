import { useEffect, useRef, useState, useCallback } from "react";
import { useUploads } from "../api/fileUploadHandler";
import { sidebar, divider, sectionTitle, select, selectOption, backendRowInStatus, backendDotSmall, backendTextEllipsis, hoverBlock, hoverLine, button, sectionGrid8, sectionGrid10, wrapRow, consoleBox, consoleWrap, sidebarScrollHiddenCss, uploadButton, filePickerRow, hiddenFileInput, fileNameBox, uploadActionGrid, toggleButtonStyle,
} from "../styles/appStyles";

const arr = (v) => (Array.isArray(v) ? v : []);
const text = (v) =>
  v instanceof Error ? `Error: ${v.message}` : v == null ? "—" : String(v);
const pair = (a, b) => `${a ?? "—"},${b ?? "—"}`;
const current = (label, value, upper = false) =>
  value ? `${upper ? "Current " : "current "}${label}: ${value}` : "empty";

const relPos = (d) => (d ? pair(d.cellX, d.cellY) : "—");
const absPos = (d, chr) =>
  d
    ? pair(
        (d.cellX ?? 0) + (Number(chr?.absolutePosition ?? 0) || 0),
        (d.cellY ?? 0) + (Number(chr?.absolutePosition ?? 0) || 0)
      )
    : "—";
const displayLine = (d, chr) =>
  d
    ? `value=${text(d.value)} · relative=${relPos(d)} · absolute=${absPos(d, chr)}`
    : "—";

const sameCollection = (a, b) =>
  !!a &&
  ["main_heatmapUid", "matrixUid", "logo_trackUid", "chromosomeName"].every(
    (k) => String(a[k] ?? "") === String(b[k] ?? "")
  );

function FilePicker({ file, setFile, busy, accept }) {
  const ref = useRef(null);

  return (
    <div style={filePickerRow}>
      <input
        ref={ref}
        type="file"
        accept={accept}
        disabled={busy}
        style={hiddenFileInput}
        onChange={({ target }) => setFile(target.files?.[0] ?? null)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        style={uploadButton(busy)}
      >
        Browse
      </button>
      <div style={fileNameBox(Boolean(file))} title={file?.name || "No file selected"}>
        {file?.name || "No file selected"}
      </div>
    </div>
  );
}

function UploadSection({ title, grid, file, setFile, onUpload, busy, accept, buttonText = "Upload", items, value = "", onSelect, emptyText = "empty", selectTitle = "", getValue = (x) => x, getLabel = (x) => String(x ?? ""), extra,
}) {
  const showSelect = items && onSelect;

  return (
    <div>
      <div style={grid}>
        <div style={sectionTitle}>{title}</div>

        <FilePicker file={file} setFile={setFile} busy={busy} accept={accept} />

        <div style={uploadActionGrid(showSelect)}>
          <button
            type="button"
            onClick={onUpload}
            disabled={!file || busy}
            title={!file ? "Please select a file first" : ""}
            style={uploadButton(!file || busy)}
          >
            {busy ? "Uploading..." : buttonText}
          </button>

          {showSelect && (
            <select
              value={value}
              onChange={(e) => onSelect(e.target.value)}
              style={select}
              title={selectTitle}
            >
              <option value="" style={selectOption}>
                {emptyText}
              </option>
              {items.map((item, i) => {
                const v = String(getValue(item) ?? "");
                return (
                  <option key={v || `item-${i}`} value={v} style={selectOption}>
                    {getLabel(item) || "(empty)"}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        {extra}
      </div>
    </div>
  );
}

function ToggleButton({ onClick, active, onText, offText, disabled = false, title = "",
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={toggleButtonStyle(disabled)}
    >
      {active ? onText : offText}
    </button>
  );
}

function LogConsole({ lines }) {
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

export default function Sidebar({ addLog, logs, reloadViewer, backendStatus, viewer,
}) {
  const { setMainHeatmapUid, setLogoTrackUid, setMatrixUid, mainHeatmapUid, matrixUid, logoTrackUid, currentChromosome, lineMode, matrixEnabled, logoEnabled, sequenceEnabled, canActivateLines, heatmapUids, matrixUids, logoUids, chromosomes, savedCollections, selectSavedCollection, toggleLineMode, toggleMatrixMode, toggleLogoMode, toggleSequenceMode, hoveredPosition,
  } = viewer;

  const { dotColor: backendDotColor, text: backendText } = backendStatus;

  const [busy, setBusy] = useState(false);
  const [zipFile, setZipFile] = useState(null);
  const [heatmapFile, setHeatmapFile] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [matrixFile, setMatrixFile] = useState(null);
  const [fastaFile, setFastaFile] = useState(null);
  const [lastClickedPosition, setLastClickedPosition] = useState(null);

  const sidebarRef = useRef(null);
  const hoveredPositionRef = useRef(hoveredPosition);

  const { handleUpload, handleZIPUpload, handleFastaUpload } = useUploads({ addLog, setMainHeatmapUid, setLogoTrackUid, setMatrixUid, setChromosomeObject: viewer.setChromosomeObject, addSavedCollection: viewer.addSavedCollection, selectSavedCollection,
  });

  useEffect(() => {
    hoveredPositionRef.current = hoveredPosition;
  }, [hoveredPosition]);

  useEffect(() => {
    const onMouseDown = (e) => {
      if (e.button !== 0 || sidebarRef.current?.contains(e.target)) return;
      const p = hoveredPositionRef.current;
      setLastClickedPosition(p ? { ...p } : null);
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const currentSelection = {
    main_heatmapUid: mainHeatmapUid ?? "",
    matrixUid: matrixUid ?? "",
    logo_trackUid: logoTrackUid ?? "",
    chromosomeName: currentChromosome?.name ?? "",
  };

  const presetEntries = Object.entries(savedCollections ?? {});
  const selectedPresetKey =
    presetEntries.find(([, c]) => sameCollection(c, currentSelection))?.[0] ?? "";
  const selectedPresetLabel = selectedPresetKey
    ? `current preset: ${selectedPresetKey}`
    : "no currently selected preset";

  const selectValue = useCallback(
    async (value, setter, kind, label = "uid") => {
      if (!value) return;
      const ok = await setter?.(value);
      addLog?.(`${kind} dropdown select: ${label}="${value}" ok=${Boolean(ok)}`);
    },
    [addLog]
  );

  const runToggle = useCallback(
    (toggle, successMsg, { enabled = true, blockedMsg, reload = false } = {}) => {
      if (!enabled) {
        if (blockedMsg) addLog(blockedMsg);
        return;
      }
      toggle?.();
      if (successMsg) addLog(successMsg);
      if (reload) reloadViewer();
    },
    [addLog, reloadViewer]
  );

  const sections = [
    {
      title: "zip file upload",
      grid: sectionGrid10,
      file: zipFile,
      setFile: setZipFile,
      onUpload: () => handleZIPUpload({ zipFile, setBusy }),
      accept: ".zip",
      buttonText: "Upload ZIP",
      items: presetEntries.map(([key, collection]) => ({ key, collection })),
      value: selectedPresetKey,
      onSelect: (key) => selectValue(key, selectSavedCollection, "preset", "key"),
      emptyText: selectedPresetLabel,
      selectTitle: selectedPresetLabel,
      getValue: (x) => x.key,
      getLabel: ({ key, collection: c = {} }) =>
        [
          key,
          c.main_heatmapUid && `heatmap=${c.main_heatmapUid}`,
          c.matrixUid && `matrix=${c.matrixUid}`,
          c.logo_trackUid && `logo=${c.logo_trackUid}`,
          c.chromosomeName && `chr=${c.chromosomeName}`,
        ]
          .filter(Boolean)
          .join(" · "),
    },
    {
      title: "main heatmap upload Nx3xNx4.npy file",
      grid: sectionGrid10,
      file: heatmapFile,
      setFile: setHeatmapFile,
      onUpload: () => handleUpload({ type: "heatmap", file: heatmapFile, setBusy }),
      accept: ".npy",
      items: arr(heatmapUids),
      value: String(mainHeatmapUid ?? ""),
      onSelect: (v) => selectValue(v, setMainHeatmapUid, "heatmap"),
      emptyText: current("heatmap", mainHeatmapUid),
      selectTitle: current("heatmap UID", mainHeatmapUid, true),
    },
    {
      title: "logo track upload Nx4.npy file",
      grid: sectionGrid8,
      file: logoFile,
      setFile: setLogoFile,
      onUpload: () => handleUpload({ type: "logo", file: logoFile, setBusy }),
      accept: ".npy",
      items: arr(logoUids),
      value: String(logoTrackUid ?? ""),
      onSelect: (v) => selectValue(v, setLogoTrackUid, "logo"),
      emptyText: current("logo track", logoTrackUid),
      selectTitle: current("logo track", logoTrackUid, true),
      extra: (
        <div style={wrapRow}>
          <ToggleButton
            onClick={() =>
              runToggle(toggleLogoMode, "logo button pressed -> toggleLogoMode()")
            }
            active={logoEnabled}
            onText="logo tracks: on"
            offText="logo tracks: off"
            title={logoTrackUid ? `logoTrackUid=${logoTrackUid}` : ""}
          />
        </div>
      ),
    },
    {
      title: "matrix upload NxK.npy file",
      grid: sectionGrid8,
      file: matrixFile,
      setFile: setMatrixFile,
      onUpload: () => handleUpload({ type: "matrix", file: matrixFile, setBusy }),
      accept: ".npy",
      items: arr(matrixUids),
      value: String(matrixUid ?? ""),
      onSelect: (v) => selectValue(v, setMatrixUid, "matrix"),
      emptyText: current("matrix", matrixUid),
      selectTitle: current("matrix UID", matrixUid, true),
      extra: (
        <div style={wrapRow}>
          <ToggleButton
            onClick={() =>
              runToggle(toggleMatrixMode, "matrix button pressed -> toggleMatrixMode()")
            }
            active={matrixEnabled}
            onText="matrix tracks: on"
            offText="matrix tracks: off"
            title={matrixUid ? `matrixUid=${matrixUid}` : ""}
          />
          <ToggleButton
            onClick={() =>
              runToggle(toggleLineMode, "line-mode button pressed -> toggleLineMode()", {
                enabled: canActivateLines,
                blockedMsg: "line-mode button blocked: canActivateLines=false",
                reload: true,
              })
            }
            active={lineMode}
            onText="line mode: on"
            offText="line mode: off"
            disabled={!canActivateLines}
          />
        </div>
      ),
    },
    {
      title: 'sequence upload {">name:startpos-endpos\\nSEQ.fasta file"}',
      grid: sectionGrid8,
      file: fastaFile,
      setFile: setFastaFile,
      onUpload: () => handleFastaUpload({ fastaFile, setBusy }),
      accept: ".fasta,.fa,.txt",
      items: arr(chromosomes).map((x) => x.name),
      value: String(currentChromosome?.name ?? ""),
      onSelect: (v) => selectValue(v, viewer.setChromosomeObject, "chromosome"),
      emptyText: current("chromosome", currentChromosome?.name),
      selectTitle: current("chromosome", currentChromosome?.name, true),
      extra: (
        <div style={wrapRow}>
          <ToggleButton
            onClick={() =>
              runToggle(
                toggleSequenceMode,
                "sequence button pressed -> toggleSequenceTrackMode()",
                { reload: true }
              )
            }
            active={sequenceEnabled}
            onText="sequence track: on"
            offText="sequence track: off"
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <style>{sidebarScrollHiddenCss}</style>

      <aside ref={sidebarRef} className="sidebar-scroll-hidden" style={sidebar}>
        {sections.map((section, i) => (
          <div key={section.title}>
            <UploadSection {...section} busy={busy} />
            {i < sections.length - 1 && <div style={divider} />}
          </div>
        ))}

        <div style={divider} />

        <div style={hoverBlock}>
          <div>Hover cell: {displayLine(hoveredPosition, currentChromosome)}</div>
          <div style={hoverLine}>
            Last clicked: {displayLine(lastClickedPosition, currentChromosome)}
          </div>
          <div style={hoverLine}>
            chromosome name: {currentChromosome?.name || "unknown"}
          </div>
          <div style={hoverLine}>
            absolute position: {currentChromosome?.absolutePosition ?? 0}
          </div>
          <div style={hoverLine}>{selectedPresetLabel}</div>
        </div>

        <div style={divider} />

        <div style={consoleWrap}>
          <LogConsole lines={logs} />
        </div>

        <div style={divider} />

        <div style={sectionGrid8}>
          <button type="button" onClick={reloadViewer} style={button}>
            Debug: manually reload viewer
          </button>
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