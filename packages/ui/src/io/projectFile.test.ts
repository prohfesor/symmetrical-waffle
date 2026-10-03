import { createEmptyDocument } from "@pcad/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { takeDraft, saveDraftBeforeRedirect } from "./localDraft.js";
import { normalizeDocument, parseProject, ProjectFormatError, serializeProject } from "./projectFile.js";

const doc = () => ({ ...createEmptyDocument(), title: "T" });

describe("project files", () => {
  it("round-trips a project", () => {
    const parsed = parseProject(serializeProject(doc(), "w = 1\n"));
    expect(parsed.document).toEqual(doc());
    expect(parsed.paramsText).toBe("w = 1\n");
  });

  it.each([
    ["not JSON", "{{{", /not valid JSON/],
    ["JSON null", "null", /Not a parametric CAD project/],
    ["a JSON array", "[]", /drawing is missing/],
    ["no document", "{}", /drawing is missing/],
    ["a document without entity lists", JSON.stringify({ document: { title: "x" } }), /no entities\/dimensions/],
    ["a newer project format", JSON.stringify({ formatVersion: 99, document: doc() }), /newer version/],
    ["a newer document format", JSON.stringify({ document: { ...doc(), formatVersion: 99 } }), /newer version/],
  ])("rejects %s with a clear error", (_name, text, message) => {
    expect(() => parseProject(text)).toThrow(ProjectFormatError);
    expect(() => parseProject(text)).toThrow(message);
  });

  it("REGRESSION: a project without paramsText loads with empty params instead of undefined", () => {
    expect(parseProject(JSON.stringify({ document: doc() })).paramsText).toBe("");
  });

  it("fills in optional document fields that older files lack", () => {
    const { layers, units } = normalizeDocument({ entities: [], dimensions: [] });
    expect(layers).toHaveLength(1);
    expect(units).toBe("mm");
  });
});

describe("local draft (survives the sign-in redirect)", () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  afterEach(() => store.clear());

  it("restores the draft exactly once", () => {
    saveDraftBeforeRedirect({ document: doc(), paramsText: "a = 2" });
    expect(takeDraft()).toEqual({ document: doc(), paramsText: "a = 2" });
    expect(takeDraft()).toBeNull();
  });

  it("returns null for nothing saved or for a corrupt draft (and discards the corpse)", () => {
    expect(takeDraft()).toBeNull();
    store.set("pcad:draft", "{oops");
    expect(takeDraft()).toBeNull();
    expect(store.has("pcad:draft")).toBe(false);
    store.set("pcad:draft", JSON.stringify({ document: "nope" }));
    expect(takeDraft()).toBeNull();
  });
});
