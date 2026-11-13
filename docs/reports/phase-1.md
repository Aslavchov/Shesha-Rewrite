# Phase 1 report

> Running report. Last update: 13 Nov 2026. In progress: the design ADRs are written; code has not started.

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
| `crates/contracts`: document, style and API types | Not started |
| Server: migration, validation, `/api/forms`, demo seed | Not started |
| `web/src/forms/runtime`: settings, rules, styles, store, renderer | Not started |
| Text field with tests | Not started |
| Other nine components | Not started |
| Forms pages | Not started |
| End-to-end tests C1-1 to C1-19 | Not started |

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
