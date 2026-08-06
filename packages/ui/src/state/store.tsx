import { Dimension, DrawingDocument, Entity } from "@pcad/core";
import React, { createContext, useContext, useReducer } from "react";
import { CloudUser } from "../io/cloudApi.js";
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

/** The current drawing's link to a saved cloud copy, if any. */
export interface CloudBinding {
  id: string;
  visibility: "private" | "public";
  /** False when this was opened from someone else's public share link -- saving creates a new copy instead of overwriting theirs. */
  isOwner: boolean;
}

export interface AppState {
  document: DrawingDocument;
  paramsText: string;
  selection: Selection;
  tool: ToolId;
  viewport: Viewport;
  printDialogOpen: boolean;
  cloudUser: CloudUser | null;
  cloudDevMode: boolean;
  cloudBinding: CloudBinding | null;
  projectsPanelOpen: boolean;
  loginDialogOpen: boolean;
  helpDialogOpen: boolean;
  /** Snap new points to existing geometry (line endpoints, circle centers, ...). */
  objectSnap: boolean;
  /** Snap new points to the nearest 1mm grid intersection when object snap didn't find anything closer. */
  gridSnap: boolean;
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
  | { type: "NEW_DOCUMENT" }
  | { type: "SET_DOCUMENT_TITLE"; title: string }
  | { type: "SET_CLOUD_USER"; user: CloudUser | null; devMode: boolean }
  | { type: "SET_CLOUD_BINDING"; binding: CloudBinding | null }
  | { type: "SET_PROJECTS_PANEL"; open: boolean }
  | { type: "SET_LOGIN_DIALOG"; open: boolean }
  | { type: "SET_HELP_DIALOG"; open: boolean }
  | { type: "TOGGLE_OBJECT_SNAP" }
  | { type: "TOGGLE_GRID_SNAP" };

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
        cloudBinding: null,
      };
    case "SET_DOCUMENT_TITLE":
      return { ...state, document: { ...state.document, title: action.title } };
    case "SET_CLOUD_USER":
      return { ...state, cloudUser: action.user, cloudDevMode: action.devMode };
    case "SET_CLOUD_BINDING":
      return { ...state, cloudBinding: action.binding };
    case "SET_PROJECTS_PANEL":
      return { ...state, projectsPanelOpen: action.open };
    case "SET_LOGIN_DIALOG":
      return { ...state, loginDialogOpen: action.open };
    case "SET_HELP_DIALOG":
      return { ...state, helpDialogOpen: action.open };
    case "TOGGLE_OBJECT_SNAP":
      return { ...state, objectSnap: !state.objectSnap };
    case "TOGGLE_GRID_SNAP":
      return { ...state, gridSnap: !state.gridSnap };
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
    cloudUser: null,
    cloudDevMode: false,
    cloudBinding: null,
    projectsPanelOpen: false,
    loginDialogOpen: false,
    helpDialogOpen: false,
    objectSnap: true,
    gridSnap: true,
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
