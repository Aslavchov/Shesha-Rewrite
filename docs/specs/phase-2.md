# Phase 2 — Designer canvas

Shesha 2.0 · Phase 2 spec · v1.0 · 13 November 2026

Place this file at `docs/specs/phase-2.md`. Start this phase from `main`, which now includes Phase 1.

## 1. Goal

Build the form designer: create a form, drag components onto a canvas, nest them, rearrange them, and save. The canvas is the heart of the product, so it must feel effortless with a mouse and fully work with a keyboard.

This phase is about the canvas only. Editing a component's settings and styles comes in Phase 3, together with five more components (Card, Tabs, Text, Alert, Radio group). In this phase, a dropped component keeps its defaults.

## 2. How to work in this phase

These rules replace the CI and session rules from earlier phases. Add them to `CLAUDE.md` (section 9).

- You own this codebase. Restructure where that gives a better result than adding layers.
- Read `CLAUDE.md`, `docs/roadmap.md`, the Phase 1 report and ADRs 0003 to 0007 before starting. The form document format and the component contract are frozen; build on them.
- Finish the whole phase before stopping. Build only what this spec lists; anything else goes under "Deferred" in the report.
- Keep `docs/reports/phase-2.md` updated as you work, so another session can continue from it.
- **Write one ADR, `0008-designer.md`,** covering: the editing model (operations and history), the drag-and-drop library and why, how the canvas renders components, and how saving works.
- **Run every check in the session before pushing**: typecheck, lint, unit tests, Rust tests, the style guard, the Linux build and the full end-to-end suite.
- **Push once,** when the phase is complete and every check passes, then open the pull request and stop.
- **Do not watch CI.** No scheduled check-ins, no waiting for runs, no follow-up commits that only update the report. Put the CI results you expect in the report before pushing. If CI fails, Auto-fix will bring you back.

## 3. The designer

### 3.1 Getting in

- The Forms page gets a **New form** button. It asks for a name and an optional description, creates the form through the API and opens it in the designer.
- Each form in the Forms list gets an **Open in designer** action.
- `/designer` (the Designer nav item) lists the forms to open, plus New form. `/designer/<id>` is the designer for one form.
- Designer is no longer an upcoming page. Update `web/src/app/pages.ts` and mark Phase 2 as built in `docs/roadmap.md`.

### 3.2 Layout

You design the layout to current best practice. It contains:

- a **toolbox** of every registered component, grouped by category, built from each definition's `displayName`, `description`, `icon` and `category`;
- the **canvas**;
- an **outline**: the form's component tree, showing each instance's name and icon;
- a **properties area** that shows the selected instance's type and name, and says that settings arrive in Phase 3;
- a toolbar with undo, redo, Design / Preview, and the save status.

### 3.3 The canvas

- **The canvas uses the real renderer.** It renders the document through `web/src/forms/runtime` with the real components, in a design mode where inputs can't be typed into. What you see on the canvas is what the form looks like. Never build a second set of look-alike components for the canvas.
- Empty regions (an empty form, an empty Container, an empty column) show a clear drop target.
- Containers and columns show their boundaries in design mode, so you can see where things will land.
- The selected instance is clearly outlined. Hovering shows which instance you would select.
- Columns children stored in a region beyond the current column count (ADR 0003) are not lost. Show them in the outline, marked as hidden.

### 3.4 Adding, moving and nesting

- **Drag from the toolbox** into any region, at any depth.
- **Drag on the canvas or in the outline** to reorder within a region or move to another region.
- While dragging, a **drop indicator** shows exactly where the instance will land. Dragging near the edge of a scrolling area scrolls it.
- **Invalid drops are refused:** a container can't go inside itself or its own descendants, and no drop may exceed the server's nesting limit. No indicator is shown for a refused target, and nothing changes.
- **Adding without dragging:** activating a toolbox item (click or Enter) inserts it after the selected instance, or at the end of the form when nothing is selected.

### 3.5 Selection and commands

