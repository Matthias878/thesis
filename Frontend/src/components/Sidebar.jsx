import { useEffect, useRef, useCallback, useState } from "react";
import { useUploads } from "../api/fileUploadHandler";
import {sidebar, divider, sectionTitle, select, selectOption, backendRowInStatus, backendDotSmall, backendTextEllipsis, hoverBlock, hoverLine, button, sectionGrid8, sectionGrid10, wrapRow, consoleBox, consoleWrap, sidebarScrollHiddenCss, uploadButton, filePickerRow, hiddenFileInput, fileNameBox, uploadActionGrid, toggleButtonStyle,} from "../styles/appStyles";

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

function setUploadTestState(patch) {
  if (typeof window === "undefined") return;

  const prev = window.__uploadTestState ?? {
    uploadInProgress: false,
    lastStartedFile: null,
    lastCompletedFile: null,
    lastFailedFile: null,
    lastError: null,
    updatedAt: null,
  };

  window.__uploadTestState = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function FilePicker({ file, setFile, disabled, accept, testIdBase }) {
  const ref = useRef(null);

  return (
    <div style={filePickerRow} data-testid={`${testIdBase}-file-picker`}>
      <input
        ref={ref}
        data-testid={`${testIdBase}-file-input`}
        type="file"
        accept={accept}
        disabled={disabled}
        style={hiddenFileInput}
        onChange={({ target }) => setFile(target.files?.[0] ?? null)}
      />
      <button
        data-testid={`${testIdBase}-browse-button`}
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        style={uploadButton(disabled)}
      >
        Browse
      </button>
      <div
        data-testid={`${testIdBase}-file-name`}
        style={fileNameBox(Boolean(file))}
        title={file?.name || "No file selected"}
      >
        {file?.name || "No file selected"}
      </div>
    </div>
  );
}

function UploadSection({
  title,
  grid,
  file,
  setFile,
  onUpload,
  disabled,
  accept,
  markEventA,
  buttonText = "Upload",
  items,
  value = "",
  onSelect,
  emptyText = "empty",
  selectTitle = "",
  getValue = (x) => x,
  getLabel = (x) => String(x ?? ""),
  extra,
  testIdBase,
  allowClickWithoutFile = false,
}) {
  const showSelect = items && onSelect;
  const uploadDisabled = disabled || (!allowClickWithoutFile && !file);

  return (
    <div data-testid={`${testIdBase}-section`}>
      <div style={grid}>
        <div style={sectionTitle} data-testid={`${testIdBase}-title`}>
          {title}
        </div>

        <FilePicker
          file={file}
          setFile={setFile}
          disabled={disabled}
          accept={accept}
          testIdBase={testIdBase}
        />

        <div
          style={uploadActionGrid(showSelect)}
          data-testid={`${testIdBase}-actions`}
        >
          <button
            data-testid={`${testIdBase}-upload-button`}
            type="button"
            onClick={async () => {
              if (!file) return;
              markEventA?.(file?.name ?? "no-file");
              await onUpload();
            }}
            disabled={uploadDisabled}
            title={!file ? "Please select a file first" : ""}
            style={uploadButton(uploadDisabled)}
          >
            {disabled ? "Uploading..." : buttonText}
          </button>

          {showSelect && (
            <select
              data-testid={`${testIdBase}-select`}
              value={value}
              onChange={(e) => onSelect(e.target.value)}
              style={select}
              title={selectTitle}
              disabled={disabled}
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

function ToggleButton({
  onClick,
  active,
  onText,
  offText,
  disabled = false,
  title = "",
  testId,
}) {
  return (
    <button
      data-testid={testId}
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
    <pre ref={ref} style={consoleBox} data-testid="sidebar-log-console">
      {lines.join("\n")}
    </pre>
  );
}

export default function Sidebar({
  addLog,
  logs,
  reloadViewer,
  backendStatus,
  viewer,
  markEventA,
}) {
  const {
    setMainHeatmapUid,
    setLogoTrackUid,
    setMatrixUid,
    mainHeatmapUid,
    matrixUid,
    logoTrackUid,
    currentChromosome,
    lineMode,
    matrixEnabled,
    logoEnabled,
    sequenceEnabled,
    canActivateLines,
    heatmapUids,
    matrixUids,
    logoUids,
    chromosomes,
    savedCollections,
    selectSavedCollection,
    setChromosomeObject,
    addSavedCollection,
    toggleLineMode,
    toggleMatrixMode,
    toggleLogoMode,
    toggleSequenceMode,
    hoveredPosition,
    blockUI,
    setBlockUI,
  } = viewer;

  const {
    apiBackend = {},
    higlassServer = {},
  } = backendStatus ?? {};

  const {
    dotColor: apiBackendDotColor,
    text: apiBackendText = "api backend not available",
  } = apiBackend;

  const {
    dotColor: higlassDotColor,
    text: higlassText = "HiGlass server: not reachable",
  } = higlassServer;

  const [zipFile, setZipFile] = useState(null);
  const [heatmapFile, setHeatmapFile] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [matrixFile, setMatrixFile] = useState(null);
  const [fastaFile, setFastaFile] = useState(null);
  const [lastClickedPosition, setLastClickedPosition] = useState(null);

  const sidebarRef = useRef(null);
  const hoveredPositionRef = useRef(hoveredPosition);

  const { handleUpload, handleZIPUpload, handleFastaUpload } = useUploads({addLog, setMainHeatmapUid, setLogoTrackUid, setMatrixUid, setChromosomeObject, addSavedCollection, selectSavedCollection, setBlockUI,});

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

  useEffect(() => {
    setUploadTestState({ uploadInProgress: false });
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
      if (!value || blockUI) return;
      const ok = await setter?.(value);
      addLog?.(`${kind} dropdown select: ${label}="${value}" ok=${Boolean(ok)}`);
    },
    [addLog, blockUI]
  );

  const runToggle = useCallback(
    (toggle, successMsg, { enabled = true, blockedMsg, reload = false } = {}) => {
      if (blockUI) {
        addLog?.("action blocked: blockUI=true");
        return;
      }
      if (!enabled) {
        if (blockedMsg) addLog(blockedMsg);
        return;
      }
      toggle?.();
      if (successMsg) addLog(successMsg);
      if (reload) reloadViewer();
    },
    [addLog, blockUI, reloadViewer]
  );

  const uploadZipWithTestState = useCallback(async () => {
    if (!zipFile) return;

    try {
      setUploadTestState({
        uploadInProgress: true,
        lastStartedFile: zipFile.name,
        lastError: null,
      });

      await handleZIPUpload({ zipFile });

      setUploadTestState({
        uploadInProgress: false,
        lastCompletedFile: zipFile.name,
        lastFailedFile: null,
        lastError: null,
      });
    } catch (error) {
      setUploadTestState({
        uploadInProgress: false,
        lastFailedFile: zipFile.name,
        lastError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }, [handleZIPUpload, zipFile]);

  const sections = [
    {
      testIdBase: "upload-zip",
      title: "zip file upload",
      grid: sectionGrid10,
      file: zipFile,
      setFile: setZipFile,
      onUpload: uploadZipWithTestState,
      accept: ".zip",
      buttonText: "Upload ZIP",
      allowClickWithoutFile: true,
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
      testIdBase: "upload-heatmap",
      title: "main heatmap upload Nx3xNx4.npy file",
      grid: sectionGrid10,
      file: heatmapFile,
      setFile: setHeatmapFile,
      onUpload: () => handleUpload({ type: "heatmap", file: heatmapFile }),
      accept: ".npy",
      items: arr(heatmapUids),
      value: String(mainHeatmapUid ?? ""),
      onSelect: (v) => selectValue(v, setMainHeatmapUid, "heatmap"),
      emptyText: current("heatmap", mainHeatmapUid),
      selectTitle: current("heatmap UID", mainHeatmapUid, true),
    },
    {
      testIdBase: "upload-logo",
      title: "logo track upload Nx4.npy file",
      grid: sectionGrid8,
      file: logoFile,
      setFile: setLogoFile,
      onUpload: () => handleUpload({ type: "logo", file: logoFile }),
      accept: ".npy",
      items: arr(logoUids),
      value: String(logoTrackUid ?? ""),
      onSelect: (v) => selectValue(v, setLogoTrackUid, "logo"),
      emptyText: current("logo track", logoTrackUid),
      selectTitle: current("logo track", logoTrackUid, true),
      extra: (
        <div style={wrapRow}>
          <ToggleButton
            testId="toggle-logo-mode"
            onClick={() =>
              runToggle(toggleLogoMode, "logo button pressed -> toggleLogoMode()")
            }
            active={logoEnabled}
            onText="logo tracks: shown"
            offText="logo tracks: hidden/off"
            title={logoTrackUid ? `logoTrackUid=${logoTrackUid}` : ""}
            disabled={blockUI}
          />
        </div>
      ),
    },
    {
      testIdBase: "upload-matrix",
      title: "matrix upload NxK.npy file",
      grid: sectionGrid8,
      file: matrixFile,
      setFile: setMatrixFile,
      onUpload: () => handleUpload({ type: "matrix", file: matrixFile }),
      accept: ".npy",
      items: arr(matrixUids),
      value: String(matrixUid ?? ""),
      onSelect: (v) => selectValue(v, setMatrixUid, "matrix"),
      emptyText: current("matrix", matrixUid),
      selectTitle: current("matrix UID", matrixUid, true),
      extra: (
        <div style={wrapRow}>
          <ToggleButton
            testId="toggle-matrix-mode"
            onClick={() =>
              runToggle(toggleMatrixMode, "matrix button pressed -> toggleMatrixMode()")
            }
            active={matrixEnabled}
            onText="matrix tracks: shown"
            offText="matrix tracks: hidden/off"
            title={matrixUid ? `matrixUid=${matrixUid}` : ""}
            disabled={blockUI}
          />
          <ToggleButton
            testId="toggle-line-mode"
            onClick={() =>
              runToggle(toggleLineMode, "line-mode button pressed -> toggleLineMode()", {
                enabled: canActivateLines,
                blockedMsg: "line-mode button blocked: canActivateLines=false",
                reload: true,
              })
            }
            active={lineMode}
            onText="line mode: active"
            offText="line mode: off"
            disabled={blockUI || !canActivateLines}
          />
        </div>
      ),
    },
    {
      testIdBase: "upload-sequence",
      title: 'sequence upload {">name:startpos-endpos\\nSEQ.fasta file"}',
      grid: sectionGrid8,
      file: fastaFile,
      setFile: setFastaFile,
      onUpload: () => handleFastaUpload({ fastaFile }),
      accept: ".fasta,.fa,.txt",
      items: arr(chromosomes).map((x) => x.name),
      value: String(currentChromosome?.name ?? ""),
      onSelect: (v) => selectValue(v, setChromosomeObject, "chromosome"),
      emptyText: current("chromosome", currentChromosome?.name),
      selectTitle: current("chromosome", currentChromosome?.name, true),
      extra: (
        <div style={wrapRow}>
          <ToggleButton
            testId="toggle-sequence-mode"
            onClick={() =>
              runToggle(
                toggleSequenceMode,
                "sequence button pressed -> toggleSequenceTrackMode()",
                { reload: true }
              )
            }
            active={sequenceEnabled}
            onText="sequence track: shown"
            offText="sequence track: hidden/off"
            disabled={blockUI}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <style>{sidebarScrollHiddenCss}</style>

      <aside
        ref={sidebarRef}
        className="sidebar-scroll-hidden"
        style={sidebar}
        data-testid="sidebar"
      >
        {sections.map((section, i) => (
          <div key={section.title} data-testid={`${section.testIdBase}-container`}>
            <UploadSection {...section} disabled={blockUI} markEventA={markEventA} />
            {i < sections.length - 1 && <div style={divider} />}
          </div>
        ))}

        <div style={divider} />

        <div style={hoverBlock} data-testid="hover-info">
          <div data-testid="hover-cell">
            Hover cell: {displayLine(hoveredPosition, currentChromosome)}
          </div>
          <div style={hoverLine} data-testid="last-clicked">
            Last clicked: {displayLine(lastClickedPosition, currentChromosome)}
          </div>
          <div style={hoverLine} data-testid="chromosome-name">
            chromosome name: {currentChromosome?.name || "unknown"}
          </div>
          <div style={hoverLine} data-testid="absolute-position">
            absolute position: {currentChromosome?.absolutePosition ?? 0}
          </div>
          <div style={hoverLine} data-testid="selected-preset-label">
            {selectedPresetLabel}
          </div>
        </div>

        <div style={divider} />

        <div style={consoleWrap} data-testid="console-wrap">
          <LogConsole lines={logs} />
        </div>

        <div style={divider} />

        <div style={sectionGrid8}>
          <button
            data-testid="reload-viewer-button"
            type="button"
            onClick={reloadViewer}
            style={button}
          >
            Debug: manually reload viewer
          </button>
        </div>

        <div style={divider} />

        <div style={backendRowInStatus} data-testid="api-backend-status">
          <span
            style={backendDotSmall(apiBackendDotColor)}
            data-testid="api-backend-status-dot"
          />
          <div style={backendTextEllipsis} data-testid="api-backend-status-text">
            API Backend availability: {apiBackendText}
          </div>
        </div>

        <div style={backendRowInStatus} data-testid="higlass-server-status">
          <span
            style={backendDotSmall(higlassDotColor)}
            data-testid="higlass-server-status-dot"
          />
          <div style={backendTextEllipsis} data-testid="higlass-server-status-text">
            {higlassText}
          </div>
        </div>
      </aside>
    </>
  );
}