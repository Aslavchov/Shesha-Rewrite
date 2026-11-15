import * as React from "react"

import { ThemeStylesContext } from "@/forms/runtime"

import { applyTheme } from "./apply"
import { componentDefaults } from "./variables"
import { usePublishedTheme } from "./use-published-theme"

/**
 * Puts the published theme on the page and hands its component defaults to
 * every form rendered inside. Until a theme is known (only on the Vite dev
 * server, which does not write it into the page) the built-in look shows.
 */
export function PublishedTheme({ children }: { children: React.ReactNode }) {
  const { data } = usePublishedTheme()
  const theme = data?.document

  React.useLayoutEffect(() => {
    if (theme) applyTheme(theme)
  }, [theme])

  return <ThemeStylesContext value={componentDefaults(theme)}>{children}</ThemeStylesContext>
}
