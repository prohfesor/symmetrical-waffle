import { FullResolveResult, resolveFullDocument } from "@pcad/core";
import { useMemo } from "react";
import { useAppState } from "./store.js";

export function useResolvedDrawing(): FullResolveResult {
  const state = useAppState();
  return useMemo(() => resolveFullDocument(state.document, state.paramsText), [state.document, state.paramsText]);
}
