import * as React from "react"
import { cn } from "cn"

import { ThemeStylesContext } from "@/forms/runtime"
import type { ThemeDocument } from "@/generated"

import { componentDefaults, type Mode, themeVariables } from "./variables"

/** A theme's custom properties as an inline style: data, like a slot's overrides (ADR 0006). */
type ScopeStyle = React.CSSProperties & Record<`--${string}`, string>

/**
 * A part of the page with a theme of its own (ADR 0010): the theme editor's
 * preview. `tokens.css` declares the system tokens again on
 * `[data-theme-scope]`, so they are worked out here from this theme's
 * properties, in the scheme this scope names, whatever the page uses.
 *
 * Every theme property is set here, to its value or to `initial`. A property
 * left out would be inherited from the page, and the published theme would
 * show through; `initial` makes `tokens.css` fall back to the built-in look.
 */
export function ThemeScope({
  theme,
  mode,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "style"> & { theme: ThemeDocument; mode: Mode }) {
  const style = React.useMemo(() => {
    const properties: ScopeStyle = {}
    for (const [name, value] of Object.entries(themeVariables(theme))) {
      properties[name as `--${string}`] = value ?? "initial"
    }
    return properties
  }, [theme])

  return (
    <div
      {...props}
      data-theme-scope={mode}
      style={style}
      // The page's own colours and text size, set again so that they are this theme's.
      className={cn("bg-background text-sm text-foreground", className)}
    >
      <ThemeStylesContext value={componentDefaults(theme)}>{children}</ThemeStylesContext>
    </div>
  )
}
