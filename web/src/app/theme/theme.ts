/*
 * Theme state: light or dark, stored in localStorage and applied as a `dark`
 * class on <html>. Light is the default on a first visit, whatever the
 * operating system prefers.
 *
 * index.html applies the stored theme before first paint with a small inline
 * script; THEME_STORAGE_KEY is injected into it at build time (vite.config.ts).
 */
import { THEME_STORAGE_KEY } from "./storage-key"

export type Theme = "light" | "dark"

const DARK_CLASS = "dark"
const listeners = new Set<() => void>()

function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light"
  } catch {
    // Storage can be unavailable (private mode, blocked cookies).
    return "light"
  }
}

export function getTheme(): Theme {
  return document.documentElement.classList.contains(DARK_CLASS) ? "dark" : "light"
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle(DARK_CLASS, theme === "dark")
  listeners.forEach((listener) => listener())
}

export function setTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // The choice still applies for this visit; it just will not persist.
  }
  applyTheme(theme)
}

export function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark")
}

/** Subscribe to theme changes, including ones made in another tab. */
export function subscribeToTheme(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) applyTheme(readStoredTheme())
  }
  listeners.add(listener)
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

/** Apply the stored theme. The inline script in index.html normally got there first. */
export function initTheme() {
  applyTheme(readStoredTheme())
}
