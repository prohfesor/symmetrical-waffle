import { app, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, Menu, shell } from "electron";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const uiEntry = path.join(__dirname, "../../ui/dist/index.html");

/** Shared with the renderer through preload.ts and ui/src/io/nativeBridge.ts; keep the three in step. */
interface FilterSpec {
  name: string;
  extensions: string[];
}

/** Windows whose renderer reported unsaved changes. */
const dirtyWindows = new WeakSet<BrowserWindow>();

function windowFor(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

function sendMenuAction(action: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  win?.webContents.send("menu:action", action);
}

/** True if the URL is the app's own page (the built UI file or the dev server) rather than somewhere to navigate away to. */
function isAppUrl(url: string): boolean {
  if (devServerUrl) return url.startsWith(devServerUrl);
  return url.startsWith("file://");
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The renderer only ever shows our own UI: never let it navigate elsewhere or spawn windows.
  win.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  // Closing with unsaved changes needs an explicit decision; the renderer keeps us informed via app:setDirty.
  win.on("close", (event) => {
    if (!dirtyWindows.has(win)) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Cancel", "Discard changes"],
      defaultId: 0,
      cancelId: 0,
      message: "You have unsaved changes.",
      detail: "Closing now will lose them.",
    });
    if (choice === 0) event.preventDefault();
  });

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(uiEntry);
  }
  return win;
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        { label: "New", accelerator: "CmdOrCtrl+N", click: () => sendMenuAction("new") },
        { label: "Open...", accelerator: "CmdOrCtrl+O", click: () => sendMenuAction("open") },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => sendMenuAction("save") },
        { type: "separator" },
        { label: "Export DXF...", click: () => sendMenuAction("exportDxf") },
        { label: "Print / Export PDF...", accelerator: "CmdOrCtrl+P", click: () => sendMenuAction("print") },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// A reload (or the dev server restarting) starts from a clean slate, so forget any stale dirty flag.
app.on("web-contents-created", (_event, contents) => {
  contents.on("did-start-navigation", () => {
    const win = BrowserWindow.fromWebContents(contents);
    if (win) dirtyWindows.delete(win);
  });
});

ipcMain.on("app:setDirty", (event, dirty: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (dirty) dirtyWindows.add(win);
  else dirtyWindows.delete(win);
});

async function chooseSavePath(event: IpcMainInvokeEvent, defaultName: string, filters: FilterSpec[]): Promise<string | null> {
  const options = { defaultPath: defaultName, filters };
  const win = windowFor(event);
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

ipcMain.handle("file:saveText", async (event, opts: { defaultName: string; content: string; filters: FilterSpec[] }) => {
  const filePath = await chooseSavePath(event, opts.defaultName, opts.filters);
  if (!filePath) return { canceled: true };
  await fs.writeFile(filePath, opts.content, "utf-8");
  return { canceled: false, path: filePath };
});

ipcMain.handle("file:saveBinary", async (event, opts: { defaultName: string; data: Uint8Array; filters: FilterSpec[] }) => {
  const filePath = await chooseSavePath(event, opts.defaultName, opts.filters);
  if (!filePath) return { canceled: true };
  await fs.writeFile(filePath, Buffer.from(opts.data));
  return { canceled: false, path: filePath };
});

ipcMain.handle("file:openText", async (event, opts: { filters: FilterSpec[] }) => {
  const options = { filters: opts.filters, properties: ["openFile" as const] };
  const win = windowFor(event);
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const filePath = result.filePaths[0];
  return { canceled: false, path: filePath, content: await fs.readFile(filePath, "utf-8") };
});
