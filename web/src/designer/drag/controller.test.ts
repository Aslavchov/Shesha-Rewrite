import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { rootPosition } from "../model/tree"
import { DragController, type DragHost, type DropCandidate, type DragSource } from "./controller"

/** Runs the animation frames the controller has asked for. */
let frames: FrameRequestCallback[] = []
const frame = () => {
  const due = frames
  frames = []
  for (const callback of due) callback(0)
}

const SOURCE: DragSource = { kind: "new", component: "text-field" }

const candidate = (index: number): DropCandidate => ({
  position: rootPosition(index),
  indicator: { shape: "line", box: { left: 0, top: index * 10, width: 100, height: 2 } },
  region: null,
})

function setup(accepts: (index: number) => boolean = () => true) {
  const host = {
    accept: vi.fn<DragHost["accept"]>((_source, position) =>
      accepts(position.index) ? position : null,
    ),
    drop: vi.fn<DragHost["drop"]>(),
  }
  const controller = new DragController(host)
  const element = document.createElement("div")
  document.body.append(element)
  // The surface covers the left 500 pixels; the index under a point is its y in tens.
  element.getBoundingClientRect = () => new DOMRect(0, 0, 500, 500)
  controller.register({
    name: "canvas",
    element,
    locate: (_x, y) => (y < 0 ? null : candidate(Math.floor(y / 10))),
  })

  const pointer = (type: string, x: number, y: number) =>
    window.dispatchEvent(
      new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }) as PointerEvent,
    )
  const press = (x = 600, y = 20, button = 0, pointerType = "mouse") =>
    controller.press(SOURCE, { button, clientX: x, clientY: y, pointerId: 1, pointerType })
  return { controller, host, element, pointer, press }
}

// jsdom's pointer events carry no pointerId; the controller's press uses 1.
beforeEach(() => {
  frames = []
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal("cancelAnimationFrame", () => {
    frames = []
  })
  Object.defineProperty(MouseEvent.prototype, "pointerId", { configurable: true, value: 1 })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  document.documentElement.removeAttribute("data-dragging")
})

describe("the drag controller", () => {
  it("does nothing on a press that never moves: that is a click", () => {
    const { controller, host, pointer, press } = setup()

    press()
    pointer("pointermove", 602, 21)
    pointer("pointerup", 602, 21)

    expect(controller.getState()).toBeNull()
    expect(host.drop).not.toHaveBeenCalled()
  })

  it("becomes a drag once the pointer has travelled, and follows it", () => {
    const { controller, pointer, press } = setup()
    const listener = vi.fn()
    controller.subscribe(listener)

    press()
    pointer("pointermove", 590, 30)
    expect(controller.getState()).toMatchObject({ source: SOURCE, target: null })
    expect(document.documentElement).toHaveAttribute("data-dragging")

    pointer("pointermove", 100, 45)
    frame()
    expect(controller.getState()).toMatchObject({ x: 100, y: 45 })
    expect(controller.getState()?.target).toMatchObject({
      position: rootPosition(4),
      to: rootPosition(4),
      surface: "canvas",
    })
    expect(listener).toHaveBeenCalled()
  })

  it("drops where the pointer is released, on the surface it is over", () => {
    const { controller, host, pointer, press } = setup()

    press()
    pointer("pointermove", 100, 45)
    frame()
    pointer("pointermove", 100, 72)
    pointer("pointerup", 100, 72)

    expect(host.drop).toHaveBeenCalledExactlyOnceWith(SOURCE, rootPosition(7), "canvas")
    expect(controller.getState()).toBeNull()
    expect(document.documentElement).not.toHaveAttribute("data-dragging")
  })

  it("has no target, and drops nothing, where the host refuses", () => {
    const { controller, host, pointer, press } = setup((index) => index !== 3)

    press()
    pointer("pointermove", 100, 35)
    frame()
    expect(controller.getState()?.target).toBeNull()

    pointer("pointerup", 100, 35)
    expect(host.drop).not.toHaveBeenCalled()
  })

  it("has no target off every surface, or where the surface finds no place", () => {
    const { controller, host, pointer, press } = setup()

    press()
    pointer("pointermove", 700, 300)
    frame()
    expect(controller.getState()?.target).toBeNull()
    expect(host.accept).not.toHaveBeenCalled()

    pointer("pointerup", 700, 300)
    expect(host.drop).not.toHaveBeenCalled()
  })

  it("asks the host once per place, not once per frame", () => {
    const { host, pointer, press } = setup()

    press()
    for (const y of [41, 43, 45, 47]) {
      pointer("pointermove", 100, y)
      frame()
    }
    expect(host.accept).toHaveBeenCalledOnce()

    pointer("pointermove", 100, 55)
    frame()
    expect(host.accept).toHaveBeenCalledTimes(2)
  })

  it("Escape ends the drag and drops nothing, even when the button is let go later", () => {
    const { controller, host, pointer, press } = setup()

    press()
    pointer("pointermove", 100, 45)
    frame()
    const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    window.dispatchEvent(escape)

    expect(escape.defaultPrevented).toBe(true)
    expect(controller.getState()).toBeNull()
    pointer("pointerup", 100, 45)
    expect(host.drop).not.toHaveBeenCalled()
  })

  it("keeps other keys from reaching the designer while dragging", () => {
    const { pointer, press } = setup()
    const heard = vi.fn()
    document.body.addEventListener("keydown", heard)

    press()
    pointer("pointermove", 100, 45)
    const key = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    })
    document.body.dispatchEvent(key)

    expect(heard).not.toHaveBeenCalled()
    pointer("pointerup", 100, 45)
    document.body.removeEventListener("keydown", heard)
  })

  it("swallows the click that follows a drop, and only that one", () => {
    const { pointer, press } = setup()
    const clicked = vi.fn()
    document.body.addEventListener("click", clicked)

    press()
    pointer("pointermove", 100, 45)
    pointer("pointerup", 100, 45)
    document.body.click()
    expect(clicked).not.toHaveBeenCalled()

    document.body.click()
    expect(clicked).toHaveBeenCalledOnce()
    document.body.removeEventListener("click", clicked)
  })

  it("ignores every button but the primary one, and touch", () => {
    const { controller, pointer, press } = setup()

    press(600, 20, 2)
    pointer("pointermove", 100, 45)
    expect(controller.getState()).toBeNull()

    press(600, 20, 0, "touch")
    pointer("pointermove", 100, 45)
    expect(controller.getState()).toBeNull()
  })

  it("cancel stops a drag from outside", () => {
    const { controller, host, pointer, press } = setup()
    press()
    pointer("pointermove", 100, 45)

    controller.cancel()

    expect(controller.getState()).toBeNull()
    pointer("pointerup", 100, 45)
    expect(host.drop).not.toHaveBeenCalled()
  })

  it("scrolls a scrolling area when the pointer is near its top or bottom edge", () => {
    const { pointer, press } = setup()
    const area = document.createElement("div")
    area.setAttribute("data-drag-scroll", "")
    area.getBoundingClientRect = () => new DOMRect(0, 100, 500, 400)
    document.body.append(area)
    area.scrollTop = 300

    press()
    pointer("pointermove", 100, 110)
    frame()
    expect(area.scrollTop).toBeLessThan(300)
    const afterUp = area.scrollTop

    // In the middle, nothing scrolls.
    pointer("pointermove", 100, 300)
    frame()
    expect(area.scrollTop).toBe(afterUp)

    pointer("pointermove", 100, 495)
    frame()
    expect(area.scrollTop).toBeGreaterThan(afterUp)
    pointer("pointerup", 100, 495)
  })
})
