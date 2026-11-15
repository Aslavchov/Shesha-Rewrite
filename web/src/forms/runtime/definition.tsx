import type * as React from "react"
import type { LucideIcon } from "lucide-react"

import type { ComponentInstance } from "@/generated"

import type { FieldApi, FormActions } from "./context"
import { ContainerHost, InputHost, StaticHost } from "./hosts"

import { type Rule, runRules } from "./rules"
import {
  type Messages,
  messagesSetting,
  resolveSettings,
  type SettingProblem,
  type SettingsConstraint,
  type SettingsOf,
  type SettingsSchema,
} from "./settings"
import type { FieldSpec } from "./store"
import { resolveSlots, type Slots } from "./styles"
import { isValueOfType, type ValueType, type ValueTypes } from "./values"

/**
 * The component definition contract (ADR 0004). A component is defined once,
 * with `defineInput`, `defineContainer` or `defineStatic`, in its own folder,
 * and registered with one line in `forms/registry.ts`.
 */

export type FormMode = "edit" | "read-only"

/** Where the component palette (Phase 2) lists a component. */
export type ComponentCategory = "input" | "layout" | "content" | "action"

/** The parts of an instance a renderer may use. Never the raw settings. */
export type InstanceInfo = { readonly id: string; readonly name: string }

export type CommonProps<S extends SettingsSchema, Slot extends string> = {
  readonly instance: InstanceInfo
  /** Every setting, resolved: the stored value if valid, else the default. */
  readonly settings: SettingsOf<S>
  /** One entry per declared slot, to spread onto the element it names. */
  readonly slots: Slots<Slot>
}

export type InputEditProps<
  VT extends ValueType,
  S extends SettingsSchema,
  Slot extends string,
> = CommonProps<S, Slot> & { readonly field: FieldApi<ValueTypes[VT]> }

export type InputReadOnlyProps<
  VT extends ValueType,
  S extends SettingsSchema,
  Slot extends string,
> = CommonProps<S, Slot> & { readonly value: ValueTypes[VT] | null }

export type ContainerProps<S extends SettingsSchema, Slot extends string> = CommonProps<S, Slot> & {
  readonly mode: FormMode
  /** The rendered children of a region, in order. */
  readonly region: (name: string) => React.ReactNode
  /**
   * In the designer, the region the author chose to see, for a container
   * that shows one region at a time (Tabs). Null outside the designer, or
   * when nothing was chosen. Added in Phase 3 (ADR 0009).
   */
  readonly shownRegion: string | null
  /**
   * Props for the element that switches to a region (a tab), so the designer
   * can find it and let the author switch there too. Spread them like a slot.
   */
  readonly regionSwitch: (name: string) => RegionSwitchProps
}

/** The attribute that marks the element switching to a region; its value is the region. */
export const REGION_SWITCH_ATTRIBUTE = "data-region-switch"

export type RegionSwitchProps = { readonly [REGION_SWITCH_ATTRIBUTE]: string }

const regionSwitch = (name: string): RegionSwitchProps => ({ [REGION_SWITCH_ATTRIBUTE]: name })

export type StaticProps<S extends SettingsSchema, Slot extends string> = CommonProps<S, Slot> & {
  readonly form: FormActions
}

export type Meta<S extends SettingsSchema, Slot extends string> = {
  /** Stable id stored in documents, such as `text-field`. */
  readonly type: string
  readonly displayName: string
  /** One line. */
  readonly description: string
  readonly category: ComponentCategory
  readonly icon: LucideIcon
  readonly settings: S
  /** The named parts that can be styled. `root` is always one of them. */
  readonly slots: readonly Slot[]
  /**
   * Rules between settings that are each valid on their own, such as a
   * minimum not above its maximum. Optional; added in Phase 3 (ADR 0009).
   */
  readonly constraints?: readonly SettingsConstraint<SettingsOf<S>>[]
}

export type InputSpec<VT extends ValueType, S extends SettingsSchema, Slot extends string> = Meta<
  S,
  Slot
> & {
  readonly valueType: VT
  /** The value a new or reset form starts with. */
  readonly defaultValue: (settings: SettingsOf<S>) => ValueTypes[VT] | null
  /** Checked in this order; the first broken rule gives the error. */
  readonly rules: readonly Rule<ValueTypes[VT], SettingsOf<S>>[]
  readonly Edit: React.ComponentType<InputEditProps<VT, S, Slot>>
  readonly ReadOnly: React.ComponentType<InputReadOnlyProps<VT, S, Slot>>
}

