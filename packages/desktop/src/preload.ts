import { contextBridge, ipcRenderer } from "electron";

interface FilterSpec {
  name: string;
  extensions: string[];
}

const pcadNative = {
  saveText: (opts: { defaultName: string; content: string; filters: FilterSpec[] }) => ipcRenderer.invoke("file:saveText", opts),
  saveBinary: (opts: { defaultName: string; data: Uint8Array; filters: FilterSpec[] }) => ipcRenderer.invoke("file:saveBinary", opts),
  openText: (opts: { filters: FilterSpec[] }) => ipcRenderer.invoke("file:openText", opts),
  onMenuAction: (callback: (action: string) => void) => {
    const listener = (_event: unknown, action: string) => callback(action);
    ipcRenderer.on("menu:action", listener);
    return () => ipcRenderer.removeListener("menu:action", listener);
  },
};

contextBridge.exposeInMainWorld("pcadNative", pcadNative);

export type PcadNativeBridge = typeof pcadNative;
