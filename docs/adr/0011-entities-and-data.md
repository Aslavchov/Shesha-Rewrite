# ADR 0011: Entities and data

- Status: accepted
- Date: 16 November 2026
- Phase: 5

## Context

Phase 5 turns forms into CRUD screens. An administrator defines entities and reference lists inside the app, with no code, migration or rebuild. Every entity has a data API at once. A form bound to an entity loads and saves one of its rows, and a data table lists rows with paging, sorting, search and filters.

The current Shesha does this with entities defined in C#, a migration and a rebuild, two query languages (GraphQL for selection and JsonLogic for filters), duplicate endpoints, and configuration spread over several places. The concepts are kept: CRUD per entity, list queries that pick their properties (including a referenced row's display value), one quick search, server-side sorting and paging, per-property flags, a default form per entity, and reference lists that drive selects and coloured tags. The implementation is not.

The spec asks this record to settle six things: the definition format and where it is stored; how a definition becomes a table and how it changes safely; the data API and its query format; the value types this adds; how a bound form loads, saves and shows server errors; and the data table's design. ADRs 0003 to 0010 are frozen. This record extends them and changes none.

## Decision

### 1. Definitions

Both formats are in `crates/contracts/src/entities.rs` and generated into TypeScript.

```json
{
  "name": "person",
  "displayName": "Person",
  "properties": [
    { "name": "surname", "displayName": "Surname", "type": "text", "required": true, "maxLength": 50 },
    { "name": "dependants", "displayName": "Dependants", "type": "number", "whole": true, "min": 0, "max": 20 },
    { "name": "status", "displayName": "Status", "type": "referenceList", "referenceList": "personStatus" },
    { "name": "organisation", "displayName": "Organisation", "type": "reference", "entity": "organisation" }
  ],
  "displayProperty": "surname",
  "defaultForm": "person"
}
```

| Member | Meaning |
| --- | --- |
| `name` | The entity's name in the API and in data paths. ASCII letters, digits and `_`, starting with a letter, at most 64 characters, unique without regard to case. Fixed once saved. The Entities page makes it from the display name (`Date of birth` gives `dateOfBirth`) until it is typed. |
| `displayName` | What people call it. 1 to 200 characters. It can always change. |
| `properties` | In the order they are shown, at most 200. |
| `displayProperty` | Optional. A **text** property that stands for a row in pickers, references, table links and confirmation messages. Without one, a row is shown by its id. |
| `defaultForm` | Optional. The id of the form a row opens in. |

**A property** has a `name` (the same rule; not `id`, `createdAt`, `updatedAt` or `revision`, which every row has), a `displayName`, optional `helpText`, a `type`, and optional `required` and `readOnly`. The limits are flat members, and each belongs to one type. A limit given to another type is refused, not ignored, because it is a mistake:

| Type | Limits | Value |
| --- | --- | --- |
| `text` | `maxLength` (1 to 100,000), `multiline` | string |
| `number` | `whole`, `min`, `max` (within ±2^53, whole when `whole`, min ≤ max) | JSON number |
| `boolean` | (cannot be `required`: it always has a value) | `true` or `false` |
| `date` | `earliest`, `latest` (`YYYY-MM-DD`, earliest ≤ latest) | `"YYYY-MM-DD"` |
| `referenceList` | `referenceList`, the list's name (required) | the item's value |
| `reference` | `entity`, the target's name (required; may be itself) | the row's id |

Flat members were chosen over a nested `limits` object because a form, a validator and a diff all read them the same way, and the one-type-each rule makes the meaning unambiguous.

**A reference list** has a `name`, a `displayName` and `items`, in order, at most 200. An item has a `value` (letters, digits, `_` and `-`, starting with a letter; a stable key, fixed once saved), a `label` that can be renamed freely, a `color`, and `retired`. The order is the order of the list, so there is no separate order number to keep consistent.

The `color` is one of `muted`, `primary`, `success`, `warning`, `info` and `destructive`: roles of the theme (ADR 0010), so a tag follows light and dark mode and any published theme. Hex colours were rejected: they cannot follow the mode, and a theme could not restyle them.

**Stored as JSON in the database**, one row per definition, with a revision and a time, as forms are (ADR 0007). The server checks a definition completely (`entities/validate.rs`) and reports every problem with its path (`properties[2].maxLength`), as `invalid_entity` or `invalid_reference_list`.

