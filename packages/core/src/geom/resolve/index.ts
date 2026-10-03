import { computeBounds } from "../bounds.js";
import { ResolvedDimension, ResolvedDrawing, ResolvedEntity, ResolveIssue } from "../resolved-types.js";
import { DrawingDocument } from "../types.js";
import { resolveDimension } from "./dimensions.js";
import { EntityResolver, ParamScope } from "./entities.js";
import { orderEntities } from "./order.js";

export type { ParamScope } from "./entities.js";

/**
 * Resolves a document's formulas, anchors and dimensions into absolute
 * geometry. Never throws: problems are reported in `issues` and the affected
 * entity/dimension is left out, so one bad formula doesn't blank the drawing.
 * Entities come back in document order (which is also draw order).
 */
export function resolveDocument(doc: DrawingDocument, params: ParamScope): ResolvedDrawing {
  const resolver = new EntityResolver(params);
  const { order, cyclic, duplicateIds } = orderEntities(doc.entities);

  const structuralIssues: ResolveIssue[] = [
    ...duplicateIds.map((id) => ({ entityId: id, message: `Entity id '${id}' is used more than once; only the first is drawn` })),
    ...cyclic.map((e) => ({ entityId: e.id, message: `Entity '${e.id}' is part of a circular anchor reference` })),
  ];

  order.forEach((entity) => resolver.resolve(entity));

  const entities: ResolvedEntity[] = [];
  const emitted = new Set<string>();
  for (const { id } of doc.entities) {
    if (emitted.has(id)) continue;
    emitted.add(id);
    // A mirror stands in for its copies at its own position in the draw order.
    const resolved = resolver.mirrorOutputs.get(id) ?? [resolver.entities.get(id)].filter((e): e is ResolvedEntity => !!e);
    entities.push(...resolved);
  }

  const dimensions: ResolvedDimension[] = [];
  for (const dim of doc.dimensions) {
    const resolved = resolveDimension(dim, resolver);
    if (resolved) dimensions.push(resolved);
  }

  return {
    entities,
    dimensions,
    axes: doc.entities.flatMap((e) => resolver.axes.filter((a) => a.id === e.id)),
    namedPoints: resolver.namedPoints,
    issues: [...structuralIssues, ...resolver.issues],
    bounds: computeBounds(entities, dimensions),
  };
}
