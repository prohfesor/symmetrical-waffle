import { Dimension, DrawingDocument, Entity } from "@pcad/core";
import React, { createContext, useContext, useMemo, useReducer } from "react";
import { createSampleDocument } from "../sample/sampleDocument.js";
import { SAMPLE_PARAMS_TEXT } from "../sample/sampleParams.js";
import { ToolId } from "../tools/types.js";

export type Selection = { kind: "entity"; id: string } | { kind: "dimension"; id: string } | null;

export interface Viewport {
  /** Document-space point currently at the center of the canvas. */
  centerX: number;
  centerY: number;
  /** Screen pixels per one document millimeter. */
  zoom: number;
}

export interface AppState {
  document: DrawingDocument;
  paramsText: string;
  selection: Selection;
  tool: ToolId;
  viewport: Viewport;
  printDialogOpen: boolean;
}

export type Action =
  | { type: "SET_DOCUMENT"; document: DrawingDocument }
  | { type: "SET_PARAMS_TEXT"; text: string }
  | { type: "ADD_ENTITY"; entity: Entity }
  | { type: "UPDATE_ENTITY"; id: string; entity: Entity }
  | { type: "REMOVE_ENTITY"; id: string }
  | { type: "ADD_DIMENSION"; dimension: Dimension }
  | { type: "UPDATE_DIMENSION"; id: string; dimension: Dimension }
  | { type: "REMOVE_DIMENSION"; id: string }
  | { type: "SET_SELECTION"; selection: Selection }
  | { type: "SET_TOOL"; tool: ToolId }
  | { type: "SET_VIEWPORT"; viewport: Partial<Viewport> }
  | { type: "SET_PRINT_DIALOG"; open: boolean }
  | { type: "NEW_DOCUMENT" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_DOCUMENT":
      return { ...state, document: action.document, selection: null };
    case "SET_PARAMS_TEXT":
      return { ...state, paramsText: action.text };
    case "ADD_ENTITY":
      return { ...state, document: { ...state.document, entities: [...state.document.entities, action.entity] } };
    case "UPDATE_ENTITY":
      return {
        ...state,
        document: {
          ...state.document,
          entities: state.document.entities.map((e) => (e.id === action.id ? action.entity : e)),
        },
      };
    case "REMOVE_ENTITY":
      return {
        ...state,
        document: {
          ...state.document,
          entities: state.document.entities.filter((e) => e.id !== action.id),
          dimensions: state.document.dimensions.filter((d) => !dimensionTargetsEntity(d, action.id)),
        },
        selection: state.selection?.kind === "entity" && state.selection.id === action.id ? null : state.selection,
      };
    case "ADD_DIMENSION":
      return { ...state, document: { ...state.document, dimensions: [...state.document.dimensions, action.dimension] } };
    case "UPDATE_DIMENSION":
      return {
        ...state,
        document: {
          ...state.document,
          dimensions: state.document.dimensions.map((d) => (d.id === action.id ? action.dimension : d)),
        },
      };
    case "REMOVE_DIMENSION":
      return { ...state, document: { ...state.document, dimensions: state.document.dimensions.filter((d) => d.id !== action.id) } };
    case "SET_SELECTION":
      return { ...state, selection: action.selection };
    case "SET_TOOL":
      return { ...state, tool: action.tool, selection: null };
    case "SET_VIEWPORT":
      return { ...state, viewport: { ...state.viewport, ...action.viewport } };
    case "SET_PRINT_DIALOG":
      return { ...state, printDialogOpen: action.open };
    case "NEW_DOCUMENT":
      return {
        ...state,
        document: { ...state.document, entities: [], dimensions: [], title: "Untitled" },
        selection: null,
      };
  }
}

function dimensionTargetsEntity(d: Dimension, entityId: string): boolean {
  const t = d.target;
  if ("entityId" in t) return t.entityId === entityId;
  if (t.kind === "pointDistance") return t.from.startsWith(`${entityId}.`) || t.to.startsWith(`${entityId}.`);
  return false;
}

function initialState(): AppState {
  return {
    document: createSampleDocument(),
    paramsText: SAMPLE_PARAMS_TEXT,
    selection: null,
    tool: "select",
    viewport: { centerX: 60, centerY: 40, zoom: 4 },
    printDialogOpen: false,
  };
}

const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<React.Dispatch<Action> | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}

export function useDispatch(): React.Dispatch<Action> {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error("useDispatch must be used within AppStateProvider");
  return ctx;
}
