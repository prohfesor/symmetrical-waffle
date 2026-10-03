import { NextFunction, Request, Response, Router } from "express";
import type { Database, DrawingRow, DrawingSummaryRow } from "../db";
import { validateDrawingPatch, validateNewDrawing } from "../validation";

/** Upper bound on saved drawings per account, so one account can't fill the database. */
export const MAX_DRAWINGS_PER_USER = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "not signed in" });
    return;
  }
  next();
}

const summaryOf = (row: DrawingSummaryRow) => ({
  id: row.id,
  title: row.title,
  visibility: row.visibility,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const fullOf = (row: DrawingRow) => ({
  ...summaryOf(row),
  document: JSON.parse(row.document_json),
  paramsText: row.params_text,
});

export function createDrawingsRouter(db: Database): Router {
  const router = Router();

  /** Loads :id, answering 404 itself when it's malformed or doesn't exist. */
  function loadDrawing(req: Request, res: Response): DrawingRow | null {
    const row = UUID.test(req.params.id) ? db.drawings.get(req.params.id) : undefined;
    if (!row) res.status(404).json({ error: "not found" });
    return row ?? null;
  }

  router.get("/", requireAuth, (req, res) => {
    res.json({ drawings: db.drawings.listByOwner(req.user!.id).map(summaryOf) });
  });

  router.post("/", requireAuth, (req, res) => {
    const input = validateNewDrawing(req.body);
    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }
    if (db.drawings.listByOwner(req.user!.id).length >= MAX_DRAWINGS_PER_USER) {
      res.status(409).json({ error: `drawing limit reached (${MAX_DRAWINGS_PER_USER})` });
      return;
    }
    const { title, document, paramsText, visibility } = input.value;
    const row = db.drawings.create({ ownerId: req.user!.id, title, documentJson: JSON.stringify(document), paramsText, visibility });
    res.status(201).json(fullOf(row));
  });

  // Readable without signing in when public -- that's what a share link is.
  router.get("/:id", (req, res) => {
    const row = loadDrawing(req, res);
    if (!row) return;
    const isOwner = req.user?.id === row.owner_id;
    if (row.visibility !== "public" && !isOwner) {
      res.status(403).json({ error: "this drawing is private" });
      return;
    }
    res.json({ ...fullOf(row), isOwner });
  });

  router.put("/:id", requireAuth, (req, res) => {
    const row = loadDrawing(req, res);
    if (!row) return;
    if (row.owner_id !== req.user!.id) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const patch = validateDrawingPatch(req.body);
    if (!patch.ok) {
      res.status(400).json({ error: patch.error });
      return;
    }
    const { document, ...rest } = patch.value;
    const updated = db.drawings.update(row.id, { ...rest, documentJson: document === undefined ? undefined : JSON.stringify(document) });
    res.json(fullOf(updated!));
  });

  router.delete("/:id", requireAuth, (req, res) => {
    const row = loadDrawing(req, res);
    if (!row) return;
    if (!db.drawings.delete(row.id, req.user!.id)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
