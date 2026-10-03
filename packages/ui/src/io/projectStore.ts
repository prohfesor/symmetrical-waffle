import type { DrawingDocument } from "@pcad/core";
import * as cloudApi from "./cloudApi.js";
import type { CloudDrawingFull, CloudDrawingSummary } from "./cloudApi.js";
import { localStore } from "./localStore.js";

export type StoredProjectSummary = CloudDrawingSummary;
export type StoredProject = CloudDrawingFull;
export type Visibility = "private" | "public";

/** Where saved projects live. Everything the editor does with saved projects goes through this interface. */
export interface ProjectStore {
  list(): Promise<StoredProjectSummary[]>;
  get(id: string): Promise<StoredProject>;
  create(title: string, document: DrawingDocument, paramsText: string): Promise<StoredProject>;
  update(
    id: string,
    fields: Partial<{ title: string; document: DrawingDocument; paramsText: string; visibility: Visibility }>,
  ): Promise<StoredProject>;
  remove(id: string): Promise<void>;
}

/** The signed-in account's projects on @pcad/server. */
export const serverStore: ProjectStore = {
  list: async () => (await cloudApi.listMyDrawings()).drawings,
  get: cloudApi.getCloudDrawing,
  create: (title, document, paramsText) => cloudApi.createCloudDrawing(title, document, paramsText, "private"),
  update: cloudApi.updateCloudDrawing,
  remove: cloudApi.deleteCloudDrawing,
};

/**
 * How projects are stored in this deployment:
 *  - "account": on the server, per signed-in user, with private/public sharing
 *  - "local":   in this browser (IndexedDB); no server, no sign-in -- what a static host such as GitHub Pages can offer
 *
 * A future hosted backend (Supabase, Firebase, ...) is one more ProjectStore implementation.
 */
export type StorageMode = "account" | "local";

export function storeFor(mode: StorageMode): ProjectStore {
  return mode === "local" ? localStore : serverStore;
}

/** Set at build time: `VITE_STORAGE=local` builds the static, server-less flavour. */
export const BUILT_FOR_LOCAL_STORAGE = import.meta.env.VITE_STORAGE === "local";
