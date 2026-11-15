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
    if (box) regions.set(key, { box, axis: axisOf(element), empty })
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
