# Phase 5 report

> Last update: 16 Nov 2026. The phase is complete. Every requirement in sections 3 to 8 is built, ADR 0011 is written, and every check passed in the session before the one push. What CI is expected to say is at the end. Per the working rules, CI is not watched and this report is not updated with its result.

## Status

- [x] 3.1 Defining entities
- [x] 3.2 Property types
- [x] 3.3 Safe changes
- [x] 3.4 Reference lists
- [x] 4 Data API
- [x] 5.1 Binding
- [x] 5.2 Properties in the designer
- [x] 5.3 Loading and saving
- [x] 6 Four components
- [x] 7 Demo data
- [x] 8 Small fixes

## What was built

**Contracts (`crates/contracts/src/entities.rs`, `data.rs`)**

| Part | Holds |
| --- | --- |
| Definitions | `EntityDefinition`, `PropertyDefinition`, `PropertyType`, `ReferenceListDefinition`, `ReferenceListItem`, `ItemColor` |
| Definitions API | `EntityRecord`, `EntityList`, `CreateEntityRequest`, `UpdateEntityRequest` (with `fill`), and the same four for reference lists |
| Rows | `DataRow` (with `display` and `references`), `DataPage`, `DataQuery`, `DataFilter`, `FilterOp`, `DataSort`, `SortDirection`, `CreateRowRequest`, `UpdateRowRequest`, `DataValues` |
| Limits | In `data.ts`: page sizes, filter and sort counts, search length, name and label lengths, 200 properties, 200 items, `ITEM_COLORS`, `SYSTEM_PROPERTIES` |

**Server (`crates/server/src/entities/`, `data/`)**

| File | Does |
| --- | --- |
| `migrations/0004_entities.sql` | The `entities` and `reference_lists` tables: each definition as JSON with a revision. An entity also has its column map and next column number |
| `entities/catalog.rs` | Every definition, read in the request's own transaction, with the generated table and column names |
| `entities/validate.rs` | Every rule for a definition, each problem with its path |
| `entities/schema.rs` | Creating a table; changing it safely (refusals with counts, `fill`, new columns for type changes, dropped columns); deleting it |
| `entities/mod.rs` | `/api/entities` and `/api/reference-lists`, each write in one `BEGIN IMMEDIATE` transaction |
| `entities/seed.rs` | The demo definitions and 58 deterministic rows |
| `data/values.rs` | One value against its property: type, required, limits, list items, retired items |
| `data/rows.rs` | Reading (with references joined), creating, patching with a revision, deleting (refused while referenced) |
| `data/query.rs` | The one query format: checked whole, then built from generated names and bound values |
| `data/mod.rs` | `/api/data/{entity}`, `/query`, `/{id}` |
| `error.rs` | Three generic variants (`Missing`, `Invalid`, `Refused`) carrying their own codes, so new errors need no new variant |

**Frontend**

