import { screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { fieldError, instance, renderForm } from "../../testing/render-form"
import { datePicker } from "."
import { textField } from "../text-field"

const log = (...parts: unknown[]) => process.stdout.write(`\n>> ${parts.map(String).join(" ")}\n`)
const active = () => {
  const el = document.activeElement
  return el ? `${el.tagName} ${el.getAttribute("aria-label") ?? el.getAttribute("data-day") ?? el.id}` : "none"
}

describe("probe", () => {
  it("leaving", async () => {
    const { user } = renderForm(
      [
        instance("date-picker", "born", { label: "Born", required: true }),
        instance("text-field", "other", { label: "Other" }),
      ],
      [datePicker, textField],
    )
    await user.tab()
    await user.tab()
    log("after tab to button", active(), fieldError("born")?.textContent)
    await user.keyboard("{Enter}")
    await screen.findByTestId("field-born-popup")
    log("opened", active(), fieldError("born")?.textContent)
    await user.keyboard("{Escape}")
    log("escaped", active(), fieldError("born")?.textContent, screen.queryByTestId("field-born-popup") !== null)
    await waitFor(() => expect(screen.queryByTestId("field-born-popup")).toBeNull())
    log("closed", active(), fieldError("born")?.textContent)
    await user.keyboard(" ")
    await screen.findByTestId("field-born-popup")
    log("opened with space", active(), fieldError("born")?.textContent)
    await user.click(screen.getByRole("textbox", { name: "Other" }))
    log("clicked other", active(), fieldError("born")?.textContent, screen.queryByTestId("field-born-popup") !== null)
    await waitFor(() => expect(screen.queryByTestId("field-born-popup")).toBeNull())
    log("closed", active(), fieldError("born")?.textContent)
  })

  it("tab through popup", async () => {
    const { user } = renderForm(
      [
        instance("date-picker", "born", { label: "Born", required: true }),
        instance("text-field", "other", { label: "Other" }),
      ],
      [datePicker, textField],
    )
    await user.click(screen.getByRole("button", { name: "Choose date" }))
    await screen.findByTestId("field-born-popup")
    log("opened by click", active(), fieldError("born")?.textContent)
    for (let i = 0; i < 6; i += 1) {
      await user.tab()
      log("tab", active(), fieldError("born")?.textContent, screen.queryByTestId("field-born-popup") !== null)
    }
    for (let i = 0; i < 8; i += 1) {
      await user.tab({ shift: true })
      log("shift tab", active(), fieldError("born")?.textContent, screen.queryByTestId("field-born-popup") !== null)
    }
  })

  it("click body", async () => {
    const { user } = renderForm(
      [instance("date-picker", "born", { label: "Born", required: true })],
      [datePicker],
    )
    await user.click(screen.getByRole("button", { name: "Choose date" }))
    await screen.findByTestId("field-born-popup")
    await user.click(document.body)
    log("clicked body", active(), fieldError("born")?.textContent, screen.queryByTestId("field-born-popup") !== null)
    await waitFor(() => expect(screen.queryByTestId("field-born-popup")).toBeNull())
    log("closed", active(), fieldError("born")?.textContent)
  })
})
