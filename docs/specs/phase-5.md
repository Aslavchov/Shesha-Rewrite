# Phase 5 — Entities, binding and CRUD

Shesha 2.0 · Phase 5 spec · v1.0 · 15 November 2026

Place this file at `docs/specs/phase-5.md`. Start this phase from `main`, which now includes Phase 4.

## 1. Goal

Turn forms into working CRUD screens. An administrator defines entities and reference lists inside the app, with no code or rebuild. Every entity gets a data API at once. A form bound to an entity loads and saves a row. A data table lists rows with paging, sorting, search and filters, and opens the right form for a row.

**What Shesha users expect, and what to leave behind.** These are the parts of Shesha worth keeping, rebuilt from scratch:

- Every entity gets CRUD endpoints automatically.
- A list query picks the properties it needs, including a referenced row's display value.
- One quick search covers text, reference list labels and the display name of referenced rows.
- Sorting and paging happen on the server.
- Per-property settings such as required and read-only can be changed at runtime.
- An entity names the form used to open one of its rows, so lists always open the right form.
- Reference lists drive selects and coloured status tags.

Leave behind:

- entities that need code, a migration and a rebuild
- two query languages (GraphQL plus JsonLogic)
- duplicate and deprecated endpoints
- configuration spread across many places

## 2. How to work in this phase

Follow the "Working in a session" rules in `CLAUDE.md`: run every check in the session, push once when everything passes, open the pull request and stop. Don't watch CI.

- Read `CLAUDE.md`, `docs/roadmap.md`, the Phase 4 report and ADRs 0003 to 0010 before starting.
- Finish the whole phase before stopping. Build only what this spec lists; anything else goes under "Deferred" in the report.
- Keep `docs/reports/phase-5.md` updated as you work. This is a large phase, so keep it current enough for another session to continue.
- **Write one ADR, `0011-entities-and-data.md`,** covering:
  - the entity and reference list definition format and where it is stored
  - how definitions become tables and how schema changes are applied safely
  - the data API and its query format
  - the value types this adds (extending ADR 0005)
  - how a bound form loads, saves and shows server errors
  - the data table's design
- ADRs 0003 to 0010 are frozen. **Extend them; don't change them.**

## 3. Entities

### 3.1 Defining entities

The Entities page (`/entities`) is no longer an upcoming page. You design it to current best practice. On it, an administrator can:

- **Create an entity** with a display name. Its name, used in data paths and the API, is an identifier generated from the display name. It can be edited before the first save and is fixed after it. The display name can always change.
- **Add and edit properties.** Each property has:
  - a name: an identifier, fixed once saved
  - a display name, help text and a type (3.2)
  - required and read-only flags
  - the limits that fit its type
- **Choose the display property:** the property that represents a row in pickers, references and confirmation messages.
- **Choose the default form:** the form opened for a row of this entity.

Every row also has system properties: an id chosen by the server, created and updated times, and a revision. They are shown read-only and can't be removed.

### 3.2 Property types

