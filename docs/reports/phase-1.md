# Phase 1 report

> Last update: 13 Nov 2026. Every deliverable is built, every check that can run locally passes, and the pull request is open. The CI result for the pull request is at the end of this report.

## Status

- [x] 3 Form document
- [x] 4 Component contract
- [x] 5 Values and validation
- [x] 6 Runtime renderer
- [x] 7 The ten components
- [x] 8 Server and API
- [x] 9 Forms pages
- [x] 10 Seeded demo form

## What was built

**Contracts (`crates/contracts`)**

- `FormDocument`, `ComponentInstance`, `SlotStyle` with its value types (`ColorValue`, `Radius`, `FontWeight`, `Space`), the API types (`FormSummary`, `FormList`, `FormRecord`, `CreateFormRequest`, `UpdateFormRequest`) and `ErrorDetail`. `ApiErrorBody` gains the optional `details`.
- `FORM_FORMAT_VERSION` is exported to TypeScript the same way `APP_NAME` is. 24 generated files; CI still fails if they are stale.

**Server (`crates/server`)**

- Migration 2 adds the `forms` table. `--demo` seeds "Person details" from `crates/server/seed/person-details.json`, with the fixed id `person-details`.
- `GET`, `POST /api/forms` and `GET`, `PUT`, `DELETE /api/forms/{id}`, with revisions and the 409 `revision_conflict`.
- Structural validation (`forms/validate.rs`): format version, shape, ids, names, data paths, style values. Every problem is reported at once, each with its path, as 400 `invalid_form` with `details`.
- New error codes, all in the standard shape: `form_not_found` (404), `invalid_form` (400), `invalid_request` (400, the body could not be used at all), `revision_conflict` (409), `payload_too_large` (413).

**Forms runtime (`web/src/forms/runtime`)**

| File | Holds |
| --- | --- |
| `definition.tsx`, `hosts.tsx` | The component contract: `defineInput`, `defineContainer`, `defineStatic`, `createRegistry` |
| `settings.ts` | Setting descriptors and `resolveSettings` (stored value if valid, else the default) |
| `rules.ts` | The nine rules and the settings they read |
| `styles.ts` | Slot style resolution: typed values to CSS, in one place |
| `store.ts` | `FormStore`: per-field snapshots and subscriptions, validation timing, submit, reset |
| `model.ts` | A document checked against the registry: nodes, fields, recorded problems |
| `renderer.tsx`, `placeholders.tsx` | `FormRenderer`, the unknown and error placeholders, the per-instance error boundary |
| `dates.ts`, `values.ts` | Calendar dates without time zones; value types, normalising, nesting by path |

**The ten components (`web/src/forms/components`)**, one folder each: `index.ts` (the definition), `settings.ts`, the renderers, and tests. `web/src/forms/registry.ts` registers them, one line each. Shared label, help text, error and read-only value are in `web/src/forms/parts`.

| Component | Type id | Value | Rules |
| --- | --- | --- | --- |
| Text field | `text-field` | Text | required, minLength, maxLength, pattern |
| Text area | `text-area` | Text | required, maxLength |
| Number field | `number-field` | Number | required, wholeNumber, min, max |
| Select | `select` | Option | required |
| Checkbox | `checkbox` | Boolean | required (must be checked) |
| Switch | `switch` | Boolean | none |
| Date picker | `date-picker` | Date | required, minDate, maxDate |
| Button | `button` | none | |
| Container | `container` | none; region `content` | |
| Columns | `columns` | none; regions `col1` to `col4` | |

**Pages**

- `/forms` lists the forms (name, description, last updated), with an empty state, a loading state, and an error state with Retry.
- `/forms/<id>` shows the form's name as the page title, an Edit / Read-only switch, the rendered form, and after a valid submit the success message and the "Submitted data" panel. An unknown id shows `form-not-found` with a link back.
- Forms is no longer an upcoming page (`web/src/app/pages.ts`), and the roadmap marks Phase 1 as built.

**shadcn/ui components added** with the CLI: Field, Label, Textarea, Select, Checkbox, Switch, Calendar, Popover, Input Group (which brought `react-day-picker` 10 and `date-fns` 4). Each was moved onto the tokens: raw sizes replaced, per-component focus rings removed in favour of the global one, `"use client"` removed, lint findings fixed. Notable edits:

- **Invalid state**: a destructive border plus a 1px destructive ring, on Input, Textarea, Select, Checkbox, Switch and Input Group (see ADR 0006: the ring cannot be removed by a border-colour override).
- **Field**: no longer turns the label red when invalid; `FieldError` takes children only.
- **Calendar**: its inner components moved out of the render function; day buttons carry `data-day="YYYY-MM-DD"`.
- **Input Group**: shows the focus ring around the whole group (one rule in `index.css`), and lost the click handler on its addon.
- **Select**: the chevron is a child of the icon part, so the trigger's text is the option's label alone.

**Tests**

