import type { Project } from "../state/reducer.js";
import { normalizeDocument } from "./projectFile.js";

/**
 * A share link that carries the drawing itself in the URL fragment
 * (`#/s/<compressed project>`), so it needs no server: whoever opens it gets their own copy.
 * The fragment is never sent over the network.
 */
const PREFIX = "#/s/";
/** Refuse absurd links before inflating them (a compressed-bomb guard) and keep generated links usable. */
const MAX_DECOMPRESSED_BYTES = 5 * 1024 * 1024;
export const MAX_SNAPSHOT_LINK_LENGTH = 100_000;

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, maxBytes = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      void reader.cancel();
      throw new Error("This link's contents are too large to open");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** The fragment (including the leading "#/s/") that encodes `project`. */
export async function encodeSnapshot(project: Project): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, document: project.document, paramsText: project.paramsText }));
  const packed = await pipe(json, new CompressionStream("deflate-raw"));
  const fragment = PREFIX + toBase64Url(packed);
  if (fragment.length > MAX_SNAPSHOT_LINK_LENGTH) throw new Error("This drawing is too large for a share link; save it to a file instead");
  return fragment;
}

export function isSnapshotHash(hash: string): boolean {
  return hash.startsWith(PREFIX);
}

/** Reads a project back out of a snapshot fragment. Throws a readable error for anything that isn't one. */
export async function decodeSnapshot(hash: string): Promise<Project> {
  if (!isSnapshotHash(hash)) throw new Error("Not a snapshot link");
  let data: { document?: unknown; paramsText?: unknown };
  try {
    const json = await pipe(fromBase64Url(hash.slice(PREFIX.length)), new DecompressionStream("deflate-raw"), MAX_DECOMPRESSED_BYTES);
    data = JSON.parse(new TextDecoder().decode(json));
  } catch (err) {
    if (err instanceof Error && /too large/.test(err.message)) throw err;
    throw new Error("This share link is damaged or incomplete", { cause: err });
  }
  return { document: normalizeDocument(data.document), paramsText: typeof data.paramsText === "string" ? data.paramsText : "" };
}

export async function snapshotUrlFor(project: Project): Promise<string> {
  return `${window.location.origin}${window.location.pathname}${await encodeSnapshot(project)}`;
}
