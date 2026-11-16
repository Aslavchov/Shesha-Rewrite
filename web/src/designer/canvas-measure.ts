import {
  type Axis,
  type Box,
  type CanvasLayout,
  regionKey,
  type RegionLayout,
  sameBox,
} from "./canvas-geometry"
import { REGION_SWITCH_ATTRIBUTE, SLOT_ATTRIBUTE } from "@/forms/runtime"

import { ROOT_REGION } from "./model/tree"

/**
 * Reads a `CanvasLayout` from the rendered form.
 *
 * In design mode the designer puts an element around every instance. It has
 * no box of its own (`display: contents`), so the component is laid out
 * exactly as in the running form; it is there only to be found. An instance's
 * box is the box of what it renders, and a region's element is the element
 * its instances are children of: the one the component put them in.
 */

/** On the element around an instance; its value is the instance id. */
export const ITEM_ATTRIBUTE = "data-design-item"
/** On the drop target shown in a region with nothing in it. */
export const EMPTY_ATTRIBUTE = "data-design-empty"

/** The box an element draws, relative to `origin`. Null if it draws nothing. */
function boxOf(element: Element, origin: DOMRect): Box | null {
  if (!element.hasAttribute(ITEM_ATTRIBUTE)) {
    const { left, top, width, height } = element.getBoundingClientRect()
    if (width === 0 && height === 0) return null
    return { left: left - origin.left, top: top - origin.top, width, height }
  }
  // No box of its own: it covers what its children cover.
  let union: Box | null = null
  for (const child of element.children) {
    const box = boxOf(child, origin)
    if (!box) continue
    if (!union) {
      union = box
      continue
    }
    const left = Math.min(union.left, box.left)
    const top = Math.min(union.top, box.top)
    union = {
      left,
      top,
      width: Math.max(union.left + union.width, box.left + box.width) - left,
      height: Math.max(union.top + union.height, box.top + box.height) - top,
    }
  }
  return union
}

/** A box less the element's padding. An element with no box of its own has none. */
function inside(element: Element, box: Box): Box {
  if (element.hasAttribute(ITEM_ATTRIBUTE)) return box
  const style = getComputedStyle(element)
  const left = Number.parseFloat(style.paddingLeft) || 0
  const right = Number.parseFloat(style.paddingRight) || 0
  const top = Number.parseFloat(style.paddingTop) || 0
  const bottom = Number.parseFloat(style.paddingBottom) || 0
  return {
    left: box.left + left,
    top: box.top + top,
    width: Math.max(0, box.width - left - right),
    height: Math.max(0, box.height - top - bottom),
  }
}

function axisOf(element: Element): Axis {
  const style = getComputedStyle(element)
  return style.display.includes("flex") && style.flexDirection.startsWith("row")
    ? "horizontal"
    : "vertical"
}

/**
 * Measures the form rendered inside `form`. Boxes are relative to the
 * top-left corner of `origin`, so they stay true while the canvas scrolls.
 */
export function measureCanvas(form: Element, origin: Element): CanvasLayout {
  const from = origin.getBoundingClientRect()
  const items = new Map<string, Box>()
  const regions = new Map<string, RegionLayout>()

  function region(key: string, element: Element, empty: Box | null) {
    if (regions.has(key)) return
    const box = boxOf(element, from)
    if (box) regions.set(key, { box, axis: axisOf(element), empty, inner: inside(element, box) })
  }

  for (const item of form.querySelectorAll(`[${ITEM_ATTRIBUTE}]`)) {
    const box = boxOf(item, from)
    if (box) items.set(item.getAttribute(ITEM_ATTRIBUTE) ?? "", box)
    // The region it is in is whatever element holds it.
    const parent = item.parentElement?.closest(`[${ITEM_ATTRIBUTE}]`)
    const name = item.getAttribute("data-region") ?? ROOT_REGION
    if (item.parentElement) {
      region(
        regionKey(parent?.getAttribute(ITEM_ATTRIBUTE) ?? null, name),
        item.parentElement,
        null,
      )
    }
  }
  for (const empty of form.querySelectorAll<HTMLElement>(`[${EMPTY_ATTRIBUTE}]`)) {
    const key = regionKey(empty.dataset.parent || null, empty.dataset.region ?? ROOT_REGION)
    if (empty.parentElement) region(key, empty.parentElement, boxOf(empty, from))
  }
  return { items, regions }
}

export function sameLayout(a: CanvasLayout, b: CanvasLayout): boolean {
  if (a.items.size !== b.items.size || a.regions.size !== b.regions.size) return false
  for (const [id, box] of a.items) {
    const other = b.items.get(id)
    if (!other || !sameBox(box, other)) return false
  }
  for (const [key, region] of a.regions) {
    const other = b.regions.get(key)
    if (!other || other.axis !== region.axis || !sameBox(region.box, other.box)) return false
    if ((region.empty === null) !== (other.empty === null)) return false
    if (region.empty && other.empty && !sameBox(region.empty, other.empty)) return false
  }
  return true
}

/** An element that switches a container to one of its regions: a tab. */
export type RegionSwitch = { readonly owner: string; readonly region: string; readonly box: Box }

