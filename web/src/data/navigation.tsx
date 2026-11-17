import * as React from "react"

/**
 * How a component opens a form for a row. The app provides it (it knows the
 * routes); without a provider, on the designer's canvas or in a test, nothing
 * opens.
 */
export type RowNavigation = {
  /** The address of a form opened for a row, or to create one when `rowId` is null. */
  readonly href: (formId: string, rowId: string | null) => string
  /** Goes there, remembering where it came from so the form can offer the way back. */
  readonly open: (formId: string, rowId: string | null) => void
}

export const RowNavigationContext = React.createContext<RowNavigation | null>(null)

export const useRowNavigation = () => React.useContext(RowNavigationContext)
