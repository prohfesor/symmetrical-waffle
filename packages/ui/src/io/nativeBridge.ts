export interface FilterSpec {
  name: string;
  extensions: string[];
}

export interface PcadNativeBridge {
  saveText(opts: { defaultName: string; content: string; filters: FilterSpec[] }): Promise<{ canceled: boolean; path?: string }>;
  saveBinary(opts: { defaultName: string; data: Uint8Array; filters: FilterSpec[] }): Promise<{ canceled: boolean; path?: string }>;
  openText(opts: { filters: FilterSpec[] }): Promise<{ canceled: boolean; path?: string; content?: string }>;
  /** Tells the shell whether there are unsaved changes, so it can confirm before closing the window. */
  setDirty(dirty: boolean): void;
  onMenuAction(callback: (action: string) => void): () => void;
}

declare global {
  interface Window {
    pcadNative?: PcadNativeBridge;
  }
}

/** True when running inside the Electron desktop shell (vs. a plain browser). */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.pcadNative;
}
