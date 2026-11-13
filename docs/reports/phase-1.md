# Phase 1 report

> Running report. Last update: 13 Nov 2026. In progress: contracts, server, runtime, Text field and Forms pages are done; the other nine components are being built.

## Status

- [ ] 3 Form document
- [ ] 4 Component contract
- [ ] 5 Values and validation
- [ ] 6 Runtime renderer
- [ ] 7 The ten components
- [ ] 8 Server and API
- [ ] 9 Forms pages
- [ ] 10 Seeded demo form

## Where to continue from

Build order, per the spec: contracts → server → renderer → Text field end to end → the other nine components → Forms pages → end-to-end tests.

| Step | State |
| --- | --- |
| ADRs 0003 to 0007 | Written |
| `crates/contracts`: document, style and API types | Done; generated TypeScript committed |
| Server: migration, validation, `/api/forms`, demo seed | Done; `cargo test` green |
| `web/src/forms/runtime`: settings, rules, styles, store, renderer | Done, with unit tests (including C1-16 resilience and C1-17 render isolation) |
| shadcn/ui Field, Label, Textarea, Select, Checkbox, Switch, Calendar, Popover, Input Group | Added with the CLI and moved onto tokens |
| Text field with tests | Done |
| Forms pages (`/forms`, `/forms/<id>`) | Done, with unit tests |
| Other nine components | In progress: four subagents, one per group of folders. They must not touch `runtime/`, `parts/` or `registry.ts`; the registry lines are added afterwards |
| End-to-end tests C1-1 to C1-19 | `forms-api.spec.ts` (C1-14, C1-15) written; the UI checks follow once the nine components exist |

## What was built

## Design decisions (link ADRs; for each, the later phase it serves)

- [ADR 0003: the form document format](../adr/0003-form-document.md)
- [ADR 0004: the component definition contract](../adr/0004-component-contract.md)
- [ADR 0005: form state and validation](../adr/0005-form-state-and-validation.md)
- [ADR 0006: how style overrides reach a component's slots](../adr/0006-slot-styles.md)
- [ADR 0007: the error shape's `details` field, and the forms API](../adr/0007-error-details-and-forms-api.md)

Each ADR has a "Which later phase this serves" table.

## Deviations from the spec, with reasons

## Deferred

## Blockers

None so far.

## How to run

## CI and end-to-end results