| Suite | Count | Phase 0 |
| --- | --- | --- |
| Server and contracts (`cargo test`) | 78 | 38 |
| Frontend unit (Vitest) | 504 | 32 |
| Style guard (`node --test`) | 9 | 9 |
| End-to-end (Playwright, release binary) | 72 | 37 |

Every unit test now fails if anything is written to `console.error` or `console.warn` (`web/src/test/console.ts`). The resilience tests are the only ones that opt out.

**Acceptance checks**

| Check | Covered by |
| --- | --- |
| C1-1 to C1-6, C1-8 to C1-12, C1-18 | `web/e2e/forms.spec.ts`, each named in its test title |
| C1-7 Date in any time zone | `forms.spec.ts` with the browser in `Etc/GMT+8` and `Etc/GMT-12`; also unit tests of the date helpers and the Date picker in those zones |
| C1-14, C1-15 API | `web/e2e/forms-api.spec.ts`; also `crates/server/tests/forms.rs` |
| C1-16 Resilience | `web/src/forms/runtime/renderer.test.tsx` |
| C1-17 Render isolation | `renderer.test.tsx`: typing five characters renders that field five times and the other four fields not at all |
| C1-19 Phase 0 still passes | The 37 Phase 0 end-to-end tests run in the same suite |
| C1-13 Dark mode, C1-20 Visual quality | By eye. I reviewed screenshots of the release build in light and dark, with and without errors, with the Select and calendar open, read-only, and at 390px. One thing to look at: see deviation 9 |

## Design decisions (link ADRs; for each, the later phase it serves)

Each ADR ends with a "Which later phase this serves" table.

