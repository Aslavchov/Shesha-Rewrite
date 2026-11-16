import type { PropertyDefinition } from "@/generated"

import type { Position } from "../model/tree"
import type { Surface } from "../store"

/**
 * Drag and drop for the designer, on Pointer Events (ADR 0008).
 *
 * One controller serves the toolbox, the canvas and the outline. A drag
 * source says what is being dragged; each drop surface says which place a
 * point is over and where to draw the indicator; the designer says whether
 * that place would accept the drop. The controller owns the rest: when a
 * press becomes a drag, following the pointer, scrolling near edges, Escape,
 * and the click that follows a drop.
 */

export type DragSource =
  /** A new instance of a component type, from the toolbox. */
  | {
      readonly kind: "new"
      readonly component: string
      /** The entity property the new instance is for, from the data panel (Phase 5). */
      readonly property?: PropertyDefinition
    }
  /** An instance already in the form. */
  | { readonly kind: "existing"; readonly id: string }

/** A rectangle in viewport coordinates. */
export type Box = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** A place under the pointer, as a surface found it. */
export type DropCandidate = {
  /** Where the instance would go, counting every instance on screen, the dragged one included. */
  readonly position: Position
  /** A line between two instances, or a box around a region with nothing in it. */
  readonly indicator: { readonly shape: "line" | "box"; readonly box: Box }
  /** The region the position is in, to highlight it. Null for the form's own list. */
  readonly region: Box | null
}

export type DropSurface = {
  /** Which view this is; handed back with a drop that landed on it. */
  readonly name: Surface
  readonly element: HTMLElement
  /** The place under a point of the viewport, or null where there is none. */
  readonly locate: (x: number, y: number) => DropCandidate | null
}

export type DragState = {
  readonly source: DragSource
  /** The pointer, in viewport coordinates. */
  readonly x: number
  readonly y: number
  /** Where the drop would land. Null over anything that would refuse it. */
  readonly target: (DropCandidate & { readonly to: Position; readonly surface: Surface }) | null
}

export type DragHost = {
  /**
   * Whether `source` may be dropped at `position`. Returns the position to
   * hand to the editor (which counts a region without the dragged instance),
   * or null when the drop would be refused or would change nothing.
   */
  readonly accept: (source: DragSource, position: Position) => Position | null
  /** `surface` is the view the instance was dropped on. */
  readonly drop: (source: DragSource, to: Position, surface: Surface) => void
}

/** How far the pointer travels before a press becomes a drag, so that a click stays a click. */
const START_DISTANCE = 5
/** How close to the top or bottom of a scrolling area the pointer starts to scroll it. */
const SCROLL_ZONE = 56
/** The fastest scroll, in pixels per frame. */
const SCROLL_SPEED = 22

/** Marks an element as a scrolling area that a drag may scroll. */
export const SCROLL_AREA_ATTRIBUTE = "data-drag-scroll"
/** Set on <html> while a drag is in progress, for the cursor and to stop text selection. */
const DRAGGING_ATTRIBUTE = "data-dragging"

export class DragController {
  readonly #host: DragHost
  readonly #surfaces = new Set<DropSurface>()
  readonly #listeners = new Set<() => void>()
  #state: DragState | null = null
  #frame = 0
  /** Whether the pointer or the page moved since the last frame. */
  #stale = false
  #lastKey: string | null = null
  #lastTo: Position | null = null
  #cancel: (() => void) | null = null

  constructor(host: DragHost) {
    this.#host = host
  }

  readonly getState = (): DragState | null => this.#state

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Adds a surface that drops can land on. Returns the function that removes it. */
  register(surface: DropSurface): () => void {
    this.#surfaces.add(surface)
    return () => {
      this.#surfaces.delete(surface)
    }
  }

  /** Stops a drag in progress, dropping nothing. */
  cancel(): void {
    this.#cancel?.()
  }

