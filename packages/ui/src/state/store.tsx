import { FullResolveResult, resolveFullDocument } from "@pcad/core";
import React, { createContext, useContext, useMemo, useReducer } from "react";
import { Action, AppState, createInitialState, reducer } from "./reducer.js";

export type { Action, AppState, CloudBinding, Project, Selection, Viewport } from "./reducer.js";

const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<React.Dispatch<Action> | null>(null);
const ResolvedContext = createContext<FullResolveResult | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  // Resolved once per edit and shared, instead of every panel re-resolving the whole drawing.
  const resolved = useMemo(() => resolveFullDocument(state.document, state.paramsText), [state.document, state.paramsText]);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        <ResolvedContext.Provider value={resolved}>{children}</ResolvedContext.Provider>
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

function required<T>(value: T | null, hook: string): T {
  if (value === null) throw new Error(`${hook} must be used within AppStateProvider`);
  return value;
}

export function useAppState(): AppState {
  return required(useContext(StateContext), "useAppState");
}

export function useDispatch(): React.Dispatch<Action> {
  return required(useContext(DispatchContext), "useDispatch");
}

/** The current document resolved against its params (computed once per edit). */
export function useResolvedDrawing(): FullResolveResult {
  return required(useContext(ResolvedContext), "useResolvedDrawing");
}
