import {
  type Axis,
  type Box,
  type CanvasLayout,
  regionKey,
  type RegionLayout,
  sameBox,
} from "./canvas-geometry"
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
