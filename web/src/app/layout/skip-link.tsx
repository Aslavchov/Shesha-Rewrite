export const MAIN_CONTENT_ID = "main-content"

/** First focusable element on every page; hidden until it receives focus. */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      data-testid="skip-link"
      className="sr-only rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground shadow-md focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50"
    >
      Skip to content
    </a>
  )
}
