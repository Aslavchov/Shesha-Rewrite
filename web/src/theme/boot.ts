/*
 * Applies the published theme before first paint (spec 3.3, ADR 0010), so a
 * reload never shows the built-in look first. vite.config.ts builds this file
 * into the inline script in index.html; the server writes the published theme
 * into the page beside it.
 */
import { applyTheme, readInlinedTheme } from "./apply"

const published = readInlinedTheme()
if (published) applyTheme(published.document)
