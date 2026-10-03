export type ToolId = "select" | "line" | "circle" | "rectangle" | "arc" | "polyline" | "mirror" | "dim-linear" | "dim-radius";

export interface ToolInfo {
  id: ToolId;
  label: string;
  hint: string;
  /** Single-key shortcut (no modifier) that activates this tool. */
  shortcut: string;
}

// Panning has no dedicated tool/button: middle-click-drag, right-click-drag,
// and Space+drag all pan regardless of which tool is active (see Canvas.tsx),
// which covers mouse and trackpad users without needing a mode to switch out of.
export const TOOLS: ToolInfo[] = [
  { id: "select", label: "Select", hint: "Click an entity to select it. Drag a free point to move it.", shortcut: "S" },
  { id: "line", label: "Line", hint: "Click a start point, then an end point.", shortcut: "L" },
  { id: "circle", label: "Circle", hint: "Click the center, then a point on the radius.", shortcut: "C" },
  { id: "rectangle", label: "Rectangle", hint: "Click one corner, then the opposite corner.", shortcut: "R" },
  { id: "arc", label: "Arc", hint: "Click the center, then the start point, then the end point.", shortcut: "A" },
  { id: "polyline", label: "Polyline", hint: "Click each vertex. Double-click or press Enter to finish, Esc to cancel.", shortcut: "P" },
  { id: "mirror", label: "Mirror", hint: "Click the entities to mirror (click again to un-pick), press Enter, then click two points to define the axis.", shortcut: "M" },
  { id: "dim-linear", label: "Linear Dim", hint: "Click a line, then click to place the dimension line.", shortcut: "D" },
  { id: "dim-radius", label: "Radius Dim", hint: "Click a circle or arc, then click to place the leader.", shortcut: "K" },
];

export const TOOL_SHORTCUTS: Record<string, ToolId> = Object.fromEntries(TOOLS.map((t) => [t.shortcut, t.id]));