| Where | What |
| --- | --- |
| `src/data/` | The data API as functions (`api.ts`), a provider and the shared cache (`client.ts`, `provider.tsx`), the definitions as a catalog, rows and pages as queries, the row combobox, how components open a form for a row (`navigation.tsx`), property type icons, and an in-memory API for tests |
| `forms/components/` | Four components: `data-table` (with `filters.tsx` and a pure `view.ts`), `reference-list-select`, `entity-picker`, `status-tag`. One registry line each |
| `forms/runtime` | Value type `reference`; setting kinds `entity`, `reference-list`, `form`, `columns`; the form's own `entity` setting; `forProperty` on definitions; the renderer's `values`, `readOnlyPaths` and `onSave`; the store's `load` and `showProblems`; category `data` |
| Existing inputs | Text field, Text area, Number field, Date picker and Checkbox say which properties they edit (`forProperty`) |
| `designer/` | The data panel beside the toolbox; binding problems (`model/binding.ts`) in the problems list and the outline; `add` with a property; editors for the four new setting kinds (`properties/data-editors.tsx`) |
| `app/pages/entities/` | The Entities page: entities and properties, reference lists, the property dialog, delete confirmations that name the forms using what goes |
| `app/pages/forms/bound-form.tsx` | A form bound to an entity: load, save, server errors, conflict, status, the way back |
| `components/` | `status-tag.tsx`, `confirm-dialog.tsx`, and `ui/combobox.tsx` (Base UI's combobox in the style of the other shadcn parts) |

**Tests**

| Suite | Count | Phase 4 |
| --- | --- | --- |
| Rust (`cargo test --workspace`) | 243 | 147 server and contracts |
| Frontend unit (Vitest) | 1031 in 51 files | 965 in 45 |
| Style guard (`node --test`) | 9 | 9 |
| End-to-end (Playwright, release binary) | 181 | 156 |

New server tests: `crates/server/tests/entities.rs` (50) and `data.rs` (43), with shared helpers in `tests/support/`. New end-to-end tests: `web/e2e/entities.spec.ts` (18) and `web/e2e/phase5-fixes.spec.ts` (7). Each Phase 5 end-to-end test starts a server of its own with `--demo`, because each one changes data; the worker's shared server is left as the earlier phases' tests expect it.

**Acceptance checks**

| Check | Covered by |
| --- | --- |
| C5-1 to C5-18 | `web/e2e/entities.spec.ts`, each named in its test title. The API side is in `crates/server/tests/entities.rs` and `data.rs`, each test marked with its check |
| C5-19 | `data.rs`: `a_sorted_filtered_and_searched_page_of_10_000_rows_takes_under_200_ms`. Best of three, about 8 ms in the session |
| C5-20 | `web/e2e/phase5-fixes.spec.ts`, one test per fix (two for the slot tag), plus unit tests. The look is by eye |
| C5-21 | The 156 earlier tests run in the same suite (a few changed on purpose, see deviation 8) |
| C5-22 | By eye. I reviewed screenshots of the Entities page (both tabs, the property dialog), People with filters open, and Person, in light and dark at 1280 px, and People at 390 px |

## Design decisions (link ADR 0011)

[ADR 0011: entities and data](../adr/0011-entities-and-data.md) records the decisions the spec asks for, with the alternatives:

| Decision | In short |
| --- | --- |
| Definitions | JSON documents with revisions, in their own tables. Flat limits, each belonging to one type. Item colours are theme roles |
| Tables | One per entity, `entity_<id>`, columns `c<n>`. No typed text in SQL, ever. Column numbers are never reused |
| Safe changes | Compared with the rows inside one write transaction. Refused with counts when values would be lost; `fill` for new required values; a type change only when the column is empty |
| Data API | `/api/entities`, `/api/reference-lists`, `/api/data/{entity}` with `POST …/query`; `PATCH` with a revision for updates |
| Query format | One JSON document: `select`, AND-ed typed `filter`s, `search`, multi-key `sort`, `page`, `pageSize`. Checked whole before any SQL is written |
| Value type | Reference: a row's id, as a string |
| Bound forms | The form's `entity` setting; `values`, `readOnlyPaths` and `onSave` on the renderer; problems from the server on their fields; conflicts with Reload |
| Data table | Everything on the server; real links to rows; aria-sort; typed filters; live status; scrolls inside itself; the view kept while the page is open |

Decisions the spec left to me:

- **The Entities page saves on Save**, not by itself, unlike the designer and the theme editor. A definition change can be refused and changes live data, so it is made deliberately, and its refusal is shown where it was made.
- **Properties are edited in a dialog**, one at a time, with only the limits of their type. A required property on an entity with rows asks there for the value existing rows get.
- **Rows open through real links.** The first column of each row is a link to `/forms/<form>/<id>`, so it can be reached with Tab, opened with Enter, or opened in a new tab. A press anywhere on the row opens it too.
- **The way back** is the page the row was opened from, carried in the navigation state; Forms when there is none.
- **A form holding a data table takes the page's width** (`wantsWidth`, by the component's category, so no page names a type). Forms of fields keep their column.
- **SQL-like search text is a 400**, per spec section 4: `;`, `--`, `/*`, `*/` and control characters. Apostrophes are allowed (O'Brien). Search text is a bound parameter either way.
- **Search ignores case**, and covers display values of referenced rows only when their entity has a display property.
- **Retired items are marked "(retired)"** wherever they show, and are offered only when they are the current value.
- **The data panel sits above the toolbox** in the designer's left column. It is one Tab stop with the arrow keys, like the toolbox.
- **Small fixes (section 8).** Publish and Discard use `aria-disabled` and keep focus on the button pressed; the result is announced. The component grid is a roving Tab stop: Left and Right move along reading order, Up and Down by a row. The status bar gives the save error a row of its own. The action bar is sticky, and `--page-sticky-height` feeds `scroll-padding-top`, so focused fields are not hidden under it. Announcements name the component ("Background of Card's whole component: Success."). The slot tag is placed by measuring among six places outside the part, clear of its other parts and the name badge, and the root outline leaves a gap around the badge.

## Deviations from the spec, with reasons

1. **Additions to frozen contracts, all optional and additive.** ADR 0004: `forProperty` on input definitions, category `data`, and setting kinds `entity`, `reference-list`, `form`, `columns` (with `entityFrom` on the descriptor). ADR 0005: value type `reference`; the store takes loaded values and has `load` and `showProblems`. ADR 0003: no change; the form's `entity` is one more form setting. The renderer gained optional `values`, `readOnlyPaths` and `onSave`. `onSubmit` is unchanged.
2. **ADR 0008's `add` command takes an optional `property`.** Without it, nothing changes. With it, the instance is named after the property when that name is free, otherwise by ADR 0008's rule, and starts with the property's settings.
3. **Status tag binds like an input** (it has a data path and value type Option), because that is how a component gets a value. It never changes the value, takes no focus, and has no rules.
4. **The form's back link is `form-back`** (the spec's id) on every form page. It was `form-back-link`. The earlier tests that used it were updated.
5. **Extra test ids**, all under the same convention: `entities-tab`, `entities-empty`, `entities-loading`, `entities-error`, `entity-list`, `entity-save`, `entity-save-status`, `entity-error`, `entity-name-error`, `entity-properties`, `property-<name>-type`, `property-system-<name>`, `property-dialog`, `property-save`, `property-error`, `property-name-error`, `property-help-text`, `property-max-length`, `property-multiline`, `property-whole`, `property-min`, `property-max`, `property-earliest`, `property-latest`, `property-reference-list`, `property-entity`, `property-fill`, `reflist-list`, `reflist-name`, `reflist-display-name`, `reflist-save`, `reflist-save-status`, `reflist-error`, `reflist-delete`, `reflist-items`, `reflist-item-<value>-label`, `-colour`, `-up`, `-down`, `-delete`, `table-scroll`, `table-open-<row id>`, `table-filter-panel`, `table-filter-<property>-from`, `-to`, `table-filters-count`, `table-filters-clear`, `table-empty`, `table-clear`, `table-error`, `table-error-retry`, `table-live`, `confirm-error`, `confirm-usage`, `form-entity-missing`, `form-row-not-found`, `designer-data-missing`. From the section 8 fixes: `theme-action-bar`, `theme-status-note`, `theme-component-<type>-name`, `theme-slot-tag`.
6. **A debug-build setting**: `libsqlite3-sys` is compiled with `opt-level = 3` in the dev profile (root `Cargo.toml`), so the C5-19 test measures the SQLite a release build has.
7. **Node 22 in the session**, as in Phases 3 and 4. `.node-version` asks for 24; CI uses 24.
8. **Changes to earlier phases' tests**, beyond adding to them:
   - `forms.rs`: the two `--demo` tests expect three seeded forms.
   - `app.test.tsx`: Entities is no longer an upcoming page.
   - `designer.test.tsx`: the toolbox has a Data group.
   - `e2e/support/fixtures.ts`: `NAV` marks Entities as built.
   - `designer.spec.ts` C2-14: checks the empty state on `/settings`, because `/entities` is now built.
   - `themes.spec.ts` C4-16: the announcement now names the component (fix 5).
   - `theme/editor/model.test.ts`: two commands carry the component's name.
   - `form-back-link` → `form-back` (deviation 4).

   None was removed.

