import { createEmptyDocument, Dimension, DrawingDocument, Entity } from "@pcad/core";
import type { CloudUser, LoginMode } from "../io/cloudApi.js";
import { BUILT_FOR_LOCAL_STORAGE, StorageMode } from "../io/projectStore.js";
import { createSampleDocument } from "../sample/sampleDocument.js";
import { BLANK_PARAMS_TEXT, SAMPLE_PARAMS_TEXT } from "../sample/sampleParams.js";
import type { ToolId } from "../tools/types.js";

export type Selection = { kind: "entity"; id: string } | { kind: "dimension"; id: string } | null;

export interface Viewport {
  /** Document-space point currently at the center of the canvas. */
  centerX: number;
  centerY: number;
  /** Screen pixels per one document millimeter. */
  zoom: number;
}

/** The current drawing's link to its saved copy in the active store (the account's projects, or this browser's), if any. */
export interface CloudBinding {
  id: string;
  visibility: "private" | "public";
  /** False when this was opened from someone else's public share link -- saving creates a new copy instead of overwriting theirs. */
  isOwner: boolean;
}

/** A drawing together with its params text: the unit that is saved, loaded and compared for unsaved changes. */
export interface Project {
  document: DrawingDocument;
  paramsText: string;
}

export interface AppState extends Project {
  /** The project as last loaded or saved; differing from the current one means unsaved changes. */
  baseline: Project;
  selection: Selection;
  tool: ToolId;
  viewport: Viewport;
  printDialogOpen: boolean;
  /** Where saved projects live; "local" has no accounts or sign-in at all. */
  storage: StorageMode;
  cloudUser: CloudUser | null;
  cloudLoginMode: LoginMode;
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
  // Whole-project changes. Each is atomic, so the document, its params and its cloud link can never get out of step.
  /** `restored` marks work recovered from autosave: it is loaded but still counts as unsaved. */
  | { type: "LOAD_PROJECT"; project: Project; binding: CloudBinding | null; restored?: boolean }
  | { type: "NEW_PROJECT" }
  | { type: "MARK_SAVED"; binding?: CloudBinding | null }
  // Editing
  | { type: "SET_PARAMS_TEXT"; text: string }
  | { type: "SET_DOCUMENT_TITLE"; title: string }
  | { type: "ADD_ENTITY"; entity: Entity }
  | { type: "UPDATE_ENTITY"; id: string; entity: Entity }
  | { type: "REMOVE_ENTITY"; id: string }
  | { type: "ADD_DIMENSION"; dimension: Dimension }
  | { type: "UPDATE_DIMENSION"; id: string; dimension: Dimension }
  | { type: "REMOVE_DIMENSION"; id: string }
  // View / tools
  | { type: "SET_SELECTION"; selection: Selection }
  | { type: "SET_TOOL"; tool: ToolId }
  | { type: "SET_VIEWPORT"; viewport: Partial<Viewport> }
  | { type: "TOGGLE_OBJECT_SNAP" }
  | { type: "TOGGLE_GRID_SNAP" }
  // Chrome
  | { type: "SET_PRINT_DIALOG"; open: boolean }
  | { type: "SET_PROJECTS_PANEL"; open: boolean }
  | { type: "SET_LOGIN_DIALOG"; open: boolean }
  | { type: "SET_HELP_DIALOG"; open: boolean }
  // Account
  | { type: "SET_STORAGE"; storage: StorageMode }
  | { type: "SET_CLOUD_USER"; user: CloudUser | null; loginMode: LoginMode }
  | { type: "SET_CLOUD_BINDING"; binding: CloudBinding | null };

export const DEFAULT_VIEWPORT: Viewport = { centerX: 60, centerY: 40, zoom: 4 };

export function createInitialState(): AppState {
  const project: Project = { document: createSampleDocument(), paramsText: SAMPLE_PARAMS_TEXT };
  return {
    ...project,
    baseline: project,
    selection: null,
    tool: "select",
    viewport: DEFAULT_VIEWPORT,
    printDialogOpen: false,
    storage: BUILT_FOR_LOCAL_STORAGE ? "local" : "account",
    cloudUser: null,
    cloudLoginMode: "google",
    cloudBinding: null,
    projectsPanelOpen: false,
    loginDialogOpen: false,
    helpDialogOpen: false,
    objectSnap: true,
    gridSnap: true,
  };
}

export function isDirty(state: AppState): boolean {
  // Edits always produce new objects, so identity comparison is exact and free.
  return state.document !== state.baseline.document || state.paramsText !== state.baseline.paramsText;
}

function withDocument(state: AppState, patch: Partial<DrawingDocument>): AppState {
  return { ...state, document: { ...state.document, ...patch } };
}

function dimensionTargetsEntity(d: Dimension, entityId: string): boolean {
  const t = d.target;
  // A mirror's copies are named "<mirror>.<source>", so a copy goes when either its mirror or its source does.
  const involves = (id: string) => id.split(".").includes(entityId);
  if ("entityId" in t) return involves(t.entityId);
  if (t.kind === "pointDistance") return involves(t.from) || involves(t.to);
  return false;
}

function dropSelection(selection: Selection, kind: "entity" | "dimension", id: string): Selection {
  return selection?.kind === kind && selection.id === id ? null : selection;
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LOAD_PROJECT":
      return {
        ...state,
        ...action.project,
        baseline: action.restored ? state.baseline : action.project,
        selection: null,
        cloudBinding: action.binding,
      };
    case "NEW_PROJECT": {
      const project: Project = {
        document: { ...createEmptyDocument(), units: state.document.units, title: "Untitled" },
        paramsText: BLANK_PARAMS_TEXT,
      };
      return { ...state, ...project, baseline: project, selection: null, cloudBinding: null };
    }
    case "MARK_SAVED":
      return {
        ...state,
        baseline: { document: state.document, paramsText: state.paramsText },
        cloudBinding: action.binding === undefined ? state.cloudBinding : action.binding,
      };

    case "SET_PARAMS_TEXT":
      return { ...state, paramsText: action.text };
    case "SET_DOCUMENT_TITLE":
      return withDocument(state, { title: action.title });
    case "ADD_ENTITY":
      return withDocument(state, { entities: [...state.document.entities, action.entity] });
    case "UPDATE_ENTITY":
      return withDocument(state, { entities: state.document.entities.map((e) => (e.id === action.id ? action.entity : e)) });
    case "REMOVE_ENTITY":
      return {
        ...withDocument(state, {
          entities: state.document.entities
            .filter((e) => e.id !== action.id)
            // Mirrors forget a source that has been deleted.
            .map((e) =>
              e.kind === "mirror" && e.sources.includes(action.id) ? { ...e, sources: e.sources.filter((id) => id !== action.id) } : e,
            ),
          // A dimension can't outlive the thing it measures.
          dimensions: state.document.dimensions.filter((d) => !dimensionTargetsEntity(d, action.id)),
        }),
        selection: dropSelection(state.selection, "entity", action.id),
      };
    case "ADD_DIMENSION":
      return withDocument(state, { dimensions: [...state.document.dimensions, action.dimension] });
    case "UPDATE_DIMENSION":
      return withDocument(state, { dimensions: state.document.dimensions.map((d) => (d.id === action.id ? action.dimension : d)) });
    case "REMOVE_DIMENSION":
      return {
        ...withDocument(state, { dimensions: state.document.dimensions.filter((d) => d.id !== action.id) }),
        selection: dropSelection(state.selection, "dimension", action.id),
      };

    case "SET_SELECTION":
      return { ...state, selection: action.selection };
    case "SET_TOOL":
      return action.tool === state.tool ? state : { ...state, tool: action.tool, selection: null };
    case "SET_VIEWPORT":
      return { ...state, viewport: { ...state.viewport, ...action.viewport } };
    case "TOGGLE_OBJECT_SNAP":
      return { ...state, objectSnap: !state.objectSnap };
    case "TOGGLE_GRID_SNAP":
      return { ...state, gridSnap: !state.gridSnap };

    case "SET_PRINT_DIALOG":
      return { ...state, printDialogOpen: action.open };
    case "SET_PROJECTS_PANEL":
      return { ...state, projectsPanelOpen: action.open };
    case "SET_LOGIN_DIALOG":
      return { ...state, loginDialogOpen: action.open };
    case "SET_HELP_DIALOG":
      return { ...state, helpDialogOpen: action.open };

    case "SET_STORAGE":
      // A saved-copy link only means something in the store it was made in.
      return { ...state, storage: action.storage, cloudBinding: action.storage === state.storage ? state.cloudBinding : null };
    case "SET_CLOUD_USER":
      // Signing out also drops the link to the account's saved copy.
      return { ...state, cloudUser: action.user, cloudLoginMode: action.loginMode, cloudBinding: action.user ? state.cloudBinding : null };
    case "SET_CLOUD_BINDING":
      return { ...state, cloudBinding: action.binding };
  }
}