export type ContainerSpec<S extends SettingsSchema, Slot extends string> = Meta<S, Slot> & {
  /** The names of the regions an instance with these settings has. */
  readonly regions: (settings: SettingsOf<S>) => readonly string[]
  /**
   * What a region is called where people see it: a tab's label rather than
   * its key. Optional; the name is used without it. Added in Phase 3.
   */
  readonly regionLabel?: (settings: SettingsOf<S>, name: string) => string
  /** One renderer for both modes: a container only arranges its children. */
  readonly Render: React.ComponentType<ContainerProps<S, Slot>>
}

export type StaticSpec<S extends SettingsSchema, Slot extends string> = Meta<S, Slot> & {
  readonly Edit: React.ComponentType<StaticProps<S, Slot>>
  readonly ReadOnly: React.ComponentType<StaticProps<S, Slot>>
}

/** A problem found while preparing one instance. `where` is relative to it. */
export type InstanceProblem = {
  readonly where: string
  readonly message: string
  /** The setting at fault, if the problem is a setting's. Added in Phase 3. */
  readonly setting?: string
  /** The slot at fault, and the property when it is one value, if the problem is a style's. */
  readonly slot?: string
  readonly property?: string
}

/** What the designer tells the renderer about one instance. */
export type DesignInfo = {
  /** The region the author chose to see, for a container that shows one at a time. */
  readonly shownRegion: string | null
}

/** One instance, checked and ready to render. */
export type PreparedComponent = {
  readonly problems: readonly InstanceProblem[]
  /** Inputs only: what the form store needs, apart from the id and the path. */
  readonly field: Omit<FieldSpec, "id" | "path"> | null
  /** The regions this instance has. Empty unless it is a container. */
  readonly regions: readonly string[]
  /** What a region is called where people see it. Added in Phase 3. */
  readonly regionLabel: (name: string) => string
  readonly render: (
    mode: FormMode,
    region: (name: string) => React.ReactNode,
    design?: DesignInfo,
  ) => React.ReactNode
}

/**
 * A definition as the registry, the renderer and later the designer see it:
 * the same for every component, with the component's own types folded away
 * inside `prepare`.
 */
export type ComponentDefinition = {
  readonly type: string
  readonly displayName: string
  readonly description: string
  readonly category: ComponentCategory
  readonly icon: LucideIcon
  readonly kind: "input" | "container" | "static"
  /** Every setting, including `messages` for inputs that have rules. */
  readonly settings: SettingsSchema
  readonly slots: readonly string[]
  /** Inputs only. */
  readonly valueType: ValueType | null
  /** The validation rules an input supports, in the order they are checked. */
  readonly rules: readonly { readonly id: string; readonly label: string }[]
  readonly prepare: (instance: ComponentInstance) => PreparedComponent
  /**
   * Every problem with a set of stored settings: values a setting rejects,
   * keys it does not have, and broken constraints. The properties panel asks
   * this before a value reaches the document. Added in Phase 3 (ADR 0009).
   */
  readonly checkSettings: (stored: Readonly<Record<string, unknown>>) => readonly SettingProblem[]
}

function meta<S extends SettingsSchema, Slot extends string>(spec: Meta<S, Slot>) {
  if (!spec.slots.some((slot) => slot === "root")) {
    throw new Error(`Component "${spec.type}" must declare a "root" slot.`)
  }
  return {
    type: spec.type,
    displayName: spec.displayName,
    description: spec.description,
    category: spec.category,
    icon: spec.icon,
    slots: spec.slots,
  }
}

/** The settings problems of a component without its own `messages` handling. */
const checkWith =
  <S extends SettingsSchema, Slot extends string>(spec: Meta<S, Slot>) =>
  (stored: Readonly<Record<string, unknown>>) =>
    resolveSettings(spec.settings, stored, spec.constraints).problems

const sameName = (name: string) => name

/** Resolves what every kind of component needs from an instance. */
function resolve<S extends SettingsSchema, Slot extends string>(
  spec: Meta<S, Slot>,
  instance: ComponentInstance,
  stored: Readonly<Record<string, unknown>> | undefined,
) {
  const settings = resolveSettings(spec.settings, stored, spec.constraints)
  const slots = resolveSlots(spec.slots, instance.name, instance.styles)
  const problems: InstanceProblem[] = [
    ...settings.problems.map((problem) => ({
      where: `settings.${problem.setting}`,
      message: problem.message,
      setting: problem.setting,
    })),
    ...slots.problems.map((problem) => ({
      where: `styles.${problem.slot}`,
      message: problem.message,
      slot: problem.slot,
      ...(problem.property === undefined ? {} : { property: problem.property }),
    })),
  ]
  const info: InstanceInfo = { id: instance.id, name: instance.name }
  return { info, settings: settings.settings, slots: slots.slots, problems }
}