| ADR | Decision | Serves |
| --- | --- | --- |
| [0003: the form document format](../adr/0003-form-document.md) | A nested tree of instances with ids, names, sparse settings, typed slot styles and named regions; one format version | 2 (move by id), 3 (set or default), 4 (styles as data), 5 (data paths), 6 (`form.components.<name>`) |
| [0004: the component definition contract](../adr/0004-component-contract.md) | One folder and one registry line per component; three `define*` helpers; settings, slots and values typed from the definition | 2 (palette, drop targets), 3 (generated properties panel), 5 (value types), 6 (actions, rules) |
| [0005: form state and validation](../adr/0005-form-state-and-validation.md) | Our own small store with per-field subscriptions, no form library; rules as data; errors on leaving a field or on submit | 6 (dependencies between fields, scripting), 3 (rules edited as settings) |
| [0006: how style overrides reach a component's slots](../adr/0006-slot-styles.md) | Typed values per slot, resolved in one function and written onto the slot's own element | 3 (one style editor for every slot), 4 (theme tokens, theme defaults per slot) |
| [0007: the error shape's `details` field, and the forms API](../adr/0007-error-details-and-forms-api.md) | Optional `details: [{ path, message }]`; the five endpoints, revisions and 409 | 2 (saving from the designer, pointing at the faulty instance) |

Decisions the spec left to me:

- **The date picker takes typed dates as well as picked ones.** The input accepts `1990-03-14` and `14 March 1990` (the month may be shortened to three letters or more) and shows `14 March 1990` once typing is over. Day-first and month-first numeric forms such as `14/03/1990` are refused rather than guessed. Typing is also how a date outside the allowed range can be entered and then reported (C1-4); the calendar disables those days. The calendar has month and year dropdowns, so a date of birth is a few steps away.
- **Notes over 500 characters shows an error; input is not cut off.** A person who pastes too much can see what to trim. The same holds for every length limit.
- **A number field is a text input with a numeric keypad hint**, not `type="number"`. Text that is not a number ("two") is an error, "Enter a number", not a silent blank. The same mechanism serves the date picker.
- **Read-only** shows an em dash for an empty value, with "No value" for screen readers; booleans as Yes or No; dates as `14 March 1990`.
- **An optional Select can be cleared**: its list starts with an item that sets no value. A required Select has none.
- **The error sits between the control and the help text**, so it is next to what it is about.
- **The header shows "Forms" on a form's page**; the page's own heading shows the form's name.

## Deviations from the spec, with reasons

1. **`GET /api/forms` returns `{ "forms": [...] }`, not a bare list.** Paging can be added later without changing the shape. Recorded in ADR 0007.
2. **Data paths must not contain one another**, as well as being unique: `contact` and `contact.method` cannot both hold a value, because the values are nested by path. The server refuses such a document.
3. **Nesting depth: unlimited in the format, 41 levels on the server.** The JSON parser's recursion limit refuses a document nested 42 containers deep, with 400 `invalid_request`. I measured this against the running server. Lifting it means an unbounded parser plus stack growth; I judged a form 42 levels deep not worth that, and left it.
4. **The server returns a stored document exactly as it was stored**, key order included, rather than re-serialising it through the typed structure. A document written by a newer build therefore still reaches the client, which shows the "unknown format version" message. Documents are fully checked when written.
5. **Unknown keys in a document are refused** (`deny_unknown_fields`). The spec asks for structure to be checked; a misspelt key that is silently dropped is the kind of error that check is for.
6. **Blur validation waits until a pointer press inside the form is over.** Found by the end-to-end tests: clicking Submit took focus from the field being edited, its error appeared, the button moved down, and the click missed. Leaving a field is now judged just after the press ends. Keyboard behaviour is unchanged.
7. **The demo form has two things the spec's table does not list**: a placeholder on Email (`name@example.com`) and help text on Number of dependants, so the demo shows both features.
8. **Extra test ids**, all under the same convention, because tests use them or because CLAUDE.md asks for one on every interactive element: `field-<name>-control`, `field-<name>-trigger`, `field-<name>-popup`, `field-<name>-option`; `forms-item-name`, `forms-item-description`, `forms-item-updated`; `forms-error`, `form-error` and their `-retry`; `form`, `form-back-link`, `form-not-found-link`, `form-unsupported-version`, `page-description`.
9. **The Email label is hard to read in dark mode.** The spec fixes it as the literal `#003BB2`, which reaches about 2.1:1 on the dark card. It is a literal on purpose (C1-10 reads `rgb(0, 59, 178)`), and a literal cannot follow the theme; `{ "token": "primary" }` would. Everything else is legible in dark mode. If C1-13 is to pass strictly, the demo should use the token and C1-10 should read the token's colour.
10. **A Button whose background is overridden keeps that background on hover** (ADR 0006). State-specific overrides are left to Phase 3.
11. **Subagents.** As the spec asks, the nine components after the Text field were given to four subagents. One finished (Text area, Number field). The other three were cut off by a usage limit with their components written and most tests passing; I finished them myself: the Date picker's tests, three lint and type errors, and leftover debug code.

Changes to Phase 0 code, beyond adding to it:

- `tokens.css`: named space steps (`--sys-space-none` to `-xl`), `--sys-radius-none` and `--sys-radius-full`. A document refers to these by name.
- `theme.css`: on a popup, the highlight fill is one step stronger. In dark mode the ordinary fill was the colour of the popup itself, so a highlighted option did not show.
- `index.css`: the input-group focus rule; `scroll-padding-top`, so a field focused after a failed submit is not hidden under the sticky header.
- `Page` takes an optional breadcrumb and actions. The sidebar keeps a section current on its sub-pages.
- Phase 0 tests that expected Forms to be an upcoming page were updated. No Phase 0 test was removed.

## Deferred

- Showing a document's recorded problems (unknown region, invalid setting, unknown slot) to its author. The model collects them with paths; the designer is where they belong (Phase 2).
- The component id generator (`c_` plus ten base-32 characters). Nothing creates instances until Phase 2.
- State-specific style overrides (hover), and per-side padding (Phase 3).
- Theme defaults per component type and slot (Phase 4). ADR 0006 says how they merge.
- Async and cross-field validation; a custom message for text that cannot be read; an error summary at the top of a long form (Phase 6 or when needed).
- A character counter on Text area.
- A minus key on iOS: the numeric keypad hint has none, so a number field that allows negatives is awkward there.
- Lifting the server's nesting limit (deviation 3).
- Locale-aware dates, numbers and messages. Internationalisation is out of scope; dates are written `14 March 1990` everywhere.
- Deleting or renaming a form from the UI. The API does both.
- Splitting the JavaScript bundle: it is now 695 kB (219 kB gzipped) in one file, mostly the calendar and its date library. Vite warns above 500 kB.
- Still open from Phase 0: an automated guard for raw values in components.

## Blockers

None.

## How to run

From the repository root:

| To | Run |
| --- | --- |
| Develop | `node scripts/dev.mjs`, then open the Vite address it prints |
| Build the release binary | `node scripts/build.mjs` |
| Run it with the demo form | `./dist/shesha2-linux-x86_64/shesha2 --demo`, then open the printed address and go to Forms |
| Run all checks | `node scripts/check.mjs` |
| Run the end-to-end tests | `node scripts/e2e.mjs` (after a build) |
| Run them without a release build | `cargo build -p server`, `npm run build` in `web/`, then `node scripts/e2e.mjs --binary target/debug/shesha2` |
| Regenerate shared types | `node scripts/generate-types.mjs` |

Creating a form through the API is shown in the README.

## CI and end-to-end results

**Local, Linux x86_64, before the pull request**

| Check | Result |
| --- | --- |
| Frontend typecheck, lint, 504 unit tests, build | Pass |
| `cargo fmt --check`, clippy with `-D warnings`, 78 tests | Pass |
| Generated types up to date | Pass |
| Style guard and its 9 tests | Pass |
| Release build (static musl, 6.0 MB) and smoke test | Pass |
| Playwright, 72 tests against the release binary | Pass, two runs in a row |

One earlier run had a single failure in a Phase 0 test ("shuts down cleanly on Ctrl+C") while four subagents were running their own test suites on the same machine. It passed when re-run alone and in every run since. I have not seen it fail on an idle machine.

**GitHub Actions**

See the pull request's Checks tab for the run on the current head. The result is recorded here once the run has finished.

Still open for the phase to be accepted: the manual pass of the checks in section 13 in Chrome, C1-13 and C1-20 by eye, and a decision on deviation 9.