- Clicking an instance on the canvas or in the outline selects it in both. Escape clears the selection.
- **Delete** removes the selection and its children. **Duplicate** copies it and its children.
- **Undo and redo** cover every change to the document. Use the platform's usual shortcuts, and buttons in the toolbar.
- Selection and focus move somewhere sensible after every command. For example, after a delete, the next sibling is selected.

### 3.6 Keyboard and screen readers

Everything you can do with a mouse, you can do with the keyboard: add from the toolbox, select, move to any position or region, delete, duplicate, undo and redo. Moves and drops are announced to screen readers. Show the shortcuts somewhere people can find them.

### 3.7 New instances

- Ids use the generator from ADR 0003: `c_` plus ten random base-32 characters.
- Names are generated from the type and are unique in the form: `textField1`, `textField2`, `columns1`.
- An input binds to a data path equal to its name.
- Duplicating gives every copied instance a new id, name and data path.
- New instances store no settings: they use their component's defaults (ADR 0003, D5).
- The designer never creates a document the server would reject. Prove it with a property-based test that applies random sequences of add, move, delete, duplicate, undo and redo, and checks every resulting document against the same rules the server enforces.

### 3.8 Saving

- **Autosave.** Changes save automatically shortly after the last edit. The toolbar shows the status: saved, saving, or not saved with the reason. Autosave means the designer needs no native "leave page?" browser dialog, so don't use one.
- **Revisions.** Every save sends the revision it was based on. On a 409 `revision_conflict`, stop autosaving and say plainly that the form was changed elsewhere. Offer to reload it. Never overwrite someone else's changes silently.
- **Preview.** Design / Preview switches the canvas to the interactive runtime form. Switching back keeps the layout, the selection and the undo history.

## 4. Small fixes from earlier phases

- Empty and not-found states size to their content instead of stretching to the full page height.
- On a form page, the Edit / Read-only switch sits with the form it controls.
- Each page shows its title once. Keep the clearest one and update the Phase 0 tests to match.
- Text area shows a character count when it has a maximum length.

## 5. Out of scope

Editing settings or styles, renaming instances, and the five new components (all Phase 3). Also: showing a document's recorded problems to the author (Phase 3), renaming or deleting forms from the UI, multi-select, copy and paste between forms, real-time collaboration, and canvas device-size previews.

## 6. Test IDs

`forms-new`, `forms-new-name`, `forms-new-create`, `forms-open-designer`, `designer-page`, `designer-toolbox`, `toolbox-item-<type>` (for example `toolbox-item-text-field`), `designer-canvas`, `canvas-<name>`, `designer-outline`, `outline-<name>`, `designer-properties`, `designer-undo`, `designer-redo`, `designer-delete`, `designer-duplicate`, `designer-mode-design`, `designer-mode-preview`, `designer-save-status`, `designer-conflict`, `designer-conflict-reload`, `drop-indicator`.

## 7. CI changes

Make CI lean:

- **Pull requests and pushes to `main`** run only: web checks, server checks, the style guard, the Linux release build and its smoke test, and the end-to-end suite on Linux.
- **Windows and macOS builds** run only when someone starts the workflow by hand from the Actions tab ("Run workflow"). That manual run builds and smoke-tests all three binaries and uploads them as artifacts.
- **Releases on `phase-*` tags** attach the Linux binary only, until the final phase.
- Update the README's download section to match.

## 8. Frozen after this phase

Changing any of these later needs a new ADR:

- the designer's editing operations and the undo history model
- the naming rule for new instances (`<type in camelCase><number>`) and binding inputs to their name
- autosave with revision conflict handling

## 9. Add to CLAUDE.md

Replace the "Do not report a phase done until CI is green" line under Testing with:

```markdown
## Working in a session
- Run every check in the session before pushing: typecheck, lint, unit tests,
  Rust tests, the style guard, the Linux build and the end-to-end suite.
- Push once, when the phase is complete and every check passes. Then open the
  pull request and stop.
- Do not watch CI: no scheduled check-ins, no waiting for runs, and no
  follow-up commits that only update the report. If CI fails, Auto-fix brings
  the session back.
- Pull request CI is Linux only. Windows and macOS builds run only when started
  by hand from the Actions tab.
```

## 10. Acceptance checks

