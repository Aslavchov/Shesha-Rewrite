# ADR 0004: The component definition contract

- Status: accepted
- Date: 13 November 2026
- Phase: 1

## Context

Everything a component is must be stated in one place, so that the renderer (now), the designer palette (Phase 2), the properties panel (Phase 3) and the scripting API (Phase 6) can each be generated from it. In the current Shesha, knowledge about a component is spread across the component, the designer, per-component settings forms and migration code. This contract replaces that.

## Decision

### One folder, one line

Each component lives in `web/src/forms/components/<type>/` and exports one definition. `web/src/forms/registry.ts` lists the definitions, one line each. Nothing outside a component's folder mentions its type id: the renderer, the store and the pages work only through the definition.

### What a definition declares

A definition is created with one of three helpers. They differ only in what the component is able to do:

| Helper | For | Adds |
| --- | --- | --- |
| `defineInput` | components that hold a value | value type, default value, validation rules |
| `defineContainer` | components that hold children | regions |
| `defineStatic` | everything else (Button) | nothing |

Every definition declares:

| Part | Purpose | Used by |
| --- | --- | --- |
| `type` | Stable id stored in documents (`text-field`) | renderer |
| `displayName`, `description`, `category`, `icon` | How the component is presented | Phase 2 palette |
| `settings` | A map of setting descriptors. Each has a kind, a default, a label, optional help text, a group, and a parser that accepts a stored JSON value or rejects it | renderer now; Phase 3 generates the panel |
| `slots` | The named parts that can be styled | renderer now; Phase 3 style editor |
| `Edit`, `ReadOnly` | The renderers for the two modes | renderer |

Inputs add `valueType` (text, number, boolean, date or option), `defaultValue` (read from settings) and `rules`. Containers add `regions`, a function from the resolved settings to the region names, because Columns has as many regions as it has columns.

```tsx
export const textField = defineInput({
  type: "text-field",
  displayName: "Text field",
  description: "A single line of text.",
  category: "input",
  icon: TextCursorInputIcon,
  valueType: "text",
  settings: {
    label: labelSetting("Text field"),
    helpText: helpTextSetting,
    placeholder: placeholderSetting,
    defaultValue: nullableText({ label: "Default value", group: "data" }),
    required: requiredSetting,
    minLength: minLengthSetting,
    maxLength: maxLengthSetting,
    pattern: patternSetting,
    messages: messagesSetting,
  },
  defaultValue: (settings) => settings.defaultValue,
  rules: [required, minLength, maxLength, pattern],
  slots: ["root", "label", "control", "description", "error"],
  Edit: TextFieldEdit,
  ReadOnly: TextFieldReadOnly,
})
```

### Typed end to end

The settings type is inferred from the descriptors, the value type from `valueType`, and the slot names from `slots`. A renderer therefore receives:

- `settings`: every setting, resolved (stored value if valid, else the default), with its exact type;
- `slots`: one entry per declared slot, to spread onto the element that slot names;
- `field` (inputs, edit mode): the typed value, `setValue`, the error, and the ARIA attributes for the control;
- `region(name)` (containers): the rendered children of a region;
- `form` (static components): `submit()` and `reset()`.

A rule states which settings it reads (`Rule<string, { maxLength: number | null }>`), so listing a rule on a definition that lacks its setting is a compile error.

The registry holds definitions of different types in one list, which needs a type-erased view. The erasure happens once, inside the `define*` helpers: each returns a `ComponentDefinition` whose `prepare(instance)` resolves the settings and slots with their real types and returns a ready-to-render component. Stored values pass a runtime type guard on their way to a renderer rather than a cast. There is no `any`, and no cast at any call site.

### Built on shadcn/ui

Renderers compose the components in `web/src/components/ui` (Field, Input, Textarea, Select, Checkbox, Switch, Calendar, Popover, Button). A slot is always one of those parts, which already carry a `data-slot` attribute; the definition does not invent wrapper elements to have something to style. Shared layout (label, description, error, read-only value) is in `web/src/forms/parts/` and is used by every input, so the ARIA wiring exists once.

### Resilience belongs to the framework

A component never has to defend itself:

- an unknown `type` renders the `component-unknown` placeholder;
- a stored setting its parser rejects becomes the default;
- a renderer that throws is caught by an error boundary around that one instance and shows `component-error`;
- fields are validated only while they are on screen, so a broken or unknown component can never block a submit invisibly.

### Tests

Each folder has unit tests for the default render, the read-only render, every rule the component supports, and keyboard operation.

## Alternatives considered

- **One generic `defineComponent` with optional parts.** A single helper would have to accept "an input with regions and no value" and other combinations that mean nothing. Three helpers make each kind's required parts required.
- **A class per component.** Classes add inheritance, which is where shared behaviour goes to hide. Plain objects plus shared parts keep each component readable on its own.
- **Settings described by JSON Schema or Zod.** Either gives validation, but neither carries label, group, help text and editor kind without a second layer, and Zod would add a dependency for what is a dozen small parsers. A descriptor is the one object both the renderer and the Phase 3 panel need.
- **A settings form per component** (the current Shesha approach). It is the main source of per-component drift there. Generating the panel from descriptors removes the category.

## Which later phase this serves

| Decision | Serves |
| --- | --- |
| Display name, description, category, icon | Phase 2: the component palette |
| `regions` as a function of settings | Phase 2: drop targets |
| Setting descriptors with kind, label, help, group, default | Phase 3: the generated properties panel, with "set or default" and reset |
| Named slots | Phase 3: per-slot style editing; Phase 4: theme defaults per slot |
| `valueType` | Phase 5: matching inputs to entity property types |
| Rules as named, typed objects | Phase 6: rules evaluated from scripts; cross-field rules |
| `form` handed to static components | Phase 6: actions other than submit and reset |

## Consequences

- Adding a component is: a folder, a definition, one registry line. No server change, no renderer change.
- A setting kind the panel cannot edit yet still renders, because rendering needs only the parser and the default.
- The contract and the one-line registry are frozen after this phase.
