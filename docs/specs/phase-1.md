# Phase 1 — Form schema and runtime renderer

Shesha 2.0 · Phase 1 spec · v1.0 · 13 November 2026

Place this file at `docs/specs/phase-1.md`. Start this phase from `main` after Phase 0 has been merged.

## 1. Goal

Define what a form is, and render it.

This phase designs the form document format and the component contract that every later phase builds on. It builds the first ten components, renders forms in edit and read-only modes with validation, stores forms on the server, and lists them on the Forms page.

There is no designer yet. The demo form is seeded, and other forms are created through the API. The designer (Phase 2), properties panel (Phase 3), theme editor (Phase 4), entity binding (Phase 5) and scripting (Phase 6) will all be built on what this phase defines. Getting the contracts right matters more than the number of features.

## 2. How to work in this phase

- You own this codebase and its design. Where restructuring gives a better result than adding layers, restructure.
- Finish the whole phase before stopping. Do not end with a list of remaining work unless you are genuinely blocked. If blocked, record exactly what blocked you in the report and stop.
- Build only what this spec lists. Anything worth doing beyond it goes under "Deferred" in the report.
- Keep `docs/reports/phase-1.md` updated as you go. Another model may continue this session from it.
- Read `CLAUDE.md`, `docs/roadmap.md`, the Phase 0 report and ADRs 0001 and 0002 before starting.
- Check current versions when adding packages, and read installed source rather than relying on memory.
- **Design first.** Before writing component code, write short ADRs for:
  1. the form document format,
  2. the component definition contract,
  3. form state and validation, including any library you choose and why,
  4. how style overrides reach a component's slots.
- For each decision, say in the ADR which later phase it serves. Build only what this phase needs, but don't make later phases impossible.
- **Build order.** Contracts, then the renderer, then the Text field end to end with its tests, then the other nine components. Use subagents for those nine once the Text field is done.
- Before reporting done, run every check in section 13 that can run in CI and fix what fails. Every Phase 0 check must still pass.

## 3. The form document

You design the exact shape and record it in an ADR. It must meet these requirements:

| # | Requirement | Why |
| --- | --- | --- |
| D1 | The whole document has one integer format version. A document with a version this build doesn't know shows a clear message instead of rendering. | The format changes in one place, never per component. |
| D2 | Every component instance has an id, a type and a name. The id is generated, stable, never reused and never shown to users. The name is unique within the form and is a valid JavaScript identifier. | Phase 2 moves instances by id. Phase 6 exposes `form.components.<name>`. |
| D3 | Containers hold ordered children in named regions: Columns has one region per column, Container has one. Nesting has no depth limit. | In Phase 2, any instance can move to any region in one operation. |
| D4 | An input binds to a data path: identifier segments joined by dots, such as `contact.preferredMethod`. No two inputs in one form share a path. | Nested data now; entity properties in Phase 5. |
| D5 | An instance stores only the settings it changes. Defaults live in the component definition and are never copied into documents. | Changing a default updates every instance that didn't override it. Phase 3 shows "set or default" with a reset. |
| D6 | Style overrides are stored per named slot, as typed values from a fixed set of style properties such as colour, background, border colour, radius, font weight and padding. A colour can be a literal value or a reference to a theme token. Never free-form CSS, class names or selectors. | Phases 3 and 4 edit styles as data, with no override layers. |
| D7 | Spacing between components belongs to their container, as a gap. Components have no margin settings. | One place controls layout rhythm. |
| D8 | Documents are plain JSON that a person can read. | Easy to debug, diff and generate. |

**Where it is defined.** The document crosses the API, so per `CLAUDE.md` its structure is defined in `crates/contracts` and generated into TypeScript. Each component type's settings are defined with that component in `web/` and stored inside the document as JSON values.

The server checks structure: format version, unique ids, unique and valid names, and unique and valid data paths. The client checks everything that depends on component types: types, regions and settings. If you find a better split, change it through an ADR.

**Resilience.** A bad document never takes the form down:

- An unknown component type renders a visible placeholder naming the type. The rest of the form works.
- An invalid setting value falls back to that setting's default.
- A component that throws while rendering shows an error placeholder in its place. The rest of the form keeps working.

