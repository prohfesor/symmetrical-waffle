import { topoSort } from "../../util/topoSort.js";
import { Entity, parseRef, PointDef } from "../types.js";

/** Ids of the entities whose named points this entity's PointDefs anchor onto. */
export function entityDependencies(entity: Entity): string[] {
  const deps: string[] = [];
  const visit = (pd: PointDef | undefined) => {
    if (pd?.kind === "anchor") deps.push(parseRef(pd.ref).entityId);
  };
  switch (entity.kind) {
    case "line":
      visit(entity.p1);
      if (entity.mode === "twoPoint") visit(entity.p2);
      break;
    case "circle":
    case "arc":
      visit(entity.center);
      break;
    case "polyline":
      visit(entity.start);
      break;
    case "rectangle":
      visit(entity.corner);
      break;
    case "mirror":
      visit(entity.axis.p1);
      visit(entity.axis.p2);
      deps.push(...entity.sources);
      break;
  }
  return deps;
}

export interface EntityOrdering {
  /** Entities in a valid resolution order (anchors resolve before whatever anchors to them). */
  order: Entity[];
  /** Entities on a circular anchor chain; these can't be resolved. */
  cyclic: Entity[];
  /** Ids used by more than one entity. Only the first entity with each id takes part in resolution. */
  duplicateIds: string[];
}

export function orderEntities(entities: readonly Entity[]): EntityOrdering {
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const unique: Entity[] = [];
  for (const entity of entities) {
    if (seen.has(entity.id)) {
      if (!duplicateIds.includes(entity.id)) duplicateIds.push(entity.id);
      continue;
    }
    seen.add(entity.id);
    unique.push(entity);
  }
  const ids = new Set(unique.map((e) => e.id));
  // A mirror's copies are named "<mirrorId>.<sourceId>"; depending on one means depending on its mirror.
  const owner = (id: string): string => {
    for (let name = id; ; name = name.slice(0, name.lastIndexOf("."))) {
      if (ids.has(name) || !name.includes(".")) return ids.has(name) ? name : id;
    }
  };
  const { order, cyclic } = topoSort(unique, (e) => e.id, (e) => entityDependencies(e).map(owner));
  return { order, cyclic, duplicateIds };
}
