import { afterEach, describe, expect, it } from "vitest"

import { focusHeading, focusIsFree, navigated, settled } from "./heading-focus"

function heading(): HTMLElement {
  const element = document.createElement("h1")
  element.tabIndex = -1
  element.setAttribute("data-testid", "page-title")
  document.body.append(element)
  return element
}

afterEach(() => {
  settled()
  document.body.innerHTML = ""
})

describe("focus after a navigation", () => {
  it("goes to the heading of the page just navigated to", () => {
    navigated("k1")
    const h1 = heading()
    focusHeading(h1, "k1")
    expect(h1).toHaveFocus()
  })

  it("is left alone for a page that was not navigated to, or after a press of the pointer", () => {
    const h1 = heading()
    focusHeading(h1, "k1")
    expect(h1).not.toHaveFocus()
    navigated("k2")
    settled()
    focusHeading(h1, "k2")
    expect(h1).not.toHaveFocus()
  })

  it("does not take focus from something the person moved to", () => {
    const button = document.createElement("button")
    document.body.append(button)
    navigated("k1")
    button.focus()
    expect(focusIsFree()).toBe(false)
    const h1 = heading()
    focusHeading(h1, "k1")
    expect(button).toHaveFocus()
  })

  it("moves on from the link that started the navigation", () => {
    const link = document.createElement("a")
    link.href = "#"
    document.body.append(link)
    link.focus()
    navigated("k1")
    expect(focusIsFree()).toBe(true)
    const h1 = heading()
    focusHeading(h1, "k1")
    expect(h1).toHaveFocus()
  })
})
