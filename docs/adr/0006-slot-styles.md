# ADR 0006: How style overrides reach a component's slots

- Status: accepted
- Date: 13 November 2026
- Phase: 1

## Context

A form author can restyle part of one component instance: this label blue, that container padded. In the current Shesha this is done with free-form CSS and class names layered over a component library, which is where its `!important` rules and override wars come from. Shesha 2.0 forbids `!important` and outside overrides (CLAUDE.md), so an override has to reach the right element directly, as data.

## Decision

### Overrides are typed data per named slot

```json
"styles": {
  "label": { "color": "#003BB2", "fontWeight": "semibold" },
  "control": { "background": { "token": "muted" }, "radius": "full" }
}
```

The properties are a fixed set. Each takes a typed value:

| Property | Value | Becomes |
| --- | --- | --- |
| `color` | colour | text colour |
| `background` | colour | background colour |
| `borderColor` | colour | border colour |
| `radius` | `none`, `sm`, `md`, `lg`, `xl`, `2xl`, `full` | corner radius, from the radius tokens |
| `fontWeight` | `normal`, `medium`, `semibold` | font weight, from the weight tokens |
| `padding` | `none`, `xs`, `sm`, `md`, `lg`, `xl` | padding on all sides, from the space tokens |

A **colour** is either a literal, `"#RRGGBB"` or `"#RRGGBBAA"`, or a reference to a theme token, `{ "token": "primary" }`. A token reference names a system colour token (`--sys-color-<name>` in `tokens.css`), so it follows light and dark mode and any theme. Nothing else is accepted: no CSS text, no class names, no selectors, no arbitrary lengths.

The same space scale is used for the `gap` setting of the form, Container and Columns.

### A slot is a real part, and the override is written onto it

Each definition lists its slots (`root`, `label`, `control`, …). Each slot is one element the component already renders, normally a shadcn/ui part. The framework resolves an instance's `styles` once and hands the renderer one object per slot, which the renderer spreads onto that element:

```tsx
<FieldLabel {...slots.label}>…</FieldLabel>
<Input {...slots.control} … />
```

The object carries a `style` attribute holding only the overridden properties, each a `var(--sys-…)` token reference or the literal colour from the document. That is the entire mechanism:

- **No override layer.** The value is on the element it styles. No selector is generated, nothing depends on specificity or source order, and nothing needs `!important`.
- **No leaks between slots.** Box properties (background, border colour, radius, padding) do not inherit, so Select's popup and items never receive the trigger's padding. Colour and font weight inherit as they always do in CSS: an inner part that sets its own keeps it.
- **No raw values in components.** The conversion from data to CSS is one function, `slotStyle` in `web/src/forms/runtime/styles.ts`. Component source contains no literals; the `style` attribute is produced there and only there. This is the one sanctioned use of `style`, alongside CSS custom properties that carry layout data from settings (the column template of Columns).
- **Unknown or invalid input is ignored.** An unknown slot, property, token or malformed colour produces no style and a recorded problem. The component renders with its defaults.

### States

An override sets the slot's appearance in every state. Two consequences were designed for:

- **Invalid.** An invalid control is marked by a destructive border *and* a destructive ring outside it. The ring is not an overridable property, so a border-colour override can never hide an error.
- **Focus.** The focus indicator is an outline, set once for the whole app (ADR 0002), and is not overridable.

Hover is not special-cased: a Button with an overridden background keeps that background on hover. State-specific overrides are a Phase 3 question.

### Where defaults come from

A slot's default look is the shadcn/ui component's own classes, which resolve to tokens. Phase 4's theme may add defaults per component type and slot; those would be merged as data, in order `definition ← theme ← instance`, and written the same way. There is still exactly one place a value lands.

## Alternatives considered

- **CSS custom properties read by every component** (`color: var(--slot-color, <default>)`). The "component tokens" approach. Every shadcn part would need each of its classes rewritten around a variable with a fallback, for every property, and re-rewritten on every upstream update. Variables also inherit, so one slot's override would reach nested slots unless each property were registered as non-inheriting.
- **Override classes merged with `cn`** (`text-(color:--slot-color)` plus an inline variable). Works until a part has a variant class such as `dark:bg-input/30`, which then beats the override in dark mode. Fragile in exactly the way the rules are meant to prevent.
- **A generated stylesheet per form** (`[data-instance="…"] [data-slot="label"] { … }`). This is selectors again: it needs specificity or layer ordering to win, and it is the override layer the spec rules out.
- **Free-form CSS or class names in the document.** Rejected by requirement D6.

## Which later phase this serves

| Decision | Serves |
| --- | --- |
| Fixed, typed property set | Phase 3: one style editor works for every slot of every component |
| Token references | Phase 4: an override follows the theme instead of freezing a colour |
| Resolution as data, written once | Phase 4: theme-level slot defaults merge in without a new layer |
| Named slots on real parts | Phase 2: the designer can outline the part being styled |

## Consequences

- Adding a style property is additive but changes a frozen contract, so it needs an ADR.
- `padding` is one value for all sides. Per-side padding, if wanted, is a new property.
- shadcn parts must accept and forward `style`. They all spread their props onto their element, so they do.
- Literal colours do not adapt to dark mode. Token references do; the properties panel should offer tokens first.
