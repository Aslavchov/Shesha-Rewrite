import {
  type ComponentDefinition,
  formSettings,
  resolveSettings,
  type Setting,
  type SettingProblem,
  type SettingsSchema,
} from "@/forms/runtime"

/**
 * Whose settings are being edited: an instance's component, or the form
 * itself. The properties panel and the commands both ask it whether a value
 * may be stored (ADR 0009).
 */
export type SettingsOwner = {
  readonly settings: SettingsSchema
  readonly check: (stored: Readonly<Record<string, unknown>>) => readonly SettingProblem[]
}

export const FORM_OWNER: SettingsOwner = {
  settings: formSettings,
  check: (stored) => resolveSettings(formSettings, stored).problems,
}

export const ownerOf = (definition: ComponentDefinition): SettingsOwner => ({
  settings: definition.settings,
  check: definition.checkSettings,
})

/**
 * Why `value` cannot be stored as setting `key`, given the other stored
 * settings: the setting rejects it, or it breaks a constraint with another
 * setting. Null when it can.
 */
export function settingProblem(
  owner: SettingsOwner,
  stored: Readonly<Record<string, unknown>> | undefined,
  key: string,
  value: unknown,
): string | null {
  const setting: Setting<unknown> | undefined = owner.settings[key]
  if (!setting) return "There is no such setting."
  if (setting.parse(value) === undefined)
    return `That is not a valid ${setting.label.toLowerCase()}.`
  const candidate = { ...stored, [key]: value }
  const problem = owner
    .check(candidate)
    .find((found) => found.setting === key || found.related?.includes(key))
  return problem?.message ?? null
}