### 2. From definition to table, and safe changes

**Generated names only.** Each entity's rows live in a table `entity_<id>`, where `id` is the entity row's `AUTOINCREMENT` key. Each property's column is `c<n>`, where `n` comes from a counter on the entity that never goes back. The map from property name to column number is stored beside the definition. No table or column name ever contains text a person typed, so a name is never quoted, escaped or checked against SQL keywords. Every value goes to SQLite as a bound parameter. The only SQL text built at run time is made of these generated names and fixed keywords, and goes through sqlx's `AssertSqlSafe` in the few places that build it.

Column numbers are never reused. A property deleted and then added again under the same name gets a new, empty column, so a value cannot come back from a property that was deleted.

**Every write is one transaction**, begun with `BEGIN IMMEDIATE`. It reads the definitions, checks the change against them and the rows, changes the schema and writes the definition. SQLite's schema changes are transactional, so a refusal or a failure half way leaves the table and the definition as they were. The revision is checked inside the same transaction: a stale one gets 409 `revision_conflict`.

**Nothing loses data silently.** A changed definition is compared with the rows that exist (`entities/schema.rs`):

| Change | Rule |
| --- | --- |
| A new property | A new column. If it is required and rows exist, the request must give a `fill` value for them, or it is refused. |
| Another type | A new column for the new type, and the old one dropped, **only when no row holds a value** (for yes/no, when no row holds "yes"). Otherwise refused, with how many rows hold one. Changing whole to decimal is not a type change, so it always keeps the values. |
| Tighter limits | Each new limit is checked against the values: a shorter maximum length, single line where values have line breaks, whole numbers where values have fractions, a higher minimum or lower maximum, a later earliest or earlier latest date. Refused when a row breaks it, with the count. |
| Newly required | Rows with no value need a `fill`, or the change is refused. Only those rows get it. |
| Another reference list | Refused when rows hold values the new list lacks. |
| Another target entity | Refused when rows hold references. |
| A deleted property | Its column and values are dropped. The client asks first and names the forms that use it. |
| A deleted entity | Refused with 409 `entity_in_use` while another entity refers to it. Otherwise its table goes. |
| A deleted reference list item | Refused with 409 `item_in_use` while rows hold it; retiring it is the way. |
| A deleted reference list | Refused with 409 `reference_list_in_use` while a property uses it. |

A refused change is 409 `change_refused`, with a sentence per problem at the property's path ("Email has a value in 50 rows, and a text property cannot become a number property without losing them…"). An invalid `fill` value is 400 at `fill.<name>`.

**Converting values** (text "12" to the number 12) was rejected for v1. It is guesswork that silently changes data when a value does not convert, and the spec's own example refuses it.

### 3. The data API

All routes are under `/api`. Errors use ADR 0007's shape, with `details` wherever a problem has a place.

