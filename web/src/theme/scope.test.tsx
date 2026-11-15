import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { button } from "@/forms/components/button"
import { createRegistry, FormRenderer } from "@/forms/runtime"
import { formDocument, instance } from "@/forms/testing/render-form"
import { THEME_FORMAT_VERSION } from "@/generated"

import { ThemeScope } from "./scope"
import { THEME_VARIABLES } from "./variables"

describe("a theme scope (ADR 0010)", () => {
  it("sets every theme variable, so that nothing of the page's theme shows through", () => {
    render(
      <ThemeScope
        theme={{ formatVersion: THEME_FORMAT_VERSION, colors: { primary: { light: "#0F766E" } } }}
        mode="dark"
        data-testid="scope"
      />,
    )
    const scope = screen.getByTestId("scope")
    expect(scope).toHaveAttribute("data-theme-scope", "dark")
    for (const name of THEME_VARIABLES) expect(scope.style.getPropertyValue(name)).not.toBe("")
    expect(scope.style.getPropertyValue("--theme-primary")).toBe("#0f766e")
    expect(scope.style.getPropertyValue("--theme-success")).toBe("initial")
  })

  it("gives the forms inside it the theme's component defaults, under the instance's own", () => {
    const registry = createRegistry([button])
    const theme = {
      formatVersion: THEME_FORMAT_VERSION,
      components: {
        button: { root: { background: { token: "success" }, radius: "full" as const } },
      },
    }
    render(
      <ThemeScope theme={theme} mode="light">
        <FormRenderer
          registry={registry}
          mode="edit"
          document={formDocument([
            instance("button", "plain", {}, { bind: null }),
            instance(
              "button",
              "own",
              {},
              { bind: null, styles: { root: { background: "#123456" } } },
            ),
          ])}
        />
      </ThemeScope>,
    )
    const plain = screen.getByTestId("field-plain")
    const own = screen.getByTestId("field-own")
    expect(plain.style.backgroundColor).toBe("var(--sys-color-success)")
    expect(plain.style.borderRadius).toBe("var(--sys-radius-full)")
    // The instance wins, property by property: its own background, the theme's radius.
    expect(own.style.backgroundColor).toBe("rgb(18, 52, 86)")
    expect(own.style.borderRadius).toBe("var(--sys-radius-full)")
  })
})
