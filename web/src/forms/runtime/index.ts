/** What a component folder imports to define itself (ADR 0004). */
export type { FieldApi, FormActions } from "./context"
export {
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
  type Registry,
  type StaticProps,
} from "./definition"
export { GAP_CLASS } from "./layout"
export { FormRenderer, type FormRendererProps } from "./renderer"
export type { SlotProps, Slots } from "./styles"
export type { NestedValues } from "./values"