Chrome checks run against the Linux binary started with `--demo`, in light mode at 1280 px wide unless stated. Checks marked CI also run as automated tests; "CI only" checks run only there.

| # | Check | Steps | Expected | CI |
| --- | --- | --- | --- | --- |
| C2-1 | New form | Forms → New form → name "Test form" → create | The designer opens on an empty canvas with a clear drop target; the form appears in the Forms list | Yes |
| C2-2 | Drag from toolbox | Drag Text field onto the empty canvas | A drop indicator shows during the drag; `textField1` appears on the canvas and in the outline; the status reaches "saved" | Yes |
| C2-3 | Nesting | Add Columns, then drag a Text field into its second column | It renders in column 2; the outline shows it nested under that column | Yes |
| C2-4 | Reorder and move | Drag an instance above another; drag one out of a column to the top level | The order on the canvas and in the outline matches each drop | Yes |
| C2-5 | Refused drops | Drag a Columns into one of its own columns | No drop indicator; nothing changes | Yes |
| C2-6 | Selection | Click an instance on the canvas, then a different one in the outline, then press Escape | Both views always show the same selection; the properties area shows type and name; Escape clears it | Yes |
| C2-7 | Commands | Delete an instance, undo, redo, undo; duplicate a Columns that has a child | Undo restores it in place with the same id and name; redo removes it again; the duplicate and its child get new unique names | Yes |
| C2-8 | Keyboard only | Without the mouse: add a Text field, move it into a column, move it to the top, delete it, undo | Every step works; each move is announced in a live region; focus ring always visible | Yes |
| C2-9 | Persistence | Reload the designer; open the form at `/forms/<id>`; read `/api/forms/<id>` | Layout identical after reload; the runtime form has the same order; the stored instances hold no default settings | Yes |
| C2-10 | Preview | Switch to Preview, type in a field, switch back | Preview is the interactive form; back in Design, the layout, selection and undo history are unchanged | Yes |
| C2-11 | Existing form | Open Person details in the designer | The canvas looks like the runtime form, including the blue Email label. Opening it changes nothing: the revision stays the same until you edit | Yes |
| C2-12 | Conflict | Open the same form in two tabs; make a change in each | The second tab shows the conflict message and offers a reload; nothing is overwritten silently | Yes |
| C2-13 | Smooth with many components | Duplicate until the form has about 50 instances; drag the last one to the top | Auto-scroll works; dragging stays smooth | No (by eye) |
| C2-14 | Small fixes | Check each item in section 4 | All four are done | Yes |
| C2-15 | Valid documents | Property-based test from section 3.7 | Every generated document passes the server's rules | CI only |
| C2-16 | Earlier phases | Run the Phase 0 and Phase 1 suites | All pass, with the test changes from section 4 | CI only |
| C2-17 | Visual quality | Review the designer in light and dark | Modern, clean and calm; clear hierarchy between toolbox, canvas and outline; nothing clipped | No (by eye) |

Every check also requires zero console errors and warnings.

## 11. Definition of done

- Every requirement in sections 3, 4, 7 and 9 is met.
- ADR 0008 is written.
- Every check passes in the session, and the branch is pushed once.
- `docs/reports/phase-2.md` is complete, with deviations, decisions and the expected CI result.
- `docs/roadmap.md` marks Phase 2 as built and shows the five components moved to Phase 3.
- A pull request is open with a summary that links the report.

The phase is accepted when the Chrome checks in section 10 pass.

---

## Appendix — report template (`docs/reports/phase-2.md`)

```markdown
# Phase 2 report

## Status
- [ ] 3.1 Getting in
- [ ] 3.2 Layout
- [ ] 3.3 Canvas
- [ ] 3.4 Adding, moving and nesting
- [ ] 3.5 Selection and commands
- [ ] 3.6 Keyboard and screen readers
- [ ] 3.7 New instances
- [ ] 3.8 Saving
- [ ] 4 Small fixes
- [ ] 7 CI changes
- [ ] 9 CLAUDE.md

## What was built
## Design decisions (link ADR 0008)
## Deviations from the spec, with reasons
## Deferred
## Blockers
## How to run
## Checks run in the session, and the CI result expected
```
