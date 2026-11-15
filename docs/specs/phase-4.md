# Phase 4 — Theme system

Shesha 2.0 · Phase 4 spec · v1.0 · 15 November 2026

Place this file at `docs/specs/phase-4.md`. Start this phase from `main`, which now includes Phase 3 and its fixes (pull request #5).

## 1. Goal

Let an administrator restyle the whole app from inside the app, with no rebuild: brand and status colours, roundness, text size and density, and a default look for each component. Components follow the theme unless an author overrides them on an instance, and the designer always shows where a value comes from.

**What Shesha users expect, and what to leave behind.** In Shesha, the app's theme is changed from the app itself and every component follows it, and the team has been working towards a standard default style for each component. Keep those ideas. Leave behind free-form CSS or style code on components and per-component styling logic: here every style is data, from the tokens (ADR 0002) and the slot style model (ADR 0006).

## 2. How to work in this phase

Follow the "Working in a session" rules in `CLAUDE.md`: run every check in the session, push once when everything passes, open the pull request and stop. Don't watch CI.

- Read `CLAUDE.md`, `docs/roadmap.md`, the Phase 3 report and ADRs 0002, 0003, 0006 and 0009 before starting.
- Finish the whole phase before stopping. Build only what this spec lists; anything else goes under "Deferred" in the report.
- Keep `docs/reports/phase-4.md` updated as you work.
- **Write one ADR, `0010-themes.md`,** covering: the theme document, how theme values reach components (including a preview scoped to part of the page, the open question in ADR 0002), how dark values are derived, the draft and publish model, and the API.
- ADRs 0003, 0004, 0006, 0008 and 0009 are frozen. **Extend them; don't change them.** The Appearance editor is reused through its existing props (ADR 0009, section 4).

## 3. The theme

### 3.1 One theme, stored on the server

- The app has one theme, stored in the database. Multiple named themes are out of scope.
- The theme document stores only what differs from the built-in look (sparse, like ADR 0003, D5). An empty theme is today's look: Shesha blue `#003BB2` and Inter.
- The server checks the theme's structure (format version, colour values, known token names and allowed values, size limits), as it does for forms. It never needs to know component types: an unknown component type in the theme is kept and flagged in the editor, like an unknown type in a form.
- Contracts live in `crates/contracts` and are generated to TypeScript, as for forms.

### 3.2 What the theme controls

**Global tokens.** You choose the exact controls and ranges; keep them constrained so a theme can't break the layout.

- **Colours:** primary, destructive, success, warning and information, the page background and the sidebar. Each has a light and a dark value.
- **Dark values are derived.** Until someone sets a dark value, it is derived from the light value, keeping the hue, as ADR 0002 did for the brand blue. A dark value set by hand is kept.
- **Contrast is kept.** Text and icon colours that sit on a themed colour are chosen automatically to reach at least 4.5:1. When a choice can't reach it (a very light primary in light mode), the editor says so plainly.
- **Roundness:** the base radius. The whole radius scale follows it.
- **Text size:** the base UI text size. The typeface stays Inter; choosing another typeface is out of scope.
- **Density:** control height and spacing, as a small set of named steps.

**Component defaults.** For each registered component, the theme can set slot styles with exactly the properties of ADR 0006. They are edited with the Appearance editor, whose defaults are the component's own look.

### 3.3 How values reach components

- **The merge order is ADR 0006's: component definition ← theme ← instance.** An instance override always wins. Changing the theme changes every component that has no override, in every form, on the canvas and in running forms.
- **Overrides stay relative.** An instance's radius or padding override names a step, so it keeps that step when the global scale changes. A Full radius stays Full.
- **The whole app follows the theme**, including the shell: sidebar, header and pages.
- **No flash.** A reload never shows the built-in look before the theme. Apply the published theme before first paint, as the dark-mode choice already is.

### 3.4 The designer shows where a value comes from

- In the instance Appearance editor, an unset property shows the value it inherits and where it comes from: "From the theme" or the component's default. This uses the `defaults` prop as ADR 0009 planned.
- Setting an override marks it as set on the instance. Resetting it brings back the theme's value.
- Where a setting's or style's value comes from is readable by screen readers, not only shown by colour or an icon.

## 4. The theme editor

The Themes page (`/themes`) is no longer an upcoming page. You design it to current best practice. It must meet these requirements:

- **Live preview.** Every change shows at once in a preview: the shell and a sample of real components rendered by the real renderer, in light and dark. Pointing at a slot in the Appearance editor highlights it in the preview, as in the designer.
- **Scoped preview.** The draft shows only in the preview. The rest of the page, including the editor's own controls, keeps the published theme.
- **Component defaults.** Pick any registered component and edit its slot styles with the Appearance editor. For any component, the editor lists the same slots and style properties as the instance panel.
- **Colour picking.** The colour picker from Phase 3 is reused. Colours pick from the theme's own roles or a custom hex, as there.

### 4.1 Draft and publish

A theme change affects everyone, so edits are a draft until published.

- **The draft is saved on the server** shortly after each change, with a revision. A 409 conflict stops saving and offers a reload, as in the designer. Nothing is lost on a reload or a closed tab.
- **Undo and redo** cover every change to the draft, with runs of edits merged as in ADR 0009.
- **Publish** applies the draft to the whole app. **Discard** returns the draft to the published theme. **Reset to default** makes a draft of the built-in look, which still needs publishing.
- The editor always shows whether there are unpublished changes.

## 5. API

Follow ADR 0007 for errors. You design the routes; they must cover reading the published theme and the draft, saving the draft with its revision (409 `revision_conflict` when stale), publishing, discarding, and 400 `invalid_theme` with details. `--demo` resets the theme to empty.

## 6. Small fixes from Phase 3

- **Colour swatches** move with the arrow keys as one Tab stop. The colour picker is used far more in this phase.
- **Card regions.** A Card's region outline in design mode stays inside the card's border.
- **Overlapping tags.** The slot name tag never covers the instance's name badge.
- **Properties room.** At 1280 × 900 the properties area gets less than half of the right column. Give it more room in a way you judge best.

## 7. Out of scope

Multiple named themes, or a theme per form; choosing another typeface; state-specific overrides (hover) and per-side padding; exporting or importing a theme as a file; theme defaults for component settings (only styles are themed); entities and data components (Phase 5); scripting (Phase 6).

## 8. Test IDs

`theme-editor`, `theme-preview`, `theme-status`, `theme-publish`, `theme-discard`, `theme-reset-default`, `theme-undo`, `theme-redo`, `theme-conflict`, `theme-conflict-reload`, `theme-color-<role>` and `theme-color-<role>-dark` (for example `theme-color-primary-dark`), `theme-contrast-warning`, `theme-radius`, `theme-text-size`, `theme-density`, `theme-component-<type>` (for example `theme-component-text-field`), and `props-style-source-<slot>-<property>` for the inherited-value source in the instance panel. Inside the theme editor's Appearance editor, use the test ID prefix `theme` (ADR 0009, `testIdPrefix`).

## 9. Frozen after this phase

Changing any of these later needs a new ADR:

- the theme document format
- the merge order and how inherited values and their source are shown
- the draft and publish model and the theme API

## 10. Acceptance checks

Chrome checks run against the Linux binary started with `--demo`, in light mode at 1280 px wide unless stated. Checks marked CI also run as automated tests; "CI only" checks run only there.

| # | Check | Steps | Expected | CI |
| --- | --- | --- | --- | --- |
| C4-1 | Editor | Open Themes | The editor shows the current theme with a live preview; the status shows nothing unpublished | Yes |
| C4-2 | Primary colour | Set primary to `#0F766E`; check the preview; publish; open Forms and a form | The preview follows while editing and the rest of the page doesn't; after publishing, buttons, links, focus rings and the shell use it | Yes |
| C4-3 | Dark derived | Switch to dark mode after C4-2; then set the dark primary by hand | A lighter tint of the same hue is used, with readable text on it; the hand-set value replaces it | Yes |
| C4-4 | Contrast | Set primary to `#FFE600` | Text on primary turns dark automatically, or the editor warns where 4.5:1 can't be met | Yes |
| C4-5 | Radius | Give one Text field a Full control radius in the designer; then change the theme's base radius and publish | Every control without an override is re-rounded; the Full one stays Full | Yes |
| C4-6 | Text size and density | Change text size and density; publish | Text and control heights change across the shell, the designer and forms; nothing overlaps or clips | Yes |
| C4-7 | Component default | In the theme, set Button's root background to the success colour; publish; drop a new Button; open a form that already has one | New and existing Buttons use it; a Button with its own background keeps it | Yes |
| C4-8 | Source shown | Select a Button in the designer | Its background shows the theme's value, marked "From the theme"; overriding marks it set; reset brings the theme value back | Yes |
| C4-9 | Same properties | For Text field, Select and Card, compare the theme editor with the instance panel | Same slots and same style properties | Yes |
| C4-10 | Dark tokens | Set a component default to a theme colour and another to a custom hex; switch modes | The theme colour follows the mode; the hex stays the same | Yes |
| C4-11 | Draft and publish | Make a change; open Forms in a second tab; reload the editor; discard | The second tab shows the published theme; the draft survives the reload; discard restores the published theme | Yes |
| C4-12 | Conflict | Edit the draft in two tabs | The second tab shows the conflict message and offers a reload; nothing is overwritten silently | Yes |
| C4-13 | Reset to default | Reset to default; publish | The built-in look returns: Shesha blue and Inter | Yes |
| C4-14 | No flash | With a published theme, reload a form page | The built-in look never shows first | Yes |
| C4-15 | Invalid theme | PUT a theme with a bad colour and an unknown component type through the API | 400 `invalid_theme` with details for the bad colour; a theme with only the unknown type is kept and flagged in the editor | Yes |
| C4-16 | Keyboard | Without the mouse: change the primary colour through the swatches, set one component default, undo, publish | Every step works; focus ring always visible; changes are announced | Yes |
| C4-17 | Small fixes | Check each item in section 6 | All four done | Partly (by eye) |
| C4-18 | Earlier phases | Run the Phase 0 to 3 suites | All pass | CI only |
| C4-19 | Visual quality | Review the editor and a themed app in light and dark | Clear, calm, easy to scan; the preview reads as a preview; nothing clipped | No (by eye) |

Every check also requires zero console errors and warnings.

## 11. Definition of done

- Every requirement in sections 3 to 6 is met.
- ADR 0010 is written.
- Every check passes in the session, and the branch is pushed once.
- `docs/reports/phase-4.md` is complete, with deviations, decisions and the expected CI result.
- `docs/roadmap.md` marks Phase 4 as built.
- A pull request is open with a summary that links the report.

The phase is accepted when the Chrome checks in section 10 pass.

---

## Appendix — report template (`docs/reports/phase-4.md`)

```markdown
# Phase 4 report

## Status
- [ ] 3.1 Stored theme
- [ ] 3.2 What the theme controls
- [ ] 3.3 How values reach components
- [ ] 3.4 Source in the designer
- [ ] 4 Theme editor
- [ ] 4.1 Draft and publish
- [ ] 5 API
- [ ] 6 Small fixes

## What was built
## Design decisions (link ADR 0010)
## Deviations from the spec, with reasons
## Deferred
## Blockers
## How to run
## Checks run in the session, and the CI result expected
```
