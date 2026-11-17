# Roadmap

Shesha 2.0 v1 is built in eight phases. Each phase has a spec in `docs/specs/` and a report in `docs/reports/`.

| Phase | Name | Status |
| --- | --- | --- |
| 0 | Foundations | Built ([spec](specs/phase-0.md), [report](reports/phase-0.md)) |
| 1 | Form schema and runtime renderer | Built ([spec](specs/phase-1.md), [report](reports/phase-1.md)) |
| 2 | Designer canvas | Built ([spec](specs/phase-2.md), [report](reports/phase-2.md)) |
| 3 | Properties panel and style slots, and five more components: Card, Tabs, Text, Alert and Radio group | Built ([spec](specs/phase-3.md), [report](reports/phase-3.md)) |
| 4 | Theme system | Built ([spec](specs/phase-4.md), [report](reports/phase-4.md)) |
| 5 | Entities, binding and CRUD | Built ([spec](specs/phase-5.md), [report](reports/phase-5.md)) |
| 6 | Scripting, events and form API | Next |
| 7 | Polish and proof app | |

## Where each page of the app shell arrives

The shell built in Phase 0 has a placeholder for every page that is not built yet. Each placeholder names the phase that builds it; `web/src/app/pages.ts` holds those numbers and must match this table.

| Page | Arrives in |
| --- | --- |
| Home | Phase 0 (built) |
| Forms | Phase 1 (built) |
| Designer | Phase 2 (built) |
| Themes | Phase 4 (built) |
| Entities | Phase 5 (built) |
| Settings | After v1 (not in any v1 phase) |
