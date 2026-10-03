import { createEmptyDocument } from "@wafflecad/core";
import { describe, expect, it } from "vitest";
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
