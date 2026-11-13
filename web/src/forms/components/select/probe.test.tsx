import { it } from "vitest"
import { screen } from "@testing-library/react"
import { instance, renderForm } from "../../testing/render-form"
import { select } from "."

it("probe", async () => {
  const log: string[] = []
  ;(globalThis as unknown as { log: string[] }).log = log
  const { user } = renderForm([instance("select", "contact", { required: true, options: [{ label: "A", value: "a" }] })], [select])
  const t = screen.getByRole("combobox")
  await user.click(t)
  log.push("--- after click; expanded=" + t.getAttribute("aria-expanded"))
  const p = screen.getByTestId("field-contact-popup")
  log.push(p.parentElement!.parentElement!.outerHTML.replace(/class="[^"]*"/g, ""))
  await new Promise((r) => setTimeout(r, 50))
  log.push("--- later; expanded=" + t.getAttribute("aria-expanded"))
  log.push(p.parentElement!.outerHTML.replace(/class="[^"]*"/g, "").slice(0, 300))
  throw new Error(log.join("\n"))
})
