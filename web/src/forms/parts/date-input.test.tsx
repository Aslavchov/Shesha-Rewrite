import * as React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DateInput } from "./date-input"

function Harness({ onChange }: { onChange: (value: string | null) => void }) {
  const [value, setValue] = React.useState<string | null>("1990-03-14")
  return (
    <DateInput
      testId="date"
      aria-label="Born"
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe("DateInput", () => {
  it("shows a value as the Date picker does, and reads a typed date", async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByTestId("date")
    expect(input).toHaveValue("14 March 1990")
    const user = userEvent.setup()
    await user.clear(input)
    expect(onChange).toHaveBeenLastCalledWith(null)
    await user.type(input, "2001-02-03")
    expect(onChange).toHaveBeenLastCalledWith("2001-02-03")
    await user.tab()
    expect(input).toHaveValue("3 February 2001")
  })

  it("keeps text that is not a date, marked invalid, without changing the value", async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByTestId("date")
    const user = userEvent.setup()
    await user.clear(input)
    await user.type(input, "soon")
    await user.tab()
    expect(input).toHaveValue("soon")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(onChange).not.toHaveBeenCalledWith(expect.stringMatching(/soon/))
  })

  it("opens the calendar from its button, and a day picked becomes the value", async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Choose born" }))
    const popup = await screen.findByTestId("date-popup")
    await user.click(
      await waitFor(() => {
        const day = popup.querySelector<HTMLButtonElement>('[data-day="1990-03-20"] button')
        if (!day) throw new Error("No day.")
        return day
      }),
    )
    expect(onChange).toHaveBeenLastCalledWith("1990-03-20")
    expect(screen.getByTestId("date")).toHaveValue("20 March 1990")
  })
})
