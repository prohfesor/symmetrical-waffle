import { contextBridge, ipcRenderer } from "electron";

/** Mirrors ui/src/io/nativeBridge.ts (the renderer-side contract); keep the two in step. */
interface FilterSpec {
  name: string;
  extensions: string[];
}

const wafflecadNative = {
  saveText: (opts: { defaultName: string; content: string; filters: FilterSpec[] }) => ipcRenderer.invoke("file:saveText", opts),
  saveBinary: (opts: { defaultName: string; data: Uint8Array; filters: FilterSpec[] }) => ipcRenderer.invoke("file:saveBinary", opts),
  openText: (opts: { filters: FilterSpec[] }) => ipcRenderer.invoke("file:openText", opts),
  setDirty: (dirty: boolean) => ipcRenderer.send("app:setDirty", dirty),
  onMenuAction: (callback: (action: string) => void) => {
    const listener = (_event: unknown, action: string) => callback(action);
    ipcRenderer.on("menu:action", listener);
    return () => ipcRenderer.removeListener("menu:action", listener);
  },
};

contextBridge.exposeInMainWorld("wafflecadNative", wafflecadNative);

export type WafflecadNativeBridge = typeof wafflecadNative;
