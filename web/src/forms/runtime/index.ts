/** What a component folder imports to define itself (ADR 0004). */
export { type FieldApi, type FormActions, REVEAL_EVENT } from "./context"
export {
  type ComponentCategory,
  type ComponentDefinition,
  type ContainerProps,
  createRegistry,
  defineContainer,
  defineInput,
  defineStatic,
  type FormMode,
  type InputEditProps,
  type InputReadOnlyProps,
  type InstanceInfo,
  type InstanceProblem,
  REGION_SWITCH_ATTRIBUTE,
  type RegionSwitchProps,
  type Registry,
  type StaticProps,
} from "./definition"
export type { DesignInstanceProps, DesignRegionProps, DesignSurface } from "./design"
export { GAP_CLASS } from "./layout"
export { wantsWidth } from "./layout-width"
export { formSettings } from "./model"
export {
  type Choice,
  type Column,
  resolveSettings,
  type Setting,
  type SettingGroup,
  type SettingKind,
  type SettingProblem,
  type SettingsSchema,
  type Tab,
} from "./settings"
export { FormRenderer, type FormRendererProps, type SubmittedForm } from "./renderer"
export {
  COLOR_TOKENS,
  FONT_WEIGHTS,
  RADIUS_STEPS,
  SLOT_ATTRIBUTE,
  type SlotProps,
  type Slots,
  slotStyle,
  SPACE_STEPS,
  type ThemeStyles,
} from "./styles"
export { ThemeStylesContext } from "./theme"
export type { PathProblem } from "./store"
export type { NestedValues, ValueType } from "./values"
