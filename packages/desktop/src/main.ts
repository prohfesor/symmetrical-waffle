import { app, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, Menu } from "electron";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const isDev = !!process.env.VITE_DEV_SERVER_URL;

interface FilterSpec {
  name: string;
  extensions: string[];
}

function windowFor(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

function sendMenuAction(action: string) {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  win?.webContents.send("menu:action", action);
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../../ui/dist/index.html"));
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
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
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

ipcMain.handle("file:saveText", async (event, opts: { defaultName: string; content: string; filters: FilterSpec[] }) => {
  const win = windowFor(event);
  const result = win ? await dialog.showSaveDialog(win, { defaultPath: opts.defaultName, filters: opts.filters }) : await dialog.showSaveDialog({ defaultPath: opts.defaultName, filters: opts.filters });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, opts.content, "utf-8");
  return { canceled: false, path: result.filePath };
});

ipcMain.handle("file:saveBinary", async (event, opts: { defaultName: string; data: Uint8Array; filters: FilterSpec[] }) => {
  const win = windowFor(event);
  const result = win ? await dialog.showSaveDialog(win, { defaultPath: opts.defaultName, filters: opts.filters }) : await dialog.showSaveDialog({ defaultPath: opts.defaultName, filters: opts.filters });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, Buffer.from(opts.data));
  return { canceled: false, path: result.filePath };
});

ipcMain.handle("file:openText", async (event, opts: { filters: FilterSpec[] }) => {
  const win = windowFor(event);
  const result = win ? await dialog.showOpenDialog(win, { filters: opts.filters, properties: ["openFile"] }) : await dialog.showOpenDialog({ filters: opts.filters, properties: ["openFile"] });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, "utf-8");
  return { canceled: false, path: filePath, content };
});
