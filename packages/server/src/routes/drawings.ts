import { Request, Response, NextFunction, Router } from "express";
import { createDrawing, deleteDrawing, DrawingRow, getDrawing, listDrawingsForOwner, updateDrawing } from "../db";

export const drawingsRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "not signed in" });
    return;
  }
  next();
}

function toApi(row: DrawingRow) {
  return {
    id: row.id,
    title: row.title,
    document: JSON.parse(row.document_json),
    paramsText: row.params_text,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApiSummary(row: Omit<DrawingRow, "document_json" | "params_text">) {
  return {
    id: row.id,
    title: row.title,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

drawingsRouter.get("/", requireAuth, (req, res) => {
  res.json({ drawings: listDrawingsForOwner(req.user!.id).map(toApiSummary) });
});

drawingsRouter.post("/", requireAuth, (req, res) => {
  const { title, document, paramsText, visibility } = req.body ?? {};
  if (typeof title !== "string" || !document || typeof paramsText !== "string") {
    res.status(400).json({ error: "title, document, and paramsText are required" });
    return;
  }
  const row = createDrawing({
    ownerId: req.user!.id,
    title,
    documentJson: JSON.stringify(document),
    paramsText,
    visibility: visibility === "public" ? "public" : "private",
  });
  res.status(201).json(toApi(row));
});

drawingsRouter.get("/:id", (req, res) => {
  const row = getDrawing(req.params.id);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const isOwner = req.user?.id === row.owner_id;
  if (row.visibility !== "public" && !isOwner) {
    res.status(403).json({ error: "this drawing is private" });
    return;
  }
  res.json({ ...toApi(row), isOwner });
});

drawingsRouter.put("/:id", requireAuth, (req, res) => {
  const existing = getDrawing(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (existing.owner_id !== req.user!.id) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const { title, document, paramsText, visibility } = req.body ?? {};
  const updated = updateDrawing(req.params.id, {
    title: typeof title === "string" ? title : undefined,
    documentJson: document ? JSON.stringify(document) : undefined,
    paramsText: typeof paramsText === "string" ? paramsText : undefined,
    visibility: visibility === "public" || visibility === "private" ? visibility : undefined,
  });
  res.json(toApi(updated!));
});

drawingsRouter.delete("/:id", requireAuth, (req, res) => {
  const ok = deleteDrawing(req.params.id, req.user!.id);
  if (!ok) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ ok: true });
});
