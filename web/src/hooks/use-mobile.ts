import * as React from "react"

// Mirrors Tailwind's `md` breakpoint (48rem). Media queries cannot read CSS
// variables, so the value is repeated here once.
const MOBILE_QUERY = "(max-width: 47.9375rem)"

function subscribe(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches
}

/** True while the viewport is narrower than the `md` breakpoint (768px). */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot)
}