Changes to earlier phases' code, beyond adding to it:

- `forms/seed.rs`: seeds three forms.
- `lib/api.ts`: a 204 answer has no body; `apiPost` takes a signal; `apiPatch` and `apiDelete`.
- `app/pages.ts`: Entities is a built page; `formPath` takes a row id.
- `app/layout/app-shell.tsx`: provides row navigation.
- `form-page.tsx`: hands bound forms to `BoundForm` and widens forms that hold a table.
- `designer/toolbox.tsx`: a Data group.
- `styles/index.css`: `scroll-padding-top` includes `--page-sticky-height` (fix 4).
- `theme/editor/*` and `designer/canvas*`: the section 8 fixes.

## Deferred

- Converting values when a property's type changes (text "12" to 12). Today such a change is refused while values exist.
- OR groups in filters, filters on a referenced row's properties, and saved views of a table.
- Renaming a property or an entity after it is saved (the spec fixes names).
- Creating a referenced row from inside the entity picker.
- Column widths and resizing in the data table; choosing which columns appear in its filter panel.
- Showing which forms use an entity on the Entities page all the time, not only when deleting.
- A demo table of Organisations (C5-10 builds one in its test).
- A sticky action bar takes about 190 px when stuck at 390 px wide in the theme editor; a compact layout for phones.
- A full-width label's slot tag in the designer can overlap the field above it by 2 to 3 px; it never covers its own component.
- From the spec's section 9: permissions, audit history, child lists, many-to-many, files, computed properties, import and export, bulk editing, entities in code, external databases, scripting.
- Still open from earlier phases: touch dragging, deleting forms from the UI, a designer layout for narrow windows, retrying a failed save by itself, locale-aware formats, an automated guard for raw values in components, and splitting the JavaScript bundle (now 1,017 kB, 318 kB gzipped).

