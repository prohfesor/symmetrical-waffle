import { computeTiling, exportTiledPdf, Orientation, PAPER_SIZES, PaperSize, parseScale, SCALE_PRESETS, TilingError } from "@pcad/core";
import React, { useMemo, useState } from "react";
import { exportPdfFile } from "../io/fileIo.js";
import { useAppState, useDispatch, useResolvedDrawing } from "../state/store.js";

export function PrintDialog() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { drawing } = useResolvedDrawing();

  const [paperName, setPaperName] = useState("A4");
  const [customWidth, setCustomWidth] = useState(210);
  const [customHeight, setCustomHeight] = useState(297);
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scalePreset, setScalePreset] = useState<string>("1:1");
  const [customScale, setCustomScale] = useState("1:1");
  const [marginMm, setMarginMm] = useState(10);
  const [overlapMm, setOverlapMm] = useState(15);
  const [showCropMarks, setShowCropMarks] = useState(true);
  const [showOverlapShading, setShowOverlapShading] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [includeIndexSheet, setIncludeIndexSheet] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paper: PaperSize = paperName === "Custom" ? { name: "Custom", widthMm: customWidth, heightMm: customHeight } : PAPER_SIZES.find((p) => p.name === paperName)!;

  let scale = 1;
  let scaleError: string | null = null;
  try {
    scale = parseScale(scalePreset === "custom" ? customScale : scalePreset);
  } catch (err) {
    scaleError = err instanceof Error ? err.message : String(err);
  }

  const tiling = useMemo(() => {
    if (!drawing.bounds || scaleError) return null;
    try {
      return computeTiling(drawing.bounds, { paper, orientation, scale, marginMm, overlapMm });
    } catch (err) {
      return err instanceof TilingError ? err : null;
    }
  }, [drawing.bounds, paper.widthMm, paper.heightMm, orientation, scale, marginMm, overlapMm, scaleError]);

  const tilingError = tiling instanceof TilingError ? tiling.message : null;
  const tilingResult = tiling && !(tiling instanceof TilingError) ? tiling : null;

  async function handleExport() {
    if (!drawing.bounds) {
      setError("Nothing to print -- the drawing has no geometry.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const bytes = await exportTiledPdf(drawing, {
        paper,
        orientation,
        scale,
        marginMm,
        overlapMm,
        title: state.document.title,
        showCropMarks,
        showOverlapShading,
        showLabels,
        includeIndexSheet,
      });
      const saved = await exportPdfFile(`${state.document.title?.trim() || "drawing"}.pdf`, bytes);
      if (saved) dispatch({ type: "SET_PRINT_DIALOG", open: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: "SET_PRINT_DIALOG", open: false })}>
      <div className="modal print-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Print / Export tiled PDF</h2>
        <div className="print-form">
          <label>
            <span>Paper size</span>
            <select value={paperName} onChange={(e) => setPaperName(e.target.value)}>
              {PAPER_SIZES.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} ({p.widthMm} x {p.heightMm} mm)
                </option>
              ))}
              <option value="Custom">Custom...</option>
            </select>
          </label>
          {paperName === "Custom" && (
            <div className="inline-fields">
              <label>
                <span>Width (mm)</span>
                <input type="number" value={customWidth} onChange={(e) => setCustomWidth(Number(e.target.value))} />
              </label>
              <label>
                <span>Height (mm)</span>
                <input type="number" value={customHeight} onChange={(e) => setCustomHeight(Number(e.target.value))} />
              </label>
            </div>
          )}

          <label>
            <span>Orientation</span>
            <select value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>

          <label>
            <span>Scale</span>
            <select value={scalePreset} onChange={(e) => setScalePreset(e.target.value)}>
              {SCALE_PRESETS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </label>
          {scalePreset === "custom" && (
            <label>
              <span>Custom scale (e.g. 1:15)</span>
              <input value={customScale} onChange={(e) => setCustomScale(e.target.value)} />
            </label>
          )}

          <div className="inline-fields">
            <label>
              <span>Margin (mm)</span>
              <input type="number" min={0} value={marginMm} onChange={(e) => setMarginMm(Number(e.target.value))} />
            </label>
            <label>
              <span>Overlap (mm)</span>
              <input type="number" min={0} value={overlapMm} onChange={(e) => setOverlapMm(Number(e.target.value))} />
            </label>
          </div>

          <label className="checkbox-field">
            <input type="checkbox" checked={showCropMarks} onChange={(e) => setShowCropMarks(e.target.checked)} />
            <span>Crop / registration marks at trim lines</span>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={showOverlapShading} onChange={(e) => setShowOverlapShading(e.target.checked)} />
            <span>Shade overlap strips</span>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
            <span>Sheet labels (title block)</span>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={includeIndexSheet} onChange={(e) => setIncludeIndexSheet(e.target.checked)} />
            <span>Include assembly index sheet</span>
          </label>
        </div>

        <div className="print-summary">
          {scaleError && <p className="error-text">{scaleError}</p>}
          {tilingError && <p className="error-text">{tilingError}</p>}
          {tilingResult && (
            <p>
              {tilingResult.cols} x {tilingResult.rows} = {tilingResult.cols * tilingResult.rows} sheet(s) at {paper.name} {orientation}
              {includeIndexSheet && tilingResult.tiles.length > 1 ? " + 1 index sheet" : ""}.
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
        </div>

        <div className="modal-actions">
          <button onClick={() => dispatch({ type: "SET_PRINT_DIALOG", open: false })}>Cancel</button>
          <button className="primary" disabled={busy || !!scaleError || !!tilingError} onClick={handleExport}>
            {busy ? "Exporting..." : "Export PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
