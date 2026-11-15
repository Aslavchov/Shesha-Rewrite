import * as React from "react"

import type { CommonProps, Meta } from "./definition"
import type { SettingsSchema } from "./settings"
import { type Slots, type ThemeStyles, withThemeStyles } from "./styles"

const NO_STYLES: ThemeStyles = {}

/**
 * The theme's default slot styles for whatever is rendered below (ADR 0010).
 * The app provides the published theme's; a theme preview provides the
 * draft's. With no provider, components have their own look only.
 */
export const ThemeStylesContext = React.createContext<ThemeStyles>(NO_STYLES)

/** An instance's slots with the theme's defaults for its component type underneath. */
export function useThemedSlots<S extends SettingsSchema, Slot extends string>(
  spec: Meta<S, Slot>,
  slots: CommonProps<S, Slot>["slots"],
): Slots<Slot> {
  const theme = React.useContext(ThemeStylesContext)[spec.type]
  return React.useMemo(() => withThemeStyles(spec.slots, slots, theme), [spec, slots, theme])
}
