import { useField, useFieldValue, useFormContext } from "./context"
import type { CommonProps, FormMode, InputSpec, StaticSpec } from "./definition"
import type { SettingsSchema } from "./settings"
import { isValueOfType, type ValueType } from "./values"

/**
 * The components that connect a definition's renderers to the form: they
 * subscribe to the store and hand the renderer its typed props. They are the
 * same components for every instance, so a changed document re-renders an
 * instance instead of remounting it.
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
  return <spec.Edit instance={instance} settings={settings} slots={slots} field={field} />
}

function InputReadOnlyHost<VT extends ValueType, S extends SettingsSchema, Slot extends string>({
  spec,
  instance,
  settings,
  slots,
}: CommonProps<S, Slot> & { readonly spec: InputSpec<VT, S, Slot> }) {
  const value = useFieldValue(instance.id, isValueOfType[spec.valueType])
  return <spec.ReadOnly instance={instance} settings={settings} slots={slots} value={value} />
}

export function StaticHost<S extends SettingsSchema, Slot extends string>({
  spec,
  mode,
  instance,
  settings,
  slots,
}: HostProps<S, Slot> & { readonly spec: StaticSpec<S, Slot> }) {
  const { actions } = useFormContext()
  const Renderer = mode === "edit" ? spec.Edit : spec.ReadOnly
  return <Renderer instance={instance} settings={settings} slots={slots} form={actions} />
}
