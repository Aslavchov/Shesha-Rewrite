/** The ids that describe an editor: its error, then its help. */
export function describedBy(
  id: string,
  error: string | null | undefined,
  help: string | undefined,
) {
  const ids = [error ? `${id}-error` : null, help ? `${id}-help` : null].filter(Boolean)
  return ids.length > 0 ? ids.join(" ") : undefined
}

/** On a popup the properties panel opens: it belongs to the panel, though it is drawn elsewhere. */
export const PANEL_POPUP_ATTRIBUTE = "data-panel-popup"