/** Defines a component that holds a value. */
export function defineInput<
  const VT extends ValueType,
  S extends SettingsSchema,
  const Slot extends string,
>(spec: InputSpec<VT, S, Slot>): ComponentDefinition {
  const hasRules = spec.rules.length > 0
  const guard = isValueOfType[spec.valueType]

  return {
    ...meta(spec),
    kind: "input",
    settings: hasRules ? { ...spec.settings, messages: messagesSetting } : spec.settings,
    valueType: spec.valueType,
    rules: spec.rules.map((rule) => ({ id: rule.id, label: rule.label })),
    checkSettings(stored) {
      const { messages, ...own } = stored
      const problems: InstanceProblem[] = []
      readMessages(messages, hasRules, problems)
      return [
        ...checkWith(spec)(own),
        ...problems.map((problem) => ({ setting: "messages", message: problem.message })),
      ]
    },
    prepare(instance) {
      // `messages` belongs to the framework, not to the component's settings.
      const { messages: storedMessages, ...stored } = instance.settings ?? {}
      const { info, settings, slots, problems } = resolve(spec, instance, stored)
      const messages = readMessages(storedMessages, hasRules, problems)

      return {
        problems,
        regions: [],
        regionLabel: sameName,
        field: {
          valueType: spec.valueType,
          defaultValue: spec.defaultValue(settings),
          validate: (value) =>
            runRules(spec.rules, value !== null && guard(value) ? value : null, settings, messages),
        },
        render: (mode) => (
          <InputHost spec={spec} instance={info} settings={settings} slots={slots} mode={mode} />
        ),
      }
    },
  }
}

function readMessages(stored: unknown, hasRules: boolean, problems: InstanceProblem[]): Messages {
  if (stored === undefined) return {}
  const parsed = hasRules ? messagesSetting.parse(stored) : undefined
  if (parsed === undefined) {
    problems.push({
      where: "settings.messages",
      setting: "messages",
      message: hasRules
        ? "Messages are text keyed by rule; they are ignored."
        : "This component has no rules; its messages are ignored.",
    })
  }
  return parsed ?? {}
}

/** Defines a component that holds other components in named regions. */
export function defineContainer<S extends SettingsSchema, const Slot extends string>(
  spec: ContainerSpec<S, Slot>,
): ComponentDefinition {
  return {
    ...meta(spec),
    kind: "container",
    settings: spec.settings,
    valueType: null,
    rules: [],
    checkSettings: checkWith(spec),
    prepare(instance) {
      const { info, settings, slots, problems } = resolve(spec, instance, instance.settings)
      const label = spec.regionLabel
      return {
        problems,
        regions: spec.regions(settings),
        regionLabel: label ? (name) => label(settings, name) : sameName,
        field: null,
        render: (mode, region, design) => (
          <ContainerHost
            spec={spec}
            instance={info}
            settings={settings}
            slots={slots}
            mode={mode}
            region={region}
            shownRegion={design?.shownRegion ?? null}
            regionSwitch={regionSwitch}
          />
        ),
      }
    },
  }
}

/** Defines a component with no value and no children, such as a Button. */
export function defineStatic<S extends SettingsSchema, const Slot extends string>(
  spec: StaticSpec<S, Slot>,
): ComponentDefinition {
  return {
    ...meta(spec),
    kind: "static",
    settings: spec.settings,
    valueType: null,
    rules: [],
    checkSettings: checkWith(spec),
    prepare(instance) {
      const { info, settings, slots, problems } = resolve(spec, instance, instance.settings)
      return {
        problems,
        regions: [],
        regionLabel: sameName,
        field: null,
        render: (mode) => (
          <StaticHost spec={spec} instance={info} settings={settings} slots={slots} mode={mode} />
        ),
      }
    },
  }
}

/** The component types a renderer knows, by type id. */
export type Registry = ReadonlyMap<string, ComponentDefinition>

/** Builds a registry. Two definitions with one type id is a programming error. */
export function createRegistry(definitions: readonly ComponentDefinition[]): Registry {
  const registry = new Map<string, ComponentDefinition>()
  for (const definition of definitions) {
    if (registry.has(definition.type)) {
      throw new Error(`Component type "${definition.type}" is registered twice.`)
    }
    registry.set(definition.type, definition)
  }
  return registry
}
