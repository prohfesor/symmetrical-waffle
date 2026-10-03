import { Entity } from "@pcad/core";
import { describe, expect, it } from "vitest";
import { Action, AppState, createInitialState, isDirty, reducer } from "./reducer.js";

const line = (id: string): Entity => ({ id, kind: "line", mode: "twoPoint", p1: { kind: "free", x: 0, y: 0 }, p2: { kind: "free", x: 10, y: 0 } });
const run = (state: AppState, ...actions: Action[]) => actions.reduce(reducer, state);

describe("reducer", () => {
  it("starts clean, and any edit makes the project dirty", () => {
    const start = createInitialState();
    expect(isDirty(start)).toBe(false);
    expect(isDirty(run(start, { type: "ADD_ENTITY", entity: line("a") }))).toBe(true);
    expect(isDirty(run(start, { type: "SET_PARAMS_TEXT", text: "x = 1" }))).toBe(true);
    expect(isDirty(run(start, { type: "SET_DOCUMENT_TITLE", title: "Renamed" }))).toBe(true);
  });

  it("is clean again after MARK_SAVED, and can record the new cloud copy in the same step", () => {
    const edited = run(createInitialState(), { type: "ADD_ENTITY", entity: line("a") });
    const saved = run(edited, { type: "MARK_SAVED", binding: { id: "c1", visibility: "private", isOwner: true } });
    expect(isDirty(saved)).toBe(false);
    expect(saved.cloudBinding?.id).toBe("c1");
    // Without a binding argument the existing link is kept.
    expect(run(saved, { type: "ADD_ENTITY", entity: line("b") }, { type: "MARK_SAVED" }).cloudBinding?.id).toBe("c1");
  });

  describe("LOAD_PROJECT", () => {
    const loaded = { document: { ...createInitialState().document, title: "Loaded", entities: [line("z")] }, paramsText: "w = 5" };

    it("replaces document and params together, resets selection, and is not dirty", () => {
      const state = run(createInitialState(), { type: "SET_SELECTION", selection: { kind: "entity", id: "rect1" } }, { type: "LOAD_PROJECT", project: loaded, binding: null });
      expect(state.document.title).toBe("Loaded");
      expect(state.paramsText).toBe("w = 5");
      expect(state.selection).toBeNull();
      expect(isDirty(state)).toBe(false);
    });

    it("REGRESSION: opening a local file drops the old cloud link, so Save can't overwrite an unrelated cloud project", () => {
      const linked = run(createInitialState(), { type: "SET_CLOUD_BINDING", binding: { id: "c1", visibility: "public", isOwner: true } });
      expect(run(linked, { type: "LOAD_PROJECT", project: loaded, binding: null }).cloudBinding).toBeNull();
      expect(run(linked, { type: "LOAD_PROJECT", project: loaded, binding: { id: "c2", visibility: "private", isOwner: false } }).cloudBinding?.id).toBe("c2");
    });
  });

  it("NEW_PROJECT clears drawing, params and cloud link atomically, keeping units", () => {
    const state = run(
      createInitialState(),
      { type: "SET_CLOUD_BINDING", binding: { id: "c1", visibility: "public", isOwner: true } },
      { type: "NEW_PROJECT" },
    );
    expect(state.document.entities).toEqual([]);
    expect(state.document.dimensions).toEqual([]);
    expect(state.document.title).toBe("Untitled");
    expect(state.paramsText).toMatch(/^# params\.txt/);
    expect(state.cloudBinding).toBeNull();
    expect(isDirty(state)).toBe(false);
  });

  describe("removing things", () => {
    it("removing an entity also removes its dimensions, and clears its selection", () => {
      const start = createInitialState();
      const hole = start.document.dimensions.find((d) => "entityId" in d.target && d.target.entityId === "hole1")!;
      const state = run(start, { type: "SET_SELECTION", selection: { kind: "entity", id: "hole1" } }, { type: "REMOVE_ENTITY", id: "hole1" });
      expect(state.document.entities.map((e) => e.id)).not.toContain("hole1");
      expect(state.document.dimensions.map((d) => d.id)).not.toContain(hole.id);
      expect(state.selection).toBeNull();
    });

    it("removing an entity removes dimensions that measure between its points", () => {
      const state = run(createInitialState(), { type: "REMOVE_ENTITY", id: "rect1" });
      expect(state.document.dimensions.map((d) => d.id)).toEqual(["dim_hole"]); // dim_w and dim_h referenced rect1.*
    });

    it("keeps the selection when something else is removed", () => {
      const state = run(createInitialState(), { type: "SET_SELECTION", selection: { kind: "entity", id: "rect1" } }, { type: "REMOVE_ENTITY", id: "hole1" });
      expect(state.selection).toEqual({ kind: "entity", id: "rect1" });
    });

    it("removing a selected dimension clears the selection", () => {
      const state = run(createInitialState(), { type: "SET_SELECTION", selection: { kind: "dimension", id: "dim_w" } }, { type: "REMOVE_DIMENSION", id: "dim_w" });
      expect(state.selection).toBeNull();
    });
  });

  it("UPDATE_ENTITY replaces only the matching entity", () => {
    const start = createInitialState();
    const next = line("hole1");
    const state = run(start, { type: "UPDATE_ENTITY", id: "hole1", entity: next });
    expect(state.document.entities.find((e) => e.id === "hole1")).toBe(next);
    expect(state.document.entities.find((e) => e.id === "rect1")).toBe(start.document.entities[0]);
  });

  it("choosing a tool clears the selection; re-choosing the same tool is a no-op", () => {
    const selected = run(createInitialState(), { type: "SET_SELECTION", selection: { kind: "entity", id: "rect1" } });
    expect(run(selected, { type: "SET_TOOL", tool: "line" }).selection).toBeNull();
    expect(run(selected, { type: "SET_TOOL", tool: "select" })).toBe(selected);
  });

  it("signing out drops the cloud link but signing in keeps it", () => {
    const user = { id: "u", email: "a@b.c", name: null, avatarUrl: null };
    const linked = run(createInitialState(), { type: "SET_CLOUD_BINDING", binding: { id: "c1", visibility: "private", isOwner: true } });
    expect(run(linked, { type: "SET_CLOUD_USER", user, loginMode: "dev" }).cloudBinding?.id).toBe("c1");
    const out = run(linked, { type: "SET_CLOUD_USER", user: null, loginMode: "dev" });
    expect(out.cloudBinding).toBeNull();
    expect(out.cloudLoginMode).toBe("dev");
  });

  it("toggles the snaps independently", () => {
    const state = run(createInitialState(), { type: "TOGGLE_GRID_SNAP" });
    expect([state.objectSnap, state.gridSnap]).toEqual([true, false]);
  });

  describe("mirrors", () => {
    const mirror: Entity = { id: "m1", kind: "mirror", axis: { p1: { kind: "free", x: 0, y: 0 }, p2: { kind: "free", x: 0, y: 1 } }, sources: ["rect1", "hole1"] };
    const withMirror = () => run(createInitialState(), { type: "ADD_ENTITY", entity: mirror });

    it("deleting a source removes it from the mirror's list, and the mirror stays", () => {
      const state = run(withMirror(), { type: "REMOVE_ENTITY", id: "hole1" });
      expect(state.document.entities.find((e) => e.id === "m1")).toMatchObject({ sources: ["rect1"] });
    });

    it("deleting a source removes dimensions on its mirrored copy", () => {
      const state = run(
        withMirror(),
        { type: "ADD_DIMENSION", dimension: { id: "dm", target: { kind: "circleRadius", entityId: "m1.hole1" }, displayOffset: 3 } },
        { type: "REMOVE_ENTITY", id: "hole1" },
      );
      expect(state.document.dimensions.map((d) => d.id)).not.toContain("dm");
    });

    it("deleting the mirror removes dimensions on its copies, and clears its selection", () => {
      const state = run(
        withMirror(),
        { type: "ADD_DIMENSION", dimension: { id: "dm", target: { kind: "circleRadius", entityId: "m1.hole1" }, displayOffset: 3 } },
        { type: "SET_SELECTION", selection: { kind: "entity", id: "m1" } },
        { type: "REMOVE_ENTITY", id: "m1" },
      );
      expect(state.document.dimensions.map((d) => d.id)).not.toContain("dm");
      expect(state.selection).toBeNull();
    });

    it("leaves unrelated dimensions alone", () => {
      const state = run(withMirror(), { type: "REMOVE_ENTITY", id: "m1" });
      expect(state.document.dimensions.map((d) => d.id)).toContain("dim_hole");
    });
  });
});