## 4. The component definition contract

- **One folder per component.** Registering a component is one line in one registry. No code outside a component's folder switches on component type.
- **What a definition declares:**
  - type id, display name, one-line description, category and icon
  - settings, each with a default, a label, optional help text and a group (Phase 3 generates the properties panel from these)
  - named style slots
  - child regions (containers only)
  - value type (inputs only)
  - supported validation rules
  - renderers for edit and read-only modes
- **Typed end to end.** A renderer receives its settings typed from its definition. No `any`, and no casts at call sites.
- **Built on shadcn/ui.** Components compose the shadcn/ui components in `web/src/components/ui`, added with the shadcn CLI (for example Field, Label, Textarea, Select, Checkbox, Switch, Calendar and Popover). Each slot maps to a real part of the component; use the `data-slot` attributes shadcn already sets where they exist.
- **Tested.** Each component has unit tests for its default render, its read-only render, every validation rule it supports, and keyboard operation.

## 5. Values and validation

| Value type | Stored as | No value |
| --- | --- | --- |
| Text | string | `null` |
| Number | JSON number, never a string | `null` |
| Boolean | `true` or `false` | `false` |
| Date | `"YYYY-MM-DD"`, the same in every time zone | `null` |
| Option | the option's value, a string | `null` |

An empty text input is `null`, never `""`.

**Rules in this phase:** required; minimum and maximum length (text); minimum, maximum and whole number (number); pattern with a message (text); minimum and maximum date (date). Required on a checkbox means it must be checked. Every rule has a default message, and an instance can set its own.

**Behaviour.** You design the details to current best practice. These must hold:

- Each error shows beside its field.
- An error appears after a field is left, or on submit, not while someone is first typing.
- When a submit fails, focus moves to the first invalid field in visual order.
- Fixing a field clears its error straight away.
- Errors are announced to assistive technology, for example with `aria-invalid` and `aria-describedby`.
- Typing in one field re-renders only that field. Prove it with a unit test that counts renders of the other fields. This keeps large forms fast when Phase 6 adds dependencies between fields.

## 6. Runtime renderer

- Renders a document in **edit** or **read-only** mode.
- **Read-only** shows values as text: an option's label, "Yes" or "No" for booleans, a readable date, and a clear marker for empty values. No editable controls; Submit and Reset are not available.
- **Submit** validates. If the form is valid, it hands the typed values to the host page, nested by data path. The renderer does not store submissions.
- **Reset** returns every value to its default and clears all errors.
- **Columns respond to their own width**, using container queries rather than the viewport, so they will work inside dialogs and side panels later. They stack into one column when narrow.
- Inputs have visible labels, required marking (visual and programmatic) and optional help text.
- In this phase a Button can submit or reset. Other actions come in Phase 6.
- Every rendered instance has `data-testid="field-<name>"`. Its error has `field-<name>-error`, and its read-only value has `field-<name>-value`.

## 7. The ten components

You may add sensible settings and slots. These are the minimum:

