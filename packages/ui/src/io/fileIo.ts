import { DrawingDocument } from "@pcad/core";
import { isDesktop } from "./nativeBridge.js";
import { parseProject, ProjectFile, serializeProject } from "./projectFile.js";

function download(filename: string, data: BlobPart, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Save/open/export helpers that use native OS file dialogs inside the Electron
 * desktop shell (via the `pcadNative` bridge from the preload script) and fall
 * back to browser downloads/file pickers otherwise -- same file formats either way.
 *
 * The save/export functions resolve to false when the user cancelled the dialog.
 */
async function saveText(defaultName: string, content: string, mime: string, filterName: string, extensions: string[]): Promise<boolean> {
  if (isDesktop()) {
    const result = await window.pcadNative!.saveText({ defaultName, content, filters: [{ name: filterName, extensions }] });
    return !result.canceled;
  }
  download(defaultName, content, mime);
  return true;
}

export function saveProjectFile(defaultName: string, document: DrawingDocument, paramsText: string): Promise<boolean> {
  return saveText(defaultName, serializeProject(document, paramsText), "application/json", "Parametric CAD Project", ["pcad.json", "json"]);
}

export function exportDxfFile(defaultName: string, dxf: string): Promise<boolean> {
  return saveText(defaultName, dxf, "application/dxf", "DXF Drawing", ["dxf"]);
}

export async function exportPdfFile(defaultName: string, bytes: Uint8Array): Promise<boolean> {
  if (isDesktop()) {
    const result = await window.pcadNative!.saveBinary({
      defaultName,
      data: bytes,
      filters: [{ name: "PDF Document", extensions: ["pdf"] }],
    });
    return !result.canceled;
  }
  download(defaultName, bytes as BlobPart, "application/pdf");
  return true;
}

/** Lets the user pick a project file; null if they cancel. Throws ProjectFormatError for a file that isn't a project. */
export async function openProjectFile(): Promise<ProjectFile | null> {
  if (isDesktop()) {
    const result = await window.pcadNative!.openText({ filters: [{ name: "Parametric CAD Project", extensions: ["json"] }] });
    return result.canceled || result.content === undefined ? null : parseProject(result.content);
  }
  const file = await pickTextFile(".pcad.json,.json,application/json");
  return file ? parseProject(file.text) : null;
}

export function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: String(reader.result) });
      reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
      reader.readAsText(file);
    };
    input.click();
  });
}
