import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// jsdom has no matchMedia. Tests run at desktop width unless they say otherwise.
// Defined directly (not with vi.stubGlobal) so vi.unstubAllGlobals() leaves it alone.
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  document.documentElement.className = ""
})