| Route | Does |
| --- | --- |
| `GET /entities`, `POST /entities` | List (with each entity's row count) and create: `{ definition }`. 201 `EntityRecord`. |
| `GET`, `PUT`, `DELETE /entities/{name}` | Read; change: `{ revision, definition, fill? }`; delete. |
| `GET /reference-lists`, `POST /reference-lists` | The same for lists. |
| `GET`, `PUT`, `DELETE /reference-lists/{name}` | |
| `POST /data/{entity}/query` | One page of rows: the query below. 200 `DataPage { rows, page, pageSize, total }`. |
| `POST /data/{entity}` | Create a row: `{ values }`. 201 `DataRow`. |
| `GET /data/{entity}/{id}` | One row, every property. |
| `PATCH /data/{entity}/{id}` | Change the properties sent: `{ revision, values }`. Those left out keep their values. 409 `revision_conflict` when stale. |
| `DELETE /data/{entity}/{id}` | 204. Refused with 409 `row_in_use` while other rows refer to it, naming who: "Acacia Logistics cannot be deleted: 7 rows of Person refer to it as Organisation." |

A `DataRow` is `{ id, revision, createdAt, updatedAt, display, values, references }`. `display` is what stands for the row (the display property, or the id). `references` holds the display value of each referenced row among `values`, so a list or a form never has to ask a second time. Ids are 32 hex characters from 16 random bytes; seeded rows have fixed, readable ids.

Rows are routed by entity in the path, not by generated routes: an entity has its API the moment its definition is committed, because the server reads the definitions in each request's transaction. Nothing is registered or cached per entity.

**One query format**, posted as JSON. A query of any size fits in a body, and nothing has to be encoded into a URL.

```json
{
  "select": ["surname", "status", "organisation"],
  "filter": [
    { "property": "status", "op": "in", "value": ["active", "pending"] },
    { "property": "dateOfBirth", "op": "gte", "value": "1960-01-01" }
  ],
  "search": "smi",
  "sort": [{ "property": "surname", "direction": "desc" }],
  "page": 1,
  "pageSize": 10
}
```

| Member | Meaning |
| --- | --- |
| `select` | The properties to return. All when left out. A selected reference comes with its display value in `references`. |
| `filter` | Typed conditions, all of which must hold (AND). At most 50. |
| `search` | Quick search: rows where a text property, the label of a reference list value, or the display value of a referenced row contains the text, ignoring case. At most 200 characters. |
| `sort` | Up to 8 keys: a property, or `id`, `createdAt`, `updatedAt`. Text sorts without regard to case; a reference list sorts by the list's own order; a reference sorts by the target's display value. The id always breaks ties, so paging never repeats or skips a row. Without a sort, rows come in the order they were created. |
| `page`, `pageSize` | From 1; 1 to 200 rows, 25 by default. |

Which operators apply depends on the type, so a filter cannot mean nothing:

| Type | Operators |
| --- | --- |
| Text | `eq` (ignoring case), `contains`, `startsWith`, `empty`, `notEmpty` |
| Number, date | `eq`, `gt`, `gte`, `lt`, `lte`, `empty`, `notEmpty` |
| Yes/no | `eq` |
| Reference list, reference | `eq`, `in`, `empty`, `notEmpty` |

The value must be of the property's own type, and a reference list value must be one of the list's items. `LIKE` patterns treat `%`, `_` and `\` literally.

**Never a 500 for bad input.** The whole query is checked before any SQL is written. A property is looked up in the definition and replaced by its generated column, so a name that is not a property never reaches the database. Every problem is listed at once, as 400 `invalid_query`, at its place (`sort[0].property`, `filter[1].value`, `search`, `pageSize`). An unknown member is refused too, so a typo is never silently ignored.

**SQL-like search text is refused** (spec section 4). Search text that contains a statement or comment marker (`;`, `--`, `/*`, `*/`) or a control character is a 400 at `search`. None of these appear in a name or a label; they only appear in attempts to break a query. Search text is a bound parameter in any case, so this is a clear answer to a bad request, not the defence against injection. An apostrophe is allowed, because people are called O'Brien. Values in filters and rows are never refused for looking like SQL: they are stored and compared as the text they are.

**One query language was chosen over GraphQL plus JsonLogic.** A GraphQL layer would bring a schema regenerated per entity, a second request model and its own error shape. JsonLogic is a general expression language that has to be translated into SQL and limited after the fact. A small, closed, typed format is checked completely in one place, documented in one table, and covers what the list, the picker and the API need. Arbitrary OR groups and nested selections were left out (see Consequences).

**Fast.** The bundled SQLite is compiled with optimisations in debug builds too, so tests measure what a release build does. A reference column has an index, used when a referenced row is deleted. A server test loads 10,000 rows and times a page that is sorted by a reference's display value and text, filtered on three properties and searched. It must take under 200 ms, best of three runs. It takes about 8 ms in the session.

**Server validation of rows.** Every row is checked against its entity (`data/values.rs`): the value's JSON type, required (blank or whitespace-only text counts as missing), maximum length in characters, single-line text, number limits and whole numbers, real calendar dates within their limits, reference list values that exist, and references to rows that exist. A retired item stays where a row holds it, but cannot be chosen anew. Each problem is a `details` entry whose `path` is the property's name, in the same words as the form's own rules ("This field is required"), so the client can show it on the field. An unknown property is a problem too.

### 4. Value types

ADR 0005's value types gain one: **Reference**, the id of a row of another entity, stored as a string, `null` for none. `ValueTypes` and `isValueOfType` in `forms/runtime/values.ts` have it. Option keeps its meaning: a reference list value is the item's value, its stable key.

| Property type | Value type |
| --- | --- |
| Text | Text |
| Number | Number |
| Yes/no | Boolean |
| Date | Date |
| Reference list | Option |
| Reference | Reference |

### 5. Forms bound to entities

**Binding.** The form's own settings gain `entity`, an entity's name (ADR 0003's `settings`, so the document format is unchanged). In a bound form, an input's data path is a property name. The designer flags three problems in plain words, through ADR 0009's problems list and outline (`designer/model/binding.ts`): a path with no matching property; a component whose value type is not the property's ("Text field holds text, but Date of birth is a date. Use a Date picker for it."); and a reference list select or entity picker that names another list or entity than its property, with a fix that sets the right one. These are warnings, not refusals: the server knows nothing of component types (ADR 0003), so a form is still stored, and a definition may change after the form was designed.

**Properties in the designer.** With an entity set, a panel beside the toolbox lists its properties with type icons. Like the toolbox it is one Tab stop with the arrow keys. Dragging a property, or activating it, runs ADR 0008's `add` command with the property. The new instance is named after the property when that name is free (otherwise ADR 0008's rule), bound to it, and starts with the settings its component takes from it. A component says which properties it edits through a new, optional part of its definition, `forProperty(property)`, which returns those settings or null. So the designer does not name component types, and the mapping lives in each component's folder:

| Property | Component | Settings it carries |
| --- | --- | --- |
| Text | Text field | label, help text, required, maximum length |
| Text, several lines | Text area | the same |
| Number | Number field | whole, minimum, maximum |
| Yes/no | Checkbox | label, help text |
| Date | Date picker | earliest and latest as minDate and maxDate |
| Reference list | Reference-list select | the list |
| Reference | Entity picker | the entity |

Properties already on the form are marked as placed, and activating one selects its component. Adding a property already on the form is refused by the command.

**Loading and saving.** `/forms/<form>/<row id>` opens a bound form for a row; `/forms/<form>` opens it empty, to create one. The renderer takes two new optional props: `values`, the row's values by data path, which the store starts from and resets to; and `readOnlyPaths`, the read-only properties, whose inputs render read-only whatever the mode. Submit validates as ever (ADR 0005), and the page then sends only the entity's own properties. An update is a `PATCH` with the revision the row was loaded at; a create replaces the address with the new row's id, so a reload shows the saved row.

**Server errors.** A new optional renderer prop, `onSave(values, form)`, hands the host `form.showProblems(details)`. The form store puts each problem on the field bound to its path, shows it there like any error, and keeps it until the value changes. Leaving the field does not clear an unfixed problem. Focus moves to the first such field. Problems no field on screen takes are listed by the page.

**Conflicts.** A 409 `revision_conflict` shows a banner that says plainly the row was changed elsewhere, and that nothing was overwritten, and offers Reload. Reload reads the row again and starts the form from it; what was typed is lost, as the banner said.

**Feedback.** A status beside the form says Saving…, Saved, Created and saved, or why it was not saved. Failures interrupt (`role="alert"`); progress and success wait their turn (`role="status"`). The page's back link goes to where the person came from: a table opening a row records its page and title in the navigation state, and Forms is the fallback.

### 6. The four components

Each is one folder and one registry line, with unit tests (ADR 0004).

**Data table** (`data-table`, category Data, a static component). Settings: entity; columns (properties, order, header text; none means every property); form for a row (else the entity's default); rows per page; quick search, filters, New and Delete on or off. All work happens on the server, through the one query format.

- **Rows open forms.** The first column is a real link, `/forms/<form>/<id>`, so a row can be reached with Tab, opened with Enter, or opened in a new tab. A press anywhere on the row opens it too. New opens the form empty. The app provides how to open a form (`RowNavigationContext`); on the designer's canvas or in a test, nothing opens.
- **Headers are buttons** that cycle ascending, descending and the table's own order, with `aria-sort` on the header cell.
- **Filters** are one typed control per column: contains for text, a range for numbers and dates, a choice for yes/no and reference lists, an entity picker for references.
- **Search** waits 250 ms after the last keystroke.
- **The page status** ("11–20 of 50"), and what was just done, are announced through a live region once the rows have arrived.
- **States.** Empty states say whether nothing exists yet or nothing matches, with a way to clear the search and filters. A failed load says so and offers Retry. Loading shows skeleton rows, and the previous page stays on screen while the next one loads.
- **Delete** asks in an in-app dialog that names the row by its display value, with focus on Cancel. A refusal (a referenced row) is shown in the dialog in the server's words.
- **Narrow widths.** The table scrolls inside its own region, which is focusable and positioned so that text hidden for the eye cannot widen the page.
- **Reference list columns** show status tags; reference columns show the display value.
- **The view is kept** (page, sort, search, filters), per instance, for as long as the page is open, so going back from a row finds the list as it was left.

**Reference-list select** (`reference-list-select`, value type Option): label, help text, reference list, placeholder, required. It offers the list's items in order, each shown as its tag. A retired item is offered only when it is the current value, and is marked "(retired)".

**Entity picker** (`entity-picker`, value type Reference): label, help text, entity, placeholder, required. It is an ARIA combobox (Base UI's, styled in `components/ui/combobox.tsx` from the same tokens as Input). It searches the target entity on the server by its display property as you type, 20 choices at a time, and says how many more there are. For a stored id it shows the row's display value.

**Status tag** (`status-tag`, category Content): bound to a reference list value like an input, because that is how a component gets a value, but it never changes it, and it takes no focus. It shows the item's label in its colour, retired items marked.

Two more parts are shared: `components/status-tag.tsx`, the tag itself, used by all four components and the Entities page; and `components/confirm-dialog.tsx`, the in-app confirmation (Base UI's alert dialog), used for every delete.

### 7. The Entities page

Entities and reference lists are on two tabs, with a list on one side and the definition being edited on the other. Unlike the designer and the theme editor, nothing saves by itself. A change to a definition can be refused, and changes the shape of live data, so it is made when Save is pressed, and its refusal is shown where it was made. Each property is added and edited in a dialog of its own, with the limits of its type. A required property on an entity with rows asks for the value existing rows get. System properties are listed, locked. Deleting a property or an entity first reads the forms and names those that use it (bound inputs, tables listing it, settings naming the entity).

## Alternatives considered

- **Entities in code, or a document database.** Ruled out by the spec, and a typed table per entity is what makes sorting, filtering and the performance target straightforward.
- **One table of rows with a JSON column** (an entity-attribute-value store). No schema changes at all, but every filter and sort goes through JSON functions. Typed columns, indexes and SQLite's own type checking are lost, and the safety rules of section 2 would have to be enforced by hand, row by row. A table per entity with generated names gives the database the work it is good at.
- **Columns named after properties.** Readable in a database browser, but every name would have to be quoted and checked against SQL keywords, a rename would need a migration, and a deleted name could be revived with old values. Generated names avoid all three.
- **GET with query-string parameters for lists.** Cache-friendly, but filters with lists of values and several sort keys become an encoding of their own, and URL length limits come into play. A POSTed query is one JSON document, typed in `contracts`.
- **Validating rows only on the client.** The form's rules stay, for immediate feedback, but only the server knows the current definition (another tab may have just made email required) and whether a referenced row exists. C5-7 is exactly that case.
- **Save on every change in bound forms** (as the designer does). A row is data people own, and a half-typed value would be stored, then possibly refused. An explicit Save, with the revision, is clearer, and matches what people expect of a record.
- **Retired items as a separate list.** A flag on the item keeps its place in the order, so un-retiring puts it back where it was.

## Which later phase this serves

| Decision | Serves |
| --- | --- |
| One typed query format | Phase 6: `form.data.query(...)` in scripts is the same object |
| `forProperty` on definitions | Phase 6 and later: components added by teams describe their own binding |
| `showProblems` and `onSave` | Phase 6: server-side rules and custom actions report on fields the same way |
| Rows with `display` and `references` | Phase 7: lists and pickers in the proof app need no second request |
| Generated names, transactional schema changes | Later: import and export of definitions replays the same operations |

## Consequences

- Frozen after this phase, changeable only through a new ADR: the entity and reference list definition format; the Reference value type; the data API and its query format; binding rules (a bound input's data path is a property name); reference list item values as stable keys.
- Changing a property's type keeps no values. Converting them is a later feature, and needs its own rules for what does not convert.
- Filters are combined with AND only, on one entity, with no OR groups and no filters on a referenced row's properties. The format leaves room for both, as new members.
- Deleting a property or an entity does not change the forms that use them: the forms show a problem in the designer until they are changed. The delete names them first.
- `--demo` seeds definitions and rows with fixed ids, so links to `/forms/person/person-01` survive a reset.
