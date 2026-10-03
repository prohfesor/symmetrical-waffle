import { arcPoints, dimensionGraphics, entityPaths, Path, PrintPlan, ResolvedDrawing, Tile, Vec2 } from "@pcad/core";
import React, { useMemo } from "react";

export interface PrintPreviewProps {
  drawing: ResolvedDrawing;
  plan: PrintPlan;
  isEnabled: (label: string) => boolean;
  onToggle: (label: string) => void;
}

const COLORS = { geometry: "#1f2430", dimension: "#5b6b9c", sheet: "#1a73e8", overlap: "#e08a1e", off: "#6b7280" };

/** A tile's shared strips: the part of its region beyond its core, which the next sheet to the right / below repeats. */
function overlapStrips(tile: Tile): { min: Vec2; max: Vec2 }[] {
  const strips: { min: Vec2; max: Vec2 }[] = [];
  if (tile.coreRealMax.x < tile.realMax.x - 1e-9) strips.push({ min: { x: tile.coreRealMax.x, y: tile.realMin.y }, max: tile.realMax });
  if (tile.coreRealMin.y > tile.realMin.y + 1e-9) strips.push({ min: tile.realMin, max: { x: tile.realMax.x, y: tile.coreRealMin.y } });
  return strips;
}

/**
 * The drawing laid out over the sheets it will be printed on, as they must be assembled:
 * hatched strips are printed on two neighbouring sheets, and overlap when the sheets are glued.
 * Clicking a sheet switches it off (or back on).
 */
export function PrintPreview({ drawing, plan, isEnabled, onToggle }: PrintPreviewProps) {
  const { area, tiling } = plan;
  const width = area.max.x - area.min.x;
  const height = area.max.y - area.min.y;
  // Screen y grows downwards, drawing y upwards.
  const x = (v: number) => v - area.min.x;
  const y = (v: number) => area.max.y - v;
  const pts = (points: Vec2[]) => points.map((p) => `${x(p.x)},${y(p.y)}`).join(" ");

  const strokes = useMemo(() => {
    const tolerance = Math.max(width, height) / 1500;
    const geometry: Path[] = drawing.entities.flatMap((e) => entityPaths(e, tolerance));
    const dimension: Path[] = drawing.dimensions.flatMap((d) => {
      const { lines, arcs } = dimensionGraphics(d);
      return [
        ...lines.map((points): Path => ({ points, closed: false })),
        ...arcs.map((a): Path => ({ points: arcPoints(a.center, a.radius, a.startDeg, a.endDeg, tolerance), closed: false })),
      ];
    });
    return { geometry, dimension };
  }, [drawing, width, height]);

  const labelSize = Math.min(tiling.usableWidthMm, tiling.usableHeightMm, width, height) * 0.12 || 1;
  const line = { vectorEffect: "non-scaling-stroke" as const, fill: "none" };

  return (
    <svg
      className="print-preview"
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-label="Sheet layout preview"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern
          id="overlap-hatch"
          width={labelSize / 4}
          height={labelSize / 4}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2={labelSize / 4} stroke={COLORS.overlap} strokeWidth={labelSize / 16} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill="#fff" />

      {strokes.dimension.map((p, i) => (
        <polyline key={`d${i}`} points={pts(p.points)} stroke={COLORS.dimension} strokeWidth={0.8} {...line} />
      ))}
      {strokes.geometry.map((p, i) =>
        p.closed ? (
          <polygon key={`g${i}`} points={pts(p.points)} stroke={COLORS.geometry} strokeWidth={1.4} {...line} />
        ) : (
          <polyline key={`g${i}`} points={pts(p.points)} stroke={COLORS.geometry} strokeWidth={1.4} {...line} />
        ),
      )}

      {tiling.tiles.map((tile) => {
        const on = isEnabled(tile.label);
        const isEmpty = plan.emptyTiles.includes(tile.label);
        const left = x(tile.realMin.x);
        const top = y(tile.realMax.y);
        const w = tile.realMax.x - tile.realMin.x;
        const h = tile.realMax.y - tile.realMin.y;
        const cx = left + w / 2;
        const cy = top + h / 2;
        return (
          <g
            key={tile.label}
            className={`preview-sheet ${on ? "on" : "off"}`}
            data-sheet={tile.label}
            data-enabled={on}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={`Sheet ${tile.label}: ${on ? "will be printed" : "skipped"}${isEmpty ? " (empty)" : ""}`}
            onClick={() => onToggle(tile.label)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle(tile.label);
              }
            }}
          >
            <rect
              className="sheet-face"
              x={left}
              y={top}
              width={w}
              height={h}
              fill={on ? COLORS.sheet : COLORS.off}
              fillOpacity={on ? 0.05 : 0.45}
            />
            {on &&
              overlapStrips(tile).map((s, i) => (
                <rect
                  key={i}
                  x={x(s.min.x)}
                  y={y(s.max.y)}
                  width={s.max.x - s.min.x}
                  height={s.max.y - s.min.y}
                  fill="url(#overlap-hatch)"
                  opacity={0.7}
                  pointerEvents="none"
                />
              ))}
            <rect
              x={left}
              y={top}
              width={w}
              height={h}
              stroke={on ? COLORS.sheet : COLORS.off}
              strokeWidth={on ? 1.6 : 1}
              strokeDasharray={on ? undefined : "6 4"}
              {...line}
            />
            {!on && (
              <>
                <line x1={left} y1={top} x2={left + w} y2={top + h} stroke={COLORS.off} strokeWidth={1} pointerEvents="none" {...line} />
                <line x1={left} y1={top + h} x2={left + w} y2={top} stroke={COLORS.off} strokeWidth={1} pointerEvents="none" {...line} />
              </>
            )}
            <text
              x={cx}
              y={cy}
              fontSize={labelSize}
              textAnchor="middle"
              dominantBaseline="central"
              fill={on ? COLORS.sheet : COLORS.off}
              fontWeight={700}
              pointerEvents="none"
              className="sheet-label"
            >
              {tile.label}
            </text>
            {isEmpty && (
              <text x={cx} y={cy + labelSize * 0.8} fontSize={labelSize * 0.38} textAnchor="middle" fill={COLORS.off} pointerEvents="none">
                empty
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
