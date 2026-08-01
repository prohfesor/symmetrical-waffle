export type ToolId =
  | "select"
  | "pan"
  | "line"
  | "circle"
  | "rectangle"
  | "arc"
  | "polyline"
  | "dim-linear"
  | "dim-radius";

export interface ToolInfo {
  id: ToolId;
  label: string;
  hint: string;
}

export const TOOLS: ToolInfo[] = [
  { id: "select", label: "Select", hint: "Click an entity to select it. Drag a free point to move it." },
  { id: "pan", label: "Pan", hint: "Drag to pan the view." },
  { id: "line", label: "Line", hint: "Click a start point, then an end point." },
  { id: "circle", label: "Circle", hint: "Click the center, then a point on the radius." },
  { id: "rectangle", label: "Rectangle", hint: "Click one corner, then the opposite corner." },
  { id: "arc", label: "Arc", hint: "Click the center, then the start point, then the end point." },
  { id: "polyline", label: "Polyline", hint: "Click each vertex. Double-click or press Enter to finish, Esc to cancel." },
  { id: "dim-linear", label: "Linear Dim", hint: "Click a line, then click to place the dimension line." },
  { id: "dim-radius", label: "Radius Dim", hint: "Click a circle or arc, then click to place the leader." },
];