  /**
   * Call from `pointerdown` on something that can be dragged. Nothing happens
   * until the pointer has moved a little; a press that never does is a click.
   */
  press(
    source: DragSource,
    event: {
      button: number
      clientX: number
      clientY: number
      pointerId: number
      pointerType: string
    },
  ): void {
    // Touch scrolls; dragging is for a mouse or a pen. The primary button only.
    if (event.button !== 0 || event.pointerType === "touch" || this.#cancel) return

    const { pointerId } = event
    const start = { x: event.clientX, y: event.clientY }
    let dragging = false

    const move = (moved: PointerEvent) => {
      if (moved.pointerId !== pointerId) return
      if (!dragging) {
        if (Math.hypot(moved.clientX - start.x, moved.clientY - start.y) < START_DISTANCE) return
        dragging = true
        this.#begin(source, moved.clientX, moved.clientY)
      }
      this.#state = this.#state && { ...this.#state, x: moved.clientX, y: moved.clientY }
      this.#stale = true
    }
    const finish = (drop: boolean) => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", release)
      window.removeEventListener("pointercancel", abandon)
      window.removeEventListener("keydown", key, true)
      window.removeEventListener("scroll", scrolled, true)
      window.removeEventListener("blur", abandon)
      this.#cancel = null
      if (dragging) this.#end(drop)
    }
    const release = (released: PointerEvent) => {
      if (released.pointerId === pointerId) finish(true)
    }
    const abandon = () => finish(false)
    const key = (pressed: KeyboardEvent) => {
      if (!dragging) return
      // While dragging, the keyboard belongs to the drag: Escape ends it, and
      // no shortcut may change the document underneath it.
      pressed.preventDefault()
      pressed.stopPropagation()
      if (pressed.key !== "Escape") return
      abandon()
      // The button is still down. Letting go of it must not count as a click.
      window.addEventListener("pointerup", suppressNextClick, { capture: true, once: true })
    }
    const scrolled = () => {
      this.#stale = true
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", release)
    window.addEventListener("pointercancel", abandon)
    window.addEventListener("keydown", key, true)
    window.addEventListener("scroll", scrolled, true)
    window.addEventListener("blur", abandon)
    this.#cancel = abandon
  }

  #begin(source: DragSource, x: number, y: number) {
    document.documentElement.setAttribute(DRAGGING_ATTRIBUTE, "")
    window.getSelection()?.removeAllRanges()
    this.#lastKey = null
    this.#lastTo = null
    this.#set({ source, x, y, target: null })
    this.#stale = true
    this.#frame = requestAnimationFrame(this.#tick)
  }

  #end(drop: boolean) {
    cancelAnimationFrame(this.#frame)
    document.documentElement.removeAttribute(DRAGGING_ATTRIBUTE)
    const state = this.#state
    if (!state) return

    // Where the pointer is now, not where it was a frame ago.
    const target = drop ? this.#targetAt(state) : null
    this.#set(null)
    if (drop) suppressNextClick()
    if (target) this.#host.drop(state.source, target.to, target.surface)
  }

  readonly #tick = () => {
    this.#frame = requestAnimationFrame(this.#tick)
    const state = this.#state
    if (!state) return
    if (scrollNear(state.x, state.y)) this.#stale = true
    if (!this.#stale) return
    this.#stale = false
    this.#set({ ...state, target: this.#targetAt(state) })
  }

  #targetAt(state: DragState): DragState["target"] {
    let candidate: DropCandidate | null = null
    let over: Surface | null = null
    for (const surface of this.#surfaces) {
      const box = surface.element.getBoundingClientRect()
      const inside =
        state.x >= box.left && state.x <= box.right && state.y >= box.top && state.y <= box.bottom
      if (inside) {
        candidate = surface.locate(state.x, state.y)
        over = surface.name
        break
      }
    }
    if (!candidate || !over) return null

    // Asking the editor is the costly part, and most frames stay over the same place.
    const { parent, region, index } = candidate.position
    const key = `${parent ?? ""}/${region}/${index}`
    if (key !== this.#lastKey) {
      this.#lastKey = key
      this.#lastTo = this.#host.accept(state.source, candidate.position)
    }
    return this.#lastTo ? { ...candidate, to: this.#lastTo, surface: over } : null
  }

  #set(state: DragState | null) {
    this.#state = state
    for (const listener of this.#listeners) listener()
  }
}

/**
 * Scrolls the scrolling area the pointer is in when the pointer is near its
 * top or bottom edge, faster the nearer it is. Returns whether it scrolled.
 */
function scrollNear(x: number, y: number): boolean {
  for (const area of document.querySelectorAll<HTMLElement>(`[${SCROLL_AREA_ATTRIBUTE}]`)) {
    const box = area.getBoundingClientRect()
    if (x < box.left || x > box.right) continue

    const above = box.top + SCROLL_ZONE - y
    const below = y - (box.bottom - SCROLL_ZONE)
    const pull = above > 0 ? -above : below > 0 ? below : 0
    if (pull === 0) continue

    const before = area.scrollTop
    const speed = Math.ceil((Math.min(Math.abs(pull), SCROLL_ZONE) / SCROLL_ZONE) * SCROLL_SPEED)
    area.scrollTop = before + Math.sign(pull) * speed
    if (area.scrollTop !== before) return true
  }
  return false
}

/** The browser sends a click after the press that ended a drag. It must not count as one. */
function suppressNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener("click", swallow, { capture: true, once: true })
  // If no click comes (the pointer was released somewhere else), stop waiting.
  window.setTimeout(() => window.removeEventListener("click", swallow, true))
}
