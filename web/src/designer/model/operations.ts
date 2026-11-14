import type { ComponentInstance, FormDocument } from "@/generated"

import { limitProblem } from "./rules"
import { type Outline, regionAt, type Schema } from "./schema"
import { insertInstance, type Position, removeInstance } from "./tree"

/**
 * The designer's editing operations (frozen by ADR 0008). Every change the
 * designer makes to a document is one of these three, applied by
 * `applyOperation`. An operation names instances by id, never by index path,
 * and either applies completely or is refused and changes nothing.
 */
export type Operation =
  /** Puts a new instance, with everything inside it, at a position. */
  | { readonly type: "insert"; readonly instance: ComponentInstance; readonly at: Position }
  /**
   * Moves an instance, with everything inside it, to a position. `to.index`
   * is the index it ends up at: it counts the region without the instance.
   */
  | { readonly type: "move"; readonly id: string; readonly to: Position }
  /** Removes an instance and everything inside it. */
  | { readonly type: "remove"; readonly id: string }

export type Refusal =
  /** The instance, or the instance to put it in, is not in the document. */
  | "not-found"
  /** The target is not a region the form shows. */
  | "no-such-region"
  /** A container cannot go inside itself or anything it holds. */
  | "inside-itself"
  /** The instance is already there. */
  | "no-change"
  /** The server would refuse the result: nested too deep, or too large. */
  | "too-deep"
  | "too-large"

export type Applied =
  | { readonly ok: true; readonly document: FormDocument }
  | { readonly ok: false; readonly refusal: Refusal }

const refuse = (refusal: Refusal): Applied => ({ ok: false, refusal })

/** Why nothing can be put at `position`, if so. */
function targetRefusal(outline: Outline, position: Position): Refusal | null {
  if (position.parent !== null && !outline.byId.has(position.parent)) return "not-found"
  return regionAt(outline, position)?.shown ? null : "no-such-region"
}

/** The result, unless the server would refuse to read it. */
function within(document: FormDocument | null): Applied {
  if (!document) return refuse("not-found")
  const problem = limitProblem(document)
  return problem ? refuse(problem) : { ok: true, document }
}

export function applyOperation(
  document: FormDocument,
  operation: Operation,
  schema: Schema,
): Applied {
  const outline = schema.outline(document)

  switch (operation.type) {
    case "insert": {
      const refusal = targetRefusal(outline, operation.at)
      if (refusal) return refuse(refusal)
      return within(insertInstance(document, operation.instance, operation.at))
    }

    case "move": {
      const node = outline.byId.get(operation.id)
      if (!node) return refuse("not-found")
      const refusal = targetRefusal(outline, operation.to)
      if (refusal) return refuse(refusal)
      for (
        let inside = outline.byId.get(operation.to.parent ?? "");
        inside;
        inside = inside.parent ?? undefined
      ) {
        if (inside === node) return refuse("inside-itself")
      }

      const from = node.position
      const sameRegion =
        from.parent === operation.to.parent &&
        (from.parent === null || from.region === operation.to.region)
      const siblings = regionAt(outline, operation.to)?.children.length ?? 0
      // The region without the instance is one shorter when it is its own.
      const end = sameRegion ? siblings - 1 : siblings
      const index = Math.max(0, Math.min(operation.to.index, end))
      if (sameRegion && index === from.index) return refuse("no-change")

      const taken = removeInstance(document, operation.id)
      if (!taken) return refuse("not-found")
      return within(insertInstance(taken.document, node.instance, { ...operation.to, index }))
    }

    case "remove": {
      const taken = removeInstance(document, operation.id)
      return taken ? { ok: true, document: taken.document } : refuse("not-found")
    }
  }
}
