import "fake-indexeddb/auto";
import { createEmptyDocument } from "@pcad/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAutosave, readAutosave, writeAutosave } from "./autosave.js";
import { localStore } from "./localStore.js";
import { decodeSnapshot, encodeSnapshot, isSnapshotHash, MAX_SNAPSHOT_LINK_LENGTH } from "./snapshotLink.js";

const doc = (title = "Plate") => ({ ...createEmptyDocument(), title });

describe("localStore (projects kept in the browser)", () => {
  it("creates, lists (newest first), reads, updates and deletes", async () => {
    const a = await localStore.create("A", doc("A"), "w = 1");
    await new Promise((r) => setTimeout(r, 5));
    const b = await localStore.create("B", doc("B"), "w = 2");

    expect((await localStore.list()).map((p) => p.title).slice(0, 2)).toEqual(["B", "A"]);
    expect((await localStore.list())[0]).not.toHaveProperty("document"); // summaries only

    expect(await localStore.get(a.id)).toMatchObject({ title: "A", paramsText: "w = 1", visibility: "private", isOwner: true, document: doc("A") });

    await new Promise((r) => setTimeout(r, 5));
    const updated = await localStore.update(a.id, { title: "A2", paramsText: "w = 9" });
    expect(updated).toMatchObject({ title: "A2", paramsText: "w = 9", document: doc("A") }); // untouched fields survive
    expect(updated.updatedAt > a.updatedAt).toBe(true);
    expect((await localStore.list())[0].id).toBe(a.id); // an update moves it to the top

    await localStore.remove(b.id);
    await expect(localStore.get(b.id)).rejects.toThrow(/no longer/);
  });

  it("can't be made public: nothing leaves the browser", async () => {
    const p = await localStore.create("X", doc(), "");
    expect((await localStore.update(p.id, { visibility: "public" })).visibility).toBe("private");
  });

  it("rejects updating a project that no longer exists", async () => {
    await expect(localStore.update("nope", { title: "t" })).rejects.toThrow(/no longer/);
  });
});

describe("snapshot links", () => {
  it("round-trips a project through a URL fragment", async () => {
    const project = { document: { ...doc(), entities: [{ id: "c", kind: "circle" as const, center: { kind: "free" as const, x: "=w", y: 0 }, radius: 3 }] }, paramsText: "w = 5\n# ünïcode ⌀\n" };
    const fragment = await encodeSnapshot(project);
    expect(isSnapshotHash(fragment)).toBe(true);
    expect(fragment).toMatch(/^#\/s\/[A-Za-z0-9_-]+$/); // URL-safe, no padding
    expect(await decodeSnapshot(fragment)).toEqual(project);
  });

  it("compresses: a repetitive drawing is far smaller than its JSON", async () => {
    const entities = Array.from({ length: 200 }, (_, i) => ({ id: `l${i}`, kind: "line" as const, mode: "twoPoint" as const, p1: { kind: "free" as const, x: i, y: 0 }, p2: { kind: "free" as const, x: i, y: 10 } }));
    const project = { document: { ...doc(), entities }, paramsText: "" };
    expect((await encodeSnapshot(project)).length).toBeLessThan(JSON.stringify(project).length / 3);
  });

  it("refuses to make an oversized link", async () => {
    const noise = Array.from({ length: 200_000 }, () => Math.random().toString(36)).join("");
    await expect(encodeSnapshot({ document: doc(), paramsText: noise })).rejects.toThrow(/too large/);
    expect(MAX_SNAPSHOT_LINK_LENGTH).toBeGreaterThan(0);
  });

  it.each([
    ["not a snapshot", "#/d/abc", /Not a snapshot/],
    ["garbage", "#/s/!!!!", /damaged/],
    ["valid base64 that isn't deflate data", "#/s/aGVsbG8gd29ybGQ", /damaged/],
    ["a truncated link", "#/s/", /damaged/],
  ])("rejects %s with a readable error", async (_name, hash, message) => {
    await expect(decodeSnapshot(hash)).rejects.toThrow(message);
  });

  it("rejects a snapshot whose contents aren't a drawing", async () => {
    const fragment = await encodeSnapshot({ document: doc(), paramsText: "" });
    // Swap in a payload with a malformed document by encoding it ourselves.
    const bad = new Blob([JSON.stringify({ document: { nope: 1 } })]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const bytes = new Uint8Array(await new Response(bad).arrayBuffer());
    const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await expect(decodeSnapshot(`#/s/${b64}`)).rejects.toThrow(/Not a parametric CAD project/);
    expect(fragment).toBeTruthy();
  });

  it("won't inflate a decompression bomb", async () => {
    const zeros = new Blob([new Uint8Array(20 * 1024 * 1024)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const bytes = new Uint8Array(await new Response(zeros).arrayBuffer());
    const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await expect(decodeSnapshot(`#/s/${b64}`)).rejects.toThrow(/too large/);
  });
});

describe("autosave", () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  afterEach(() => store.clear());

  it("keeps the working copy and its saved-copy link, until cleared", () => {
    const binding = { id: "p1", visibility: "private" as const, isOwner: true };
    writeAutosave({ document: doc(), paramsText: "a = 1" }, binding);
    expect(readAutosave()).toEqual({ document: doc(), paramsText: "a = 1", binding });
    clearAutosave();
    expect(readAutosave()).toBeNull();
  });

  it("survives reading more than once (reading doesn't consume it)", () => {
    writeAutosave({ document: doc(), paramsText: "" }, null);
    expect(readAutosave()).not.toBeNull();
    expect(readAutosave()).not.toBeNull();
  });

  it("discards a corrupt entry instead of failing", () => {
    store.set("pcad:autosave", "{oops");
    expect(readAutosave()).toBeNull();
    expect(store.has("pcad:autosave")).toBe(false);
    store.set("pcad:autosave", JSON.stringify({ document: "nope" }));
    expect(readAutosave()).toBeNull();
  });

  it("tolerates unavailable storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } });
    expect(() => writeAutosave({ document: doc(), paramsText: "" }, null)).not.toThrow();
    expect(readAutosave()).toBeNull();
    expect(() => clearAutosave()).not.toThrow();
  });
});