| Type | Limits | Value type (ADR 0005) |
| --- | --- | --- |
| Text | maximum length; one line or several | Text |
| Number | whole or decimal; minimum and maximum | Number |
| Yes/no | | Boolean |
| Date | earliest and latest | Date |
| Reference list | which list | Option (the item's value) |
| Reference | which entity | **Reference**: new, the referenced row's id |

### 3.3 Changing an entity safely

- **Nothing loses data silently.** A change that can't keep existing values is refused, with a plain reason. Converting whole numbers to decimal is fine; converting text with values to a number is not.
- **Adding a required property** to an entity that has rows needs a value for the existing rows, or is refused.
- **Deleting a property or an entity** names the forms that use it and asks for confirmation in an in-app dialog. Deleting an entity is refused while other entities reference it.
- **Safe SQL.** Tables and columns use generated names, never text a person typed. Every value goes to SQLite as a parameter.

### 3.4 Reference lists

- Managed on the Entities page.
- Each list has a name and a display name. Each item has:
  - a value: a stable key, fixed once saved
  - a label, which can be renamed freely
  - an order
  - a colour, taken from the theme's colour roles so it follows light and dark mode
- **Items in use** can't be deleted, only retired. A retired item is hidden from new choices but still shows wherever existing data holds it.

## 4. Data API

Follow ADR 0007 for errors. You design the routes and the query format; one query format, not two. They must cover:

- **Definitions:** create, read, update and delete entities and reference lists.
- **Rows:**
  - list, get, create, update (with revision; 409 `revision_conflict` when stale) and delete
  - deleting a row that other rows reference is refused with 409 and a clear message
- **List queries:**
  - paging
  - sorting on one or more properties
  - typed filters per property, combined with AND
  - quick search across text properties, reference list labels and the display property of referenced rows
  - choosing the properties to return, including a referenced row's display value
- **Server validation:** every saved row is checked against its entity (types, required, limits, reference list values that exist and aren't retired for new values, references to rows that exist). Each problem is a `details` entry whose `path` is the property's name.
- **Never a 500 for bad input.** An unknown property, a malformed filter or SQL-like text in a query gets a 400 with details.
- **Fast.** A sorted, filtered and searched page from 10,000 rows returns in under 200 ms in a server test on CI hardware.

## 5. Forms bound to entities

### 5.1 Binding

- A form gets an **entity** setting among its own settings.
- In a bound form, each input's data path names a property of that entity.
- The designer flags as problems (ADR 0009, section 6):
  - a path with no matching property
  - a component whose value type doesn't fit the property's type (a Text field bound to a date)
  - a reference list select that names a different list from its property

### 5.2 Properties in the designer

- With an entity set, the designer shows the entity's properties, with type icons, beside the toolbox.
- Dragging a property onto the canvas, or activating it with the keyboard, adds the matching component. It is bound to the property, labelled with the property's display name, and carries its required flag and limits.
- Properties already on the form are marked as placed.
- Each type gets a component: Text gives a Text field (Text area when several lines), Number gives a Number field, Yes/no gives a Checkbox, Date gives a Date picker, Reference list gives a Reference-list select, and Reference gives an Entity picker.

### 5.3 Loading and saving

- **Opening.** A bound form opens either for a row, whose id is in the URL, loading its values, or empty, to create one.
- **Saving.** Submit creates or updates the row. After creating, the URL carries the new id, so a reload shows the saved row.
- **Server errors** show on the matching fields, and focus moves to the first one.
- **Conflicts.** A 409 conflict says plainly that the row changed elsewhere and offers a reload; nothing is overwritten silently.
- **Read-only properties** render read-only.
- **Feedback.** Saving shows clear progress, success and failure states. The form page offers a clear way back to where the person came from.

## 6. Four components

Same contract, one folder each, one registry line each, with unit tests. You choose the settings and slots beyond these minimums.

| Component | Kind | Minimum settings |
| --- | --- | --- |
| Data table | Data | entity; columns (properties, order, header text); page size; quick search on or off; filters on or off; which form opens a row (the entity's default unless set); allow New; allow Delete |
| Reference-list select | Input, Option | label, help text, reference list, placeholder, required |
| Entity picker | Input, Reference | label, help text, entity, placeholder, required |
| Status tag | Display | bound to a reference list value; shows the item's label in its colour |

- **Data table:**
  - paging, sorting, search and filters all run on the server
  - clear empty, loading and error states
  - sortable headers announce their sort order (`aria-sort`)
  - rows can be reached and opened from the keyboard
  - Delete asks in an in-app dialog that names the row by its display property
  - at narrow widths the table scrolls inside itself; the page never scrolls sideways
  - reference list columns show status tags; reference columns show the display value
- **Entity picker:** an accessible combobox that searches the target entity by its display property on the server, and shows the display value for a stored id.
- **Reference-list select:** offers the list's items in order. A retired item appears only when it is the current value.

## 7. Demo data

`--demo` seeds, with fixed ids so links survive a reset:

- **Reference list** "Person status": Active (success), Pending (warning) and Inactive (muted).
- **Entity** Organisation: name (required, display property), with 8 rows.
- **Entity** Person, with 50 deterministic rows:
  - first name and surname (required, at most 50 characters; surname is the display property)
  - email (at most 254 characters)
  - date of birth
  - dependants (whole number, 0 to 20)
  - status (Person status)
  - organisation (reference to Organisation)
  - notes (several lines)
- **Forms:**
  - "People": a data table of Person, 10 per page, with New and Delete.
  - "Person": bound to Person, and Person's default form.
  - The existing "Person details" form stays as it is.

## 8. Small fixes from Phase 4

- Focus stays somewhere sensible after Publish and Discard, which disable themselves.
- The theme editor's component grid is one Tab stop with arrow keys, like the toolbox, and component names aren't cut off at 16 px text.
- The theme status bar keeps its text readable when a save error shows; nothing squashes to one word per line.
- The theme editor's Publish, Undo and status stay reachable while you edit component defaults further down.
- Announcements name the component they're about ("Background of Card's whole component: …").
- When pointing at a slot, its name tag doesn't cover the control, and the slot outline doesn't run through the name badge.

## 9. Out of scope

- Permissions and sign-in; audit history; background jobs.
- Child lists inside a form (a table of one row's children) and many-to-many relations.
- File attachments and computed properties.
- Importing or exporting data or definitions; bulk editing.
- Entities defined in code; external databases.
- Scripting, events and actions (Phase 6).

## 10. Test IDs

- **Entities page:** `entities-page`, `entities-new`, `entity-<name>`, `entity-name`, `entity-display-name`, `entity-display-property`, `entity-default-form`, `entity-delete`, `property-new`, `property-<name>`, `property-name`, `property-display-name`, `property-type`, `property-required`, `property-read-only`, `property-delete`.
- **Reference lists:** `reflists-tab`, `reflist-new`, `reflist-<name>`, `reflist-item-new`, `reflist-item-<value>`, `reflist-item-<value>-retire`.
- **Designer:** `designer-data-panel`, `data-property-<name>`.
- **Data table:** `table-<instance name>`, `table-search`, `table-filters`, `table-filter-<property>`, `table-sort-<property>`, `table-row-<row id>`, `table-page-next`, `table-page-prev`, `table-page-status`, `table-new`, `table-delete-<row id>`.
- **Dialogs and bound forms:** `confirm-dialog`, `confirm-ok`, `confirm-cancel`, `form-save-status`, `form-conflict`, `form-conflict-reload`, `form-back`.

## 11. Frozen after this phase

Changing any of these later needs a new ADR:

- the entity and reference list definition format
- the Reference value type
- the data API and its query format
- binding rules: a bound input's data path is a property name
- reference list item values as stable keys

## 12. Acceptance checks

Chrome checks run against the Linux binary started with `--demo`, in light mode at 1280 px wide unless stated. Checks marked CI also run as automated tests; "CI only" checks run only there.

| # | Check | Steps | Expected | CI |
| --- | --- | --- | --- | --- |
| C5-1 | Seeded definitions | Open Entities | Person, Organisation and the Person status list show with their properties, types and settings | Yes |
| C5-2 | New entity | Create Vehicle: registration (text, required, max 10), year (whole number, 1900 to 2100), fuel (a new list: Petrol, Diesel, Electric). Create a row through the API, then an invalid one | The valid row is stored; the invalid one gets 400 with a detail per bad property | Yes |
| C5-3 | Safe changes | On Person: add a property; try to change email to a number; start deleting notes | The property is added; the type change is refused with a reason; delete names the forms using notes and asks first | Yes |
| C5-4 | List | Open People; page through; sort by surname both ways; search "smi", then an organisation's name, then "Pending" | 50 rows, 10 per page; the order follows; each search narrows correctly | Yes |
| C5-5 | Filters | Filter status = Pending and a date of birth range, then add a search | Only matching rows; the page status shows the count | Yes |
| C5-6 | Open and save | Click a row; change the surname; save; reload; go back | Values load, including status and organisation; the change persists and shows in the list | Yes |
| C5-7 | Server validation | Make Person's email required on the Entities page; in the Person form, clear email and save | The server's error shows on the email field and focus moves there | Yes |
| C5-8 | Conflict | Open one person in two tabs; save in both | The second shows the conflict and offers a reload; nothing is overwritten silently | Yes |
| C5-9 | Create | New from People; fill in; save; reload | The row is created, the URL carries its id, and it appears in the list | Yes |
| C5-10 | Delete | Delete a person from the table, first cancelling; then delete an organisation people reference | The dialog names the person; cancel keeps them, OK removes them; the organisation's delete is refused with a clear message | Yes |
| C5-11 | Build a bound form | New form; set its entity to Person; add date of birth, status, organisation and first name from the properties | A Date picker labelled "Date of birth", a Reference-list select with the three statuses, an Entity picker and a required Text field limited to 50 characters, each bound to its property | Yes |
| C5-12 | Binding problems | Change a field's data path to `nickname`; bind a Text field to `dateOfBirth` | Both are marked as problems with plain explanations | Yes |
| C5-13 | Reference lists | Reorder and rename Person status items; retire Pending | Selects follow the new order and labels; Pending disappears from choices but still shows on rows that have it | Yes |
| C5-14 | Entity picker | Type part of an organisation's name; choose with the keyboard; save; reload | The search finds it; the display name shows after reload | Yes |
| C5-15 | Status tag | Look at status in the table and the form, in light and dark | Label in the item's colour, following the mode | Yes |
| C5-16 | Keyboard | Without the mouse: sort, page, open a row, save, go back, delete with confirm | Every step works; focus ring always visible; changes are announced | Yes |
| C5-17 | Narrow | People at 390 px wide | The table scrolls inside itself; the page doesn't scroll sideways | Yes |
| C5-18 | Bad queries | Through the API, sort by an unknown property and send a malformed filter and SQL-like search text | 400 with details each time; never a 500 | Yes |
| C5-19 | Performance | Server test: 10,000 rows, a sorted, filtered and searched page | Under 200 ms | CI only |
| C5-20 | Small fixes | Check each item in section 8 | All six done | Partly (by eye) |
| C5-21 | Earlier phases | Run the Phase 0 to 4 suites | All pass | CI only |
| C5-22 | Visual quality | Review the Entities page, People and Person in light and dark | Clear, calm, easy to scan; nothing clipped | No (by eye) |

Every check also requires zero console errors and warnings.

## 13. Definition of done

- Every requirement in sections 3 to 8 is met.
- ADR 0011 is written.
- Every check passes in the session, and the branch is pushed once.
- `docs/reports/phase-5.md` is complete, with deviations, decisions and the expected CI result.
- `docs/roadmap.md` marks Phase 5 as built.
- A pull request is open with a summary that links the report.

The phase is accepted when the Chrome checks in section 12 pass.

---

## Appendix — report template (`docs/reports/phase-5.md`)

```markdown
# Phase 5 report

## Status
- [ ] 3.1 Defining entities
- [ ] 3.2 Property types
- [ ] 3.3 Safe changes
- [ ] 3.4 Reference lists
- [ ] 4 Data API
- [ ] 5.1 Binding
- [ ] 5.2 Properties in the designer
- [ ] 5.3 Loading and saving
- [ ] 6 Four components
- [ ] 7 Demo data
- [ ] 8 Small fixes

## What was built
## Design decisions (link ADR 0011)
## Deviations from the spec, with reasons
## Deferred
## Blockers
## How to run
## Checks run in the session, and the CI result expected
```
