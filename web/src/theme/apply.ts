import type { ThemeDocument, ThemeRecord } from "@/generated"

import { themeVariables } from "./variables"

/**
 * Putting a theme on the page (ADR 0010). A theme reaches components as
 * `--theme-*` custom properties on one element: `<html>` for the published
 * theme, or a theme scope for a preview.
 */

/** The element `index.html` carries the published theme in; the server fills it in. */
export const PUBLISHED_THEME_ELEMENT = "published-theme"

/** Sets the theme's properties on the page, and removes those it does not set. */
export function applyTheme(theme: ThemeDocument, root: HTMLElement = document.documentElement) {
  for (const [name, value] of Object.entries(themeVariables(theme))) {
    if (value === null) root.style.removeProperty(name)
    else root.style.setProperty(name, value)
  }
}

/**
 * The published theme the server wrote into the page, or null when the page
 * was not served by it (the Vite dev server) or holds something unreadable.
 */
export function readInlinedTheme(): ThemeRecord | null {
  try {
    const text = document.getElementById(PUBLISHED_THEME_ELEMENT)?.textContent
    const record: unknown = text ? JSON.parse(text) : null
    if (typeof record !== "object" || record === null) return null
    const { revision, document: theme } = record as Partial<ThemeRecord>
    if (typeof revision !== "number" || typeof theme !== "object" || theme === null) return null
    return record as ThemeRecord
  } catch {
    return null
  }
}
