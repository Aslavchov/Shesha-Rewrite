/**
 * Where focus goes when the app moves to another page (Phase 5 checks): to
 * the new page's heading, so a screen reader says where the person is and
 * the keyboard starts from the top of the page, not from the body.
 *
 * A navigation marks its location as pending. A page's heading takes focus
 * when it appears for a pending location and nothing else has focus: a page
 * that first shows a loading state and then its content focuses the heading
 * that stays. Something that knows better (a list returning focus to the row
 * that was opened) takes it after, from the heading or the body. A press of
 * the pointer ends the wait, so a click is never followed by a jump.
 */

let pending: string | null = null
/** What had focus when the navigation happened: a link that stays on screen, such as the sidebar's. */
let origin: Element | null = null

export function navigated(locationKey: string): void {
  pending = locationKey
  origin = document.activeElement
}

export function settled(): void {
  pending = null
  origin = null
}

/**
 * Whether focus is free to be moved: on nothing, the body, a page heading, or
 * still on what started the navigation.
 */
export function focusIsFree(): boolean {
  const active = document.activeElement
  return (
    active === null ||
    active === document.body ||
    (active === origin && origin !== null) ||
    !active.isConnected ||
    active.getAttribute("data-testid") === "page-title"
  )
}

/** Focuses `heading` if its location is the one just navigated to and focus is free. */
export function focusHeading(heading: HTMLElement | null, locationKey: string): void {
  if (heading === null || pending !== locationKey || !focusIsFree()) return
  heading.focus()
}