## Blockers

None. Two background helpers stopped part way when they hit a usage limit; their work was resumed or finished in the session, and every check below ran on the final tree.

## How to run

From the repository root:

| To | Run |
| --- | --- |
| Develop | `node scripts/dev.mjs`, then open the Vite address it prints |
| Build the release binary | `node scripts/build.mjs` (the Linux build needs `musl-gcc`: `apt-get install musl-tools`) |
| Run it with the demo data | `./dist/shesha2-linux-x86_64/shesha2 --demo`, then open the printed address |
| Try Phase 5 | Forms → People: search, filter, sort, open a person, save. Entities: add a property, change a list. Designer → Person: the properties beside the toolbox |
| Run all checks | `node scripts/check.mjs` |
| Smoke-test the binary | `node scripts/smoke.mjs` |
| Run the end-to-end tests | `node scripts/e2e.mjs` (after a build) |
| Run them without a release build | `cargo build -p server`, `npm run build` in `web/`, then `node scripts/e2e.mjs --binary target/debug/shesha2` |

## Checks run in the session, and the CI result expected

**Run in the session, Linux x86_64, on the tree that was pushed**

| Check | Result |
| --- | --- |
| Typecheck (`tsc -b`) | Pass |
| Lint (oxlint with warnings as errors, Prettier) | Pass |
| Frontend unit tests, 1031 in 51 files | Pass |
| Frontend build | Pass |
| `cargo fmt --check`, clippy with `-D warnings` | Pass |
| Rust tests, 243 | Pass |
| Generated types up to date (`generate-types.mjs --check`, after the commit) | Pass |
| Style guard and its 9 tests, 343 files | Pass |
| Linux release build (static musl, 7.2 MB) | Pass |
| Smoke test of that binary | Pass |
| Playwright, 181 tests against the release binary | Pass, two full runs in a row |

**Expected in CI on the pull request**

| Job | Expected |
| --- | --- |
| Web (typecheck, lint, unit tests, build) | Pass |
| Server (format, clippy, tests, generated types) | Pass |
| Style guard | Pass |
| Release binary, Linux x86_64 static (build and smoke test) | Pass |
| End-to-end tests against the Linux binary | Pass, 181 of 181 |
| GitHub Release | Skipped (runs only on `phase-*` tags) |
| Windows and macOS builds | Not run. They run only when the workflow is started by hand |

What differs between the session and CI, and so is the place to look if something fails:

- **Node 24 in CI, 22.23 here** (deviation 7).
- **Chromium.** CI installs the build Playwright asks for (1254). The session used the machine's pre-installed 1243, through `E2E_CHROMIUM`.
- **Timing.** C5-19 asserts under 200 ms on CI hardware; it took about 8 ms here. The Phase 5 end-to-end tests each start a server, which adds about a second apiece.
- **Search and table timings.** The table searches 250 ms after the last keystroke and the entity picker 200 ms. The tests wait for results rather than for time, but a very slow runner would show up there first.
- **Rust changed** (a migration, new routes, new seed data), so the Windows and macOS builds, when started by hand, build new server code.

Still open for the phase to be accepted: the pass of section 12 in Chrome, with C5-20's look and C5-22 by eye.
