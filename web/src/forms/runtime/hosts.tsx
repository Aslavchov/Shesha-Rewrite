import { useField, useFieldValue, useFormContext } from "./context"
import type {
  CommonProps,
  ContainerProps,
  ContainerSpec,
  FormMode,
  InputSpec,
  StaticSpec,
} from "./definition"
import type { SettingsSchema } from "./settings"
import { useThemedSlots } from "./theme"
import { isValueOfType, type ValueType } from "./values"

/**
 * The components that connect a definition's renderers to the form: they
 * subscribe to the store and hand the renderer its typed props. They are the
 * same components for every instance, so a changed document re-renders an
 * instance instead of remounting it. They are also where the theme's default
 * styles go under the instance's own (ADR 0010), so that a theme change
 * reaches every instance without its document being read again.
 */

type HostProps<S extends SettingsSchema, Slot extends string> = CommonProps<S, Slot> & {
  readonly mode: FormMode
}

export function InputHost<VT extends ValueType, S extends SettingsSchema, Slot extends string>({
  mode,
  ...props
}: HostProps<S, Slot> & { readonly spec: InputSpec<VT, S, Slot> }) {
  return mode === "edit" ? <InputEditHost {...props} /> : <InputReadOnlyHost {...props} />
}

function InputEditHost<VT extends ValueType, S extends SettingsSchema, Slot extends string>({
  spec,
  instance,
  settings,
  slots,
}: CommonProps<S, Slot> & { readonly spec: InputSpec<VT, S, Slot> }) {
  const field = useField(instance.id, isValueOfType[spec.valueType])
  const themed = useThemedSlots(spec, slots)
  return <spec.Edit instance={instance} settings={settings} slots={themed} field={field} />
}

function InputReadOnlyHost<VT extends ValueType, S extends SettingsSchema, Slot extends string>({
  spec,
  instance,
  settings,
  slots,
}: CommonProps<S, Slot> & { readonly spec: InputSpec<VT, S, Slot> }) {
  const value = useFieldValue(instance.id, isValueOfType[spec.valueType])
  const themed = useThemedSlots(spec, slots)
  return <spec.ReadOnly instance={instance} settings={settings} slots={themed} value={value} />
}

export function StaticHost<S extends SettingsSchema, Slot extends string>({
  spec,
  mode,
  instance,
  settings,
  slots,
}: HostProps<S, Slot> & { readonly spec: StaticSpec<S, Slot> }) {
  const { actions } = useFormContext()
  const themed = useThemedSlots(spec, slots)
  const Renderer = mode === "edit" ? spec.Edit : spec.ReadOnly
  return <Renderer instance={instance} settings={settings} slots={themed} form={actions} />
}

export function ContainerHost<S extends SettingsSchema, Slot extends string>({
  spec,
  slots,
  ...props
}: ContainerProps<S, Slot> & { readonly spec: ContainerSpec<S, Slot> }) {
  const themed = useThemedSlots(spec, slots)
  return <spec.Render {...props} slots={themed} />
}
