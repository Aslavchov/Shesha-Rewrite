import type { ComponentInstance, FormDocument, SlotStyle } from "@/generated"

import { pathsClash } from "./names"
import {
  formDescriptionProblem,
  formNameProblem,
  limitProblem,
  nameProblem,
  pathProblem,
} from "./rules"
import { type Outline, regionAt, type Schema } from "./schema"
import { allInstances, insertInstance, type Position, removeInstance, updateInstance } from "./tree"

/**
 * The designer's editing operations. Every change the designer makes to a
 * document is one of these, applied by `applyOperation`. An operation names
 * instances by id, never by index path, and either applies completely or is
 * refused and changes nothing.
 *
 * Insert, move and remove change the tree (frozen by ADR 0008). The others
 * change one instance, or the form itself, in place (Phase 3, frozen by
 * ADR 0009).
 */
export type Operation = TreeOperation | EditOperation

export type TreeOperation =
  /** Puts a new instance, with everything inside it, at a position. */
  | { readonly type: "insert"; readonly instance: ComponentInstance; readonly at: Position }
  /**
   * Moves an instance, with everything inside it, to a position. `to.index`
   * is the index it ends up at: it counts the region without the instance.
   */
  | { readonly type: "move"; readonly id: string; readonly to: Position }
  /** Removes an instance and everything inside it. */
  | { readonly type: "remove"; readonly id: string }

export type EditOperation =
  /** Gives an instance another name. Its id never changes. */
  | { readonly type: "rename"; readonly id: string; readonly name: string }
  /** Stores an input's value under another data path. */
  | { readonly type: "bind"; readonly id: string; readonly path: string }
  /**
   * Stores one setting of an instance, or of the form when `id` is null.
   * Which values are valid is the component's to say; the command that
   * builds this operation asks it first.
   */
  | {
      readonly type: "set-setting"
      readonly id: string | null
      readonly key: string
      readonly value: unknown
    }
  /** Removes one stored setting, so the default is used again (ADR 0003, D5). */
  | { readonly type: "reset-setting"; readonly id: string | null; readonly key: string }
  /**
   * Replaces the overrides of one slot. An empty style removes the slot from
   * `styles`, and `styles` goes when it was the last.
   */
  | {
      readonly type: "set-style"
      readonly id: string
      readonly slot: string
      readonly style: SlotStyle
    }
  /** Gives the form another name. */
  | { readonly type: "rename-form"; readonly name: string }
  /** Gives the form another description. Empty text removes it. */
  | { readonly type: "describe-form"; readonly description: string }

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
  /** Not a valid name, data path or form name; or one another instance has. */
  | "invalid-name"
  | "name-taken"
  | "invalid-path"
  | "path-clash"
  | "invalid-form-name"
  | "invalid-description"
  /** The instance has no data path to change: it is not an input. */
  | "not-bound"

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

    default:
      return applyEdit(document, operation, outline)
  }
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** A map with `key` set to `value`, or without `key` when `value` is undefined. */
function withKey<T>(
  map: Readonly<Record<string, T>> | undefined,
  key: string,
  value: T | undefined,
): Record<string, T> {
  const { [key]: _, ...rest } = map ?? {}
  return value === undefined ? rest : { ...rest, [key]: value }
}

/** An instance with its `settings` replaced, left out when empty. */
function withSettings(instance: ComponentInstance, settings: Record<string, unknown>) {
  const { settings: _, ...rest } = instance
  return Object.keys(settings).length > 0 ? { ...rest, settings } : rest
}

/** An instance with its `styles` replaced, left out when empty. */
function withStyles(instance: ComponentInstance, styles: Record<string, SlotStyle>) {
  const { styles: _, ...rest } = instance
  return Object.keys(styles).length > 0 ? { ...rest, styles } : rest
}

function applyEdit(document: FormDocument, operation: EditOperation, outline: Outline): Applied {
  /** Changes one instance in place, or refuses when the result is what is there. */
  function change(id: string, update: (instance: ComponentInstance) => ComponentInstance) {
    const node = outline.byId.get(id)
    if (!node) return refuse("not-found")
    const updated = update(node.instance)
    if (sameJson(updated, node.instance)) return refuse("no-change")
    return within(updateInstance(document, id, () => updated))
  }

  /** Changes the form's own fields, or refuses when the result is what is there. */
  function changeForm(updated: FormDocument) {
    return sameJson(updated, document) ? refuse("no-change") : within(updated)
  }

  switch (operation.type) {
    case "rename": {
      if (nameProblem(operation.name) !== null) return refuse("invalid-name")
      for (const other of allInstances(document)) {
        if (other.id !== operation.id && other.name === operation.name) return refuse("name-taken")
      }
      return change(operation.id, (instance) => ({ ...instance, name: operation.name }))
    }

    case "bind": {
      const node = outline.byId.get(operation.id)
      if (!node) return refuse("not-found")
      if (node.instance.bind === undefined && node.definition?.kind !== "input") {
        return refuse("not-bound")
      }
      if (pathProblem(operation.path) !== null) return refuse("invalid-path")
      for (const other of allInstances(document)) {
        if (other.id === operation.id || typeof other.bind !== "string") continue
        if (pathsClash(operation.path, other.bind)) return refuse("path-clash")
      }
      return change(operation.id, (instance) => ({ ...instance, bind: operation.path }))
    }

    case "set-setting":
    case "reset-setting": {
      const value = operation.type === "set-setting" ? operation.value : undefined
      if (operation.id === null) {
        const { settings: _, ...rest } = document
        const settings = withKey(document.settings, operation.key, value)
        return changeForm(Object.keys(settings).length > 0 ? { ...rest, settings } : rest)
      }
      return change(operation.id, (instance) =>
        withSettings(instance, withKey(instance.settings, operation.key, value)),
      )
    }

    case "set-style":
      return change(operation.id, (instance) => {
        const style = Object.keys(operation.style).length > 0 ? operation.style : undefined
        return withStyles(instance, withKey(instance.styles, operation.slot, style))
      })

    case "rename-form":
      if (formNameProblem(operation.name) !== null) return refuse("invalid-form-name")
      return changeForm({ ...document, name: operation.name })

    case "describe-form": {
      if (formDescriptionProblem(operation.description) !== null) {
        return refuse("invalid-description")
      }
      const { description: _, ...rest } = document
      return changeForm(
        operation.description === "" ? rest : { ...rest, description: operation.description },
      )
    }
  }
}