| Component | Value | Minimum settings | Minimum slots |
| --- | --- | --- | --- |
| Text field | Text | label, help text, placeholder, default, required, min and max length, pattern and message | root, label, control, description, error |
| Text area | Text | label, help text, placeholder, default, required, max length, rows | root, label, control, description, error |
| Number field | Number | label, help text, placeholder, default, required, min, max, whole numbers only | root, label, control, description, error |
| Select | Option | label, help text, placeholder, options (label and value), default, required | root, label, trigger, popup, item, description, error |
| Checkbox | Boolean | label, help text, default, required | root, control, label, description, error |
| Switch | Boolean | label, help text, default | root, control, label, description |
| Date picker | Date | label, help text, placeholder, default, required, min date, max date | root, label, trigger, popup, description, error |
| Button | none | label, action (submit or reset), variant (shadcn's variants) | root |
| Container | none; one region | title (optional), direction (vertical or horizontal, wrapping), gap | root, title |
| Columns | none; 2 to 4 regions | number of columns, column widths, gap, width below which it stacks | root |

Slots are separate so each part is styled on its own. For example, Select's popup and items never inherit the trigger's padding.

The date picker must be fully usable with mouse or keyboard. Whether people can also type a date is your call, recorded in the report.

## 8. Server and API

- A migration adds storage for forms.
- All request and response types live in `crates/contracts`.

| Endpoint | Behaviour |
| --- | --- |
| `GET /api/forms` | Summaries (id, name, description, last updated, revision), most recently updated first |
| `POST /api/forms` | Creates a form; 201 with the stored document and its revision |
| `GET /api/forms/{id}` | The document and its revision |
| `PUT /api/forms/{id}` | The body includes the revision it was based on. A stale revision returns 409 `revision_conflict`. Success returns the new revision |
| `DELETE /api/forms/{id}` | 204 |

- An unknown id returns 404 `form_not_found`.
- An invalid document returns 400 `invalid_form`, listing each problem with its path and message.
- That list needs an optional `details` field on the standard error shape. The change is additive, but the error shape is frozen, so record it in an ADR.
- `--demo` seeds the demo form in section 10.

## 9. Forms pages

- **`/forms`** lists every form with its name, description and last-updated time, and has an empty state when there are none. Each form opens `/forms/<id>`.
- **`/forms/<id>`** shows the form's name as the page title, an Edit / Read-only switch, and the rendered form. After a valid submit it shows a success message and a "Submitted data" panel with the values as formatted JSON.
- An unknown id shows a not-found state with a link back to Forms.
- Forms is no longer an upcoming page. Update `web/src/app/pages.ts` and mark Phase 1 as built in `docs/roadmap.md`.

**Test IDs:** `forms-list`, `forms-item` (one per form), `forms-empty`, `form-mode-edit`, `form-mode-read-only`, `form-submit-success`, `form-submitted-data`, `form-not-found`, `component-unknown`, `component-error`.

## 10. Seeded demo form

Name: **Person details**. Description: "Demo form covering every Phase 1 component. The Email label is blue on purpose: it shows a style override."

Layout, top to bottom:

1. Columns (2): First name | Surname
2. Email
3. Columns (2): Date of birth | Number of dependants
4. Preferred contact method
5. Notes
6. Container titled "Preferences": Subscribe to updates, then I accept the terms
7. Container, horizontal: Submit, Reset

| Name | Component | Data path | Rules and settings |
| --- | --- | --- | --- |
| `firstName` | Text field | `firstName` | required; max 50 |
| `surname` | Text field | `surname` | required; max 50 |
| `email` | Text field | `email` | required; email pattern, message "Enter a valid email address"; style override: label colour `#003BB2` |
| `dateOfBirth` | Date picker | `dateOfBirth` | required; min date 1900-01-01 |
| `dependants` | Number field | `dependants` | whole numbers; min 0; max 20 |
| `preferredContact` | Select | `contact.preferredMethod` | required; options Email (`email`), Phone (`phone`), Post (`post`) |
| `notes` | Text area | `notes` | max 500 |
| `subscribe` | Switch | `preferences.subscribe` | default on |
| `acceptTerms` | Checkbox | `preferences.acceptTerms` | required |
| `submit` | Button | none | action submit; primary variant |
| `reset` | Button | none | action reset; outline variant |

## 11. Out of scope

The designer and any form-creation UI; the properties panel; the theme editor; entity binding, data tables and reference lists; expressions, scripting, events and actions other than submit and reset; storing submissions; file upload, rich text and components beyond the ten; permissions; internationalisation.

## 12. Frozen after this phase

Changing any of these later needs a new ADR:

- the form document format and its versioning rule
- the component definition contract and the one-line registry
- value types, including `null` for no value and the date format
- data path and component name rules
- the style override model: named slots and typed style properties
- the forms API, including revisions and the 409 conflict response
- the error shape's `details` field

## 13. Acceptance checks

Chrome checks run against the release binary started with `--demo`, in light mode at 1280 px wide unless stated. Checks marked CI also run as automated tests; checks marked "CI only" run only there.

| # | Check | Steps | Expected | CI |
| --- | --- | --- | --- | --- |
| C1-1 | Forms list | Open Forms | "Person details" is listed with its description; clicking it opens the form; zero console errors | Yes |
| C1-2 | All components render | Open Person details | Every instance in section 10 is visible with its label; required fields are marked | Yes |
| C1-3 | Required errors | Click Submit on the empty form | First name, Surname, Email, Date of birth, Preferred contact method and I accept the terms each show an error beside them; focus is on First name; no submitted data shown | Yes |
| C1-4 | Rule errors | Enter Email `abc`; Dependants `25`, then `1.5`; a date of birth before 1900-01-01; leave each field | Each shows its matching error. Notes can't end up over 500 characters: either input stops at 500 or an error shows | Yes |
| C1-5 | Errors clear | Correct each field from C1-4 | Each error disappears as soon as its field is valid | Yes |
| C1-6 | Valid submit | Fill every field validly, leave Notes empty, submit | Success message; Submitted data shows `contact.preferredMethod` and `preferences` as nested objects, `dependants` as a number, `dateOfBirth` as `YYYY-MM-DD` matching the date picked, and `notes` as `null` | Yes |
| C1-7 | Date in any time zone | Pick the same date with the browser in UTC−8 and UTC+12 | The submitted value is the same date in both | CI only |
| C1-8 | Read-only | Switch to Read-only, then back to Edit | Values show as text (option label, Yes or No, readable date, a marker for empty); no editable controls; no Submit or Reset. Back in Edit, values are unchanged | Yes |
| C1-9 | Reset | Fill some fields, trigger errors, click Reset | Every field is back to its default (Subscribe on, everything else empty or off); no errors | Yes |
| C1-10 | Slot override | Read the computed colours of the Email label, the First name label and the Email input text | Email label `rgb(0, 59, 178)`; First name label and Email input text unchanged from their defaults | Yes |
| C1-11 | Columns follow their width | View at 1280 px, then 390 px | Side by side at 1280 px; stacked at 390 px; no horizontal scroll | Yes |
| C1-12 | Keyboard only | Fill and submit the whole form with the keyboard only | Every control works, including Select, the date picker, Checkbox and Switch; focus ring always visible; tab order follows the visual order | Yes |
| C1-13 | Dark mode | Switch to dark and view the form, with and without errors | Everything legible; errors clearly visible | No (by eye) |
| C1-14 | API reads | Open `/api/forms` and `/api/forms/<id>` | JSON as in section 8 | Yes |
| C1-15 | API writes | Create, update, update with a stale revision, save an invalid document, delete | 201; new revision; 409 `revision_conflict`; 400 `invalid_form` with details; 204 | CI only |
| C1-16 | Resilience | Render a form containing an unknown type, an invalid setting and a component that throws | Placeholders shown for the unknown type and the throwing component; the invalid setting uses its default; the rest of the form works | CI only |
| C1-17 | Render isolation | Unit test from section 5 | Typing in one field doesn't re-render the others | CI only |
| C1-18 | Unknown id | Open `/forms/does-not-exist` | `form-not-found` with a link back to Forms | Yes |
| C1-19 | Phase 0 still passes | Run the Phase 0 end-to-end suite | All pass | CI only |
| C1-20 | Visual quality | Review the Forms list and Person details in light and dark | Modern and polished; consistent spacing and alignment; nothing clipped | No (by eye) |

The resilience test is the only test allowed to see the error report its throwing component triggers. Every other check requires zero console errors and warnings.

## 14. Definition of done

- Every requirement in sections 3 to 10 is met.
- ADRs exist for the four design decisions in section 2 and for the error-shape change.
- CI is green on the pull request, including all end-to-end tests.
- `docs/reports/phase-1.md` is complete, with deviations and decisions listed.
- `docs/roadmap.md` marks Phase 1 as built.
- A pull request is open with a summary that links the report.

The phase is accepted when the Chrome checks in section 13 pass.

---

## Appendix — report template (`docs/reports/phase-1.md`)

```markdown
# Phase 1 report

## Status
- [ ] 3 Form document
- [ ] 4 Component contract
- [ ] 5 Values and validation
- [ ] 6 Runtime renderer
- [ ] 7 The ten components
- [ ] 8 Server and API
- [ ] 9 Forms pages
- [ ] 10 Seeded demo form

## What was built
## Design decisions (link ADRs; for each, the later phase it serves)
## Deviations from the spec, with reasons
## Deferred
## Blockers
## How to run
## CI and end-to-end results
```
