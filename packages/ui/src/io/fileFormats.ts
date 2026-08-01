import { DrawingDocument } from "@pcad/core";
import { isDesktop } from "./nativeBridge.js";

export const PROJECT_FORMAT_VERSION = 1;

export interface ProjectFile {
  formatVersion: number;
  document: DrawingDocument;
  paramsText: string;
}

/** Project files bundle the drawing and its params text together for convenience; the params text within is the same plain "name = expression" format usable standalone (see Export/Import params.txt). */
export function serializeProject(document: DrawingDocument, paramsText: string): string {
  const project: ProjectFile = { formatVersion: PROJECT_FORMAT_VERSION, document, paramsText };
  return JSON.stringify(project, null, 2);
}

export function parseProject(text: string): ProjectFile {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || !data.document) {
    throw new Error("Not a valid parametric CAD project file");
  }
  return data as ProjectFile;
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadBinaryFile(filename: string, bytes: Uint8Array, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Save/open/export helpers that use native OS file dialogs when running inside
 * the Electron desktop shell (via the `pcadNative` bridge exposed by the
 * preload script), and fall back to browser downloads/file pickers otherwise
 * -- same file formats either way, per {@link ProjectFile}.
 */
export async function saveProjectFile(defaultName: string, document: DrawingDocument, paramsText: string): Promise<void> {
  const content = serializeProject(document, paramsText);
  if (isDesktop()) {
    await window.pcadNative!.saveText({ defaultName, content, filters: [{ name: "Parametric CAD Project", extensions: ["pcad.json", "json"] }] });
  } else {
    downloadTextFile(defaultName, content, "application/json");
  }
}

export async function openProjectFile(): Promise<ProjectFile | null> {
  if (isDesktop()) {
    const result = await window.pcadNative!.openText({ filters: [{ name: "Parametric CAD Project", extensions: ["json"] }] });
    if (result.canceled || !result.content) return null;
    return parseProject(result.content);
  }
  const file = await pickTextFile(".pcad.json,.json,application/json");
  if (!file) return null;
  return parseProject(file.text);
}

export async function exportDxfFile(defaultName: string, dxf: string): Promise<void> {
  if (isDesktop()) {
    await window.pcadNative!.saveText({ defaultName, content: dxf, filters: [{ name: "DXF Drawing", extensions: ["dxf"] }] });
  } else {
    downloadTextFile(defaultName, dxf, "application/dxf");
  }
}

export async function exportPdfFile(defaultName: string, bytes: Uint8Array): Promise<void> {
  if (isDesktop()) {
    await window.pcadNative!.saveBinary({ defaultName, data: bytes, filters: [{ name: "PDF Document", extensions: ["pdf"] }] });
  } else {
    downloadBinaryFile(defaultName, bytes, "application/pdf");
  }
}

export function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: String(reader.result) });
      reader.readAsText(file);
    };
    input.click();
  });
}
