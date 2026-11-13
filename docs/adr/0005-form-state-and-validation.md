# ADR 0005: Form state and validation

- Status: accepted
- Date: 13 November 2026
- Phase: 1

## Context

The renderer has to hold the values of a form whose fields are only known at run time, validate them from rules stored as data, and stay fast on large forms: typing in one field must re-render that field and nothing else. Phase 6 will add dependencies between fields and a scripting API that reads and writes values and settings, so whatever holds the state must be something scripts can subscribe to selectively.

## Decision

### A small store of our own, no form library

Form state lives in one plain object per rendered form, `FormStore` (`web/src/forms/runtime/store.ts`), about 200 lines with no dependencies. Each field's state is an immutable snapshot `{ value, error }`. Components subscribe to one field through React's `useSyncExternalStore`, so a change to one field notifies only that field's subscribers. The renderer itself never re-renders when a value changes.

The libraries considered, at their current versions:

| Library | Why not |
| --- | --- |
| React Hook Form 7.92 | Built around registering native inputs and reading the DOM. Our controls are mostly not native inputs (Select, Checkbox, Switch, date picker), so every field would go through its controlled-component escape hatch. Its empty value is `""` or `undefined`, ours is `null`; its validation lifecycle (modes, resolvers) would have to be bent to rules stored as data. |
| TanStack Form 1.33 | Fine-grained subscriptions and good typing, but the typing is for forms known at compile time; ours come from a document. We would use it as a store and bypass its field and validator model, which is most of the library. |
| Formik, Final Form | Re-render the whole form by default, or are no longer actively developed. |

What we need from a library is a keyed store with per-key subscriptions. That is small enough to own, and owning it means the Phase 6 scripting API is a thin layer over the same object rather than a bridge into someone else's lifecycle.

### Values

| Value type | Stored as | No value |
| --- | --- | --- |
| Text | string | `null` (an empty string is stored as `null`) |
| Number | JSON number | `null` |
| Boolean | `true` or `false` | `false` |
| Date | `"YYYY-MM-DD"` | `null` |
| Option | the option's value, a string | `null` |

- The store normalises on the way in, so no component can leave `""` behind.
- A date is a calendar date, not a moment. It is built from and split into year, month and day numbers; it never passes through a `Date` in UTC, so the stored string is the same in every time zone.
- Values are kept flat, keyed by instance id. `values()` nests them by data path when the form is submitted.

### Rules

A rule is a small typed object: an id, a label, and a `check(value, settings)` that returns the default message when the rule is broken.

| Rule id | Applies to | Reads setting | Default message |
| --- | --- | --- | --- |
| `required` | every input | `required` | This field is required |
| `required` (Checkbox) | boolean | `required` | This box must be checked |
| `minLength` | text | `minLength` | Enter at least N characters |
| `maxLength` | text | `maxLength` | Enter no more than N characters |
| `pattern` | text | `pattern` | Enter a value in the expected format |
| `min` | number | `min` | Enter a number that is N or more |
| `max` | number | `max` | Enter a number that is N or less |
| `wholeNumber` | number | `wholeNumber` | Enter a whole number |
| `minDate` | date | `minDate` | Enter a date on or after D |
| `maxDate` | date | `maxDate` | Enter a date on or before D |

- A rule's parameter is a setting with the same name as the rule, so a rule is switched on and configured in the same place as every other setting.
- An instance replaces a message through the `messages` setting, keyed by rule id: `"messages": { "pattern": "Enter a valid email address" }`.
- Rules run in the order the definition lists them; the first broken rule gives the error. Every rule except `required` passes an empty value.
- `required` on text treats whitespace-only as empty. The stored value is not trimmed.

**Text that cannot be read.** A number or date control can hold text that is not a number or a date. The control reports that to the store (`field.setUnreadable(message)`); the field then has no value and fails validation with that message until the text can be read. This is a property of the control, not a rule, so it has no setting.

### When errors appear

The pattern is "reward early, punish late":

1. Nothing is shown while a person first types in a field.
2. Leaving a field validates it and shows its error.
3. Submitting validates every field on screen and shows every error.
4. Once a field shows an error, each change re-validates it, so the error disappears the moment the value is valid, and its text stays correct while it is not.

This needs no "touched" or "dirty" flags: the only state is the error currently shown. Controls with a popup (Select, date picker) count as left when focus leaves the control and its popup is closed.

### Submit and reset

- **Submit** validates the fields currently mounted, in document order. If any fail, focus moves to the first failing control; document order is visual order, because regions render in order and stacked columns keep it. If none fail, the host page's `onSubmit` receives the values nested by data path. The renderer stores nothing.
- **Reset** returns every value to its default, clears every error, and tells controls to drop any text they were holding.
- Only mounted fields are validated. A field inside an unknown container, or one whose component threw, is not on screen and so cannot block a submit. The same rule will cover fields hidden by a condition in Phase 6.
- The form is a real `<form novalidate>`, so Enter in a text input submits, and the browser's own validation bubbles never appear.

### Accessibility

- The label is a `<label>` bound to the control. Required fields carry `aria-required="true"` and a visible marker that is hidden from assistive technology (the attribute already says it).
- An invalid control has `aria-invalid="true"` and `aria-describedby` naming its help text and its error. The error element is `role="alert"`, so it is announced when it appears.

## Which later phase this serves

| Decision | Serves |
| --- | --- |
| Per-field subscriptions | Phase 6: a dependency re-renders only the fields that depend on the changed one |
| Store outside React | Phase 6: `form.components.<name>.value` reads and writes the same store |
| Values keyed by id, nested by path on submit | Phase 2: renaming or re-binding never loses state; Phase 5: paths map to entity properties |
| Only mounted fields validate | Phase 6: conditional visibility |
| Rules as data read from settings | Phase 3: rules edited in the properties panel; Phase 6: rules switched by scripts |

## Consequences

- We own a small piece of code that a library would otherwise provide, including its tests. The render-isolation test (C1-17) guards the property that justifies it.
- Async and cross-field validation are not built. Both fit the store (a rule that returns a promise; a rule that reads other fields) and are left to the phase that needs them.
- Value types, `null` for no value and the date format are frozen after this phase.
