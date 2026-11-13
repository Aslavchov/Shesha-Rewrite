# Roadmap

Shesha 2.0 v1 is built in eight phases. Each phase has a spec in `docs/specs/` and a report in `docs/reports/`.

| Phase | Name | Status |
| --- | --- | --- |
| 0 | Foundations | Built ([spec](specs/phase-0.md), [report](reports/phase-0.md)) |
| 1 | Form schema and runtime renderer | Next |
| 2 | Designer canvas | |
| 3 | Properties panel and style slots | |
| 4 | Theme system | |
| 5 | Entities, binding and CRUD | |
| 6 | Scripting, events and form API | |
| 7 | Polish and proof app | |

## Where each page of the app shell arrives

The shell built in Phase 0 has a placeholder for every page. Each placeholder names the phase that builds it; `web/src/app/pages.ts` holds those numbers and must match this table.

| Page | Arrives in |
| --- | --- |
| Home | Phase 0 (built) |
| Forms | Phase 1 |
| Designer | Phase 2 |
| Themes | Phase 4 |
| Entities | Phase 5 |
| Settings | After v1 (not in any v1 phase) |