/** The instance an element belongs to: the innermost instance around it. */
const ownerOf = (element: Element) =>
  element.closest(`[${ITEM_ATTRIBUTE}]`)?.getAttribute(ITEM_ATTRIBUTE) ?? null

/**
 * The region switches drawn in the form (Tabs' tabs), each with the
 * container it belongs to. Ones that draw nothing are left out.
 */
export function measureSwitches(form: Element, origin: Element): RegionSwitch[] {
  const from = origin.getBoundingClientRect()
  const switches: RegionSwitch[] = []
  for (const element of form.querySelectorAll(`[${REGION_SWITCH_ATTRIBUTE}]`)) {
    const owner = ownerOf(element)
    const box = boxOf(element, from)
    if (owner && box) {
      switches.push({ owner, region: element.getAttribute(REGION_SWITCH_ATTRIBUTE) ?? "", box })
    }
  }
  return switches
}

/** The boxes of one slot of one instance: one per element that is that part, drawn now. */
export function measureSlot(form: Element, origin: Element, id: string, slot: string): Box[] {
  const from = origin.getBoundingClientRect()
  const boxes: Box[] = []
  for (const element of form.querySelectorAll(`[${SLOT_ATTRIBUTE}="${slot}"]`)) {
    if (ownerOf(element) !== id) continue
    const box = boxOf(element, from)
    if (box) boxes.push(box)
  }
  return boxes
}

/** Whether an element paints a box of its own: a border, a background or a shadow. */
function paintsBox(element: Element): boolean {
  if (element.matches("input, select, textarea, button")) return true
  const style = getComputedStyle(element)
  const hasBorder = (["Top", "Right", "Bottom", "Left"] as const).some(
    (side) =>
      style[`border${side}Style`] !== "none" && Number.parseFloat(style[`border${side}Width`]) > 0,
  )
  // No colour at all, or one with no alpha: `rgba(…, 0)`, or `… / 0)` in the newer syntaxes.
  const hasBackground = !/^(|transparent|rgba\(.*,\s*0\)|.*\/\s*0\))$/.test(style.backgroundColor)
  return hasBorder || hasBackground || (style.boxShadow !== "" && style.boxShadow !== "none")
}

/**
 * What an element puts on the page, in the window's coordinates: its box
 * when it paints one, and otherwise only as far as its content reaches. A
 * label or a help text is often as wide as its component while its words
 * end long before; what is beside the words is free. Null if it draws nothing.
 */
export function inkOf(element: Element): Box | null {
  const box = element.getBoundingClientRect()
  if (box.width === 0 && box.height === 0) return null
  const whole = { left: box.left, top: box.top, width: box.width, height: box.height }
  if (paintsBox(element)) return whole
  const range = element.ownerDocument.createRange()
  range.selectNodeContents(element)
  // Not every DOM measures ranges (the one the unit tests run in does not).
  if (typeof range.getClientRects !== "function") return whole
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const rect of range.getClientRects()) {
    if (rect.width === 0 && rect.height === 0) continue
    left = Math.min(left, rect.left)
    top = Math.min(top, rect.top)
    right = Math.max(right, rect.right)
    bottom = Math.max(bottom, rect.bottom)
  }
  if (left === Infinity) return whole
  // Never more than the element's own box: content that overflows is not its ink to keep.
  left = Math.max(left, box.left)
  top = Math.max(top, box.top)
  right = Math.min(right, box.right)
  bottom = Math.min(bottom, box.bottom)
  return right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : whole
}

/**
 * The other parts of the instance a pointed part belongs to, as far as each
 * is drawn: what its name tag must not cover. A part around the pointed one,
 * or inside it, is not another part to keep clear of: the tag is drawn
 * outside the pointed one. When the slot is drawn more than once (the options
 * of a group), the ones after the first count too: the tag belongs to the first.
 */
export function measureOtherParts(form: Element, origin: Element, id: string, slot: string): Box[] {
  const from = origin.getBoundingClientRect()
  const parts = [...form.querySelectorAll(`[${SLOT_ATTRIBUTE}]`)].filter(
    (element) => ownerOf(element) === id,
  )
  const tagged = parts.find(
    (element) => element.getAttribute(SLOT_ATTRIBUTE) === slot && boxOf(element, from) !== null,
  )
  const boxes: Box[] = []
  for (const element of parts) {
    if (element === tagged) continue
    if (tagged && (element.contains(tagged) || tagged.contains(element))) continue
    const ink = inkOf(element)
    if (ink) boxes.push({ ...ink, left: ink.left - from.left, top: ink.top - from.top })
  }
  return boxes
}

/** The box of any element of the canvas, in the same coordinates. Null if it draws nothing. */
export function measureElement(element: Element | null, origin: Element): Box | null {
  return element ? boxOf(element, origin.getBoundingClientRect()) : null
}

export const sameBoxes = (a: readonly Box[], b: readonly Box[]) =>
  a.length === b.length && a.every((box, index) => sameBox(box, b[index]))

export const sameSwitches = (a: readonly RegionSwitch[], b: readonly RegionSwitch[]) =>
  a.length === b.length &&
  a.every(
    (one, index) =>
      one.owner === b[index].owner &&
      one.region === b[index].region &&
      sameBox(one.box, b[index].box),
  )
