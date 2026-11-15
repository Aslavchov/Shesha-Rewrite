# Phase 3 — Properties panel, styles and five more components

Shesha 2.0 · Phase 3 spec · v1.0 · 15 November 2026

Place this file at `docs/specs/phase-3.md`. Start this phase from `main`, which now includes Phase 2.

## 1. Goal

Make dropped components configurable. Selecting a component opens its properties: name, data path, settings and styles, all edited live on the canvas and undoable. Add five components (Card, Tabs, Text, Alert and Radio group) so a real CRUD screen can be built. Show authors what is wrong with a form, where it can be wrong.

## 2. How to work in this phase

Follow the "Working in a session" rules in `CLAUDE.md`: run every check in the session, push once when everything passes, open the pull request and stop. Don't watch CI.

- Read `CLAUDE.md`, `docs/roadmap.md`, the Phase 2 report and ADRs 0003 to 0008 before starting.
- Finish the whole phase before stopping. Build only what this spec lists; anything else goes under "Deferred" in the report.
- Keep `docs/reports/phase-3.md` updated as you work.
- **Write one ADR, `0009-properties-and-styles.md`,** covering: the new editing operations, how a run of edits becomes one undo step, how the panel is generated from definitions, and how the Appearance editor is built so the Phase 4 theme editor can reuse it.
- The document format (ADR 0003), the component contract (ADR 0004) and the three editing operations (ADR 0008) are frozen. **Extend them; don't change them.** New operations sit beside insert, move and remove.

## 3. Properties panel

You design the panel to current best practice. It must meet these requirements.

### 3.1 Generated, not hand-built

- The panel is generated from each component's definition: its settings descriptors (kind, default, label, help text, group) and its slots. No panel code names a component type.
- Every setting kind in use gets an editor. Settings are grouped by their `group`.
- Adding a setting to a definition makes it appear in the panel with no panel change. Prove it with a test.

### 3.2 Identity

- **Name:** editable, and validated as you type. It must be an identifier, unique in the form, and up to 64 characters. An invalid name shows why and isn't applied.
- **Data path** (inputs only): editable, validated the same way as on the server. Paths are identifier segments joined by dots, unique, with no path a prefix of another.
- The id never changes and isn't shown.

### 3.3 Editing settings

- **Live.** Changes appear on the canvas as you type.
- **One undo step per edit.** A run of edits to one field (typing a label, dragging a number) becomes one undo step, not one per keystroke.
- **Set or default.** Each setting shows whether it is set on this instance or using the component's default. Resetting removes the key from the document (ADR 0003, D5).
- **Validation.** An invalid value (for example a negative maximum length, or a minimum above the maximum) shows an inline error and never reaches the document.
- **Form settings.** With nothing selected, the panel shows the form's own name, description and gap. Renaming the form updates the designer title and the Forms list.
- **Columns.** Reducing the number of columns warns when children would be hidden. They stay in the document, marked as hidden in the outline (ADR 0003), and come back when the columns are restored.

### 3.4 Appearance (styles)

- For each slot of the selected instance, edit the properties in ADR 0006: colour, background, border colour, radius, font weight and padding.
- **Colours** can be a theme token, which follows light and dark mode, or a custom hex value. Make choosing a token the easy path.
- **Seeing the slot.** Hovering or focusing a slot in the panel highlights that part of the component on the canvas.
- **Set or default, and reset,** per property and per slot. Resetting removes the override from the document.
- **Reusable.** Build the Appearance editor as one component that takes a definition's slots, the current values and where defaults come from. Phase 4's theme editor will reuse it.
- State-specific overrides (hover) and per-side padding stay out of scope.

### 3.5 Problems

- An instance with recorded problems (an unknown type, an invalid stored setting, an unknown slot or token, children in a hidden region) is marked in the outline.
- Selecting it lists each problem in plain words in the panel. Where there is an obvious fix, offer it: for example, reset an invalid setting.

## 4. Five more components

Same contract, one folder each, one registry line each, with unit tests like the existing components. You may add sensible settings and slots; these are the minimum.

| Component | Kind | Minimum settings | Minimum slots |
| --- | --- | --- | --- |
| Card | Container, one region | title, description (optional), gap | root, header, title, description, content |
| Tabs | Container, one region per tab | tabs (each with a label), default tab, gap | root, list, tab, panel |
| Text | Static | text, variant (heading levels, paragraph, muted), alignment | root |
| Alert | Static | variant (info, success, warning, destructive), title, description | root, icon, title, description |
| Radio group | Input, option value | label, help text, options (label and value), default, required, orientation | root, label, item, description, error |

**Tabs:**
- Each tab's region is keyed by a stable generated key, never by its label, so renaming a tab never loses its content.
- On the canvas, choosing a tab shows its region, which then accepts drops. The outline shows every tab's region.
- Removing a tab that has children follows the hidden-region rule: children stay in the document, marked as hidden, and undo brings the tab back.

## 5. Small fixes from Phase 2

- Design-mode outlines and the selection box get a little space around the content, so labels no longer touch the border.
- The toolbox is one Tab stop. Arrow keys move between items, and Enter adds the focused one.
- The live region gets an explicit `role="status"`.

## 6. Out of scope

The theme editor and theme defaults per component (Phase 4); state-specific style overrides and per-side padding; entity binding, data tables and reference lists (Phase 5); expressions, events and actions (Phase 6); deleting forms from the UI; touch dragging.

## 7. Test IDs

`props-name`, `props-bind`, `props-setting-<key>` (the setting's editor, for example `props-setting-label`), `props-reset-<key>`, `props-form-name`, `props-form-description`, `props-appearance`, `props-slot-<slot>`, `props-style-<slot>-<property>` (for example `props-style-control-background`), `props-style-reset-<slot>`, `props-problems`, `outline-problem-<name>`, `toolbox-item-card`, `toolbox-item-tabs`, `toolbox-item-text`, `toolbox-item-alert`, `toolbox-item-radio-group`.

## 8. Frozen after this phase

Changing any of these later needs a new ADR:

- the new editing operations, and how edits merge into undo steps
- the panel being generated from definitions
- the Appearance editor's interface, which Phase 4 reuses
- Tabs regions keyed by stable keys

## 9. Acceptance checks

Chrome checks run against the Linux binary started with `--demo`, in light mode at 1280 px wide unless stated. Checks marked CI also run as automated tests; "CI only" checks run only there.

| # | Check | Steps | Expected | CI |
| --- | --- | --- | --- | --- |
| C3-1 | Live label edit | Select a Text field, type a new label, then undo once | The canvas updates while typing; one undo restores the whole old label | Yes |
| C3-2 | Set, default and reset | Set a placeholder, then reset it; read `/api/forms/<id>` after each | Shown as set, then as default; after reset the stored instance has no `placeholder` key | Yes |
| C3-3 | Validation settings | Set required and a maximum length of 5; Preview; type 6 characters, then submit empty | The length error shows, then the required error | Yes |
| C3-4 | Rename | Rename to `firstName`; try `first name`, then the name of another instance; change the data path to `person.firstName` | Valid changes apply in the outline and canvas, with the id unchanged; invalid ones show why and change nothing | Yes |
| C3-5 | Invalid setting | Enter a maximum length of -3; set a minimum length above the maximum | Inline errors; the stored document is unchanged | Yes |
| C3-6 | Form settings | With nothing selected, rename the form and change its gap | The title, the Forms list and the canvas spacing all update | Yes |
| C3-7 | Slot styles | On a Text field, set the control background to a theme token and the label colour to a custom hex; switch to dark mode | Only those two parts change; the token background follows dark mode | Yes |
| C3-8 | Slot isolation | Set a Select's trigger padding to large; open it in Preview | The popup items keep their own padding | Yes |
| C3-9 | Style reset | Reset one property, then the whole slot | The stored `styles` lose that property, then that slot | Yes |
| C3-10 | Columns count | Set Columns to 3 and drop a field in column 3; reduce to 2; restore to 3 | A warning when reducing; the field is marked hidden in the outline, not deleted; it returns at 3 | Yes |
| C3-11 | Problems | Create a form through the API with an unknown type and an invalid setting; open it in the designer | Both are marked in the outline; the panel explains each; the invalid setting offers a reset that works | Yes |
| C3-12 | New components | Add Card, Tabs, Text, Alert and Radio group; set their key settings; Preview | Each renders as configured; the radio group validates when required; tabs switch | Yes |
| C3-13 | Tabs editing | Add a tab, rename it, drop a field into it; remove the tab, then undo | Content survives the rename; removing marks the field hidden; undo restores the tab with its content | Yes |
| C3-14 | Keyboard | Without the mouse: reach the toolbox in one Tab, add a component, edit its label and one style, undo | Every step works; focus ring always visible; changes are announced | Yes |
| C3-15 | Small fixes | Check each item in section 5 | All three done | Partly (outline spacing by eye) |
| C3-16 | Valid documents | Extend the property-based test with the new operations | Every generated document passes the server's rules | CI only |
| C3-17 | Earlier phases | Run the Phase 0 to 2 suites | All pass | CI only |
| C3-18 | Visual quality | Review the panel and the new components in light and dark | Clear, calm and easy to scan; nothing clipped | No (by eye) |

Every check also requires zero console errors and warnings.

## 10. Definition of done

- Every requirement in sections 3 to 5 is met.
- ADR 0009 is written.
- Every check passes in the session, and the branch is pushed once.
- `docs/reports/phase-3.md` is complete, with deviations, decisions and the expected CI result.
- `docs/roadmap.md` marks Phase 3 as built.
- A pull request is open with a summary that links the report.

The phase is accepted when the Chrome checks in section 9 pass.

---

## Appendix — report template (`docs/reports/phase-3.md`)

```markdown
# Phase 3 report

## Status
- [ ] 3.1 Generated panel
- [ ] 3.2 Identity
- [ ] 3.3 Editing settings
- [ ] 3.4 Appearance
- [ ] 3.5 Problems
- [ ] 4 Five components
- [ ] 5 Small fixes

## What was built
## Design decisions (link ADR 0009)
## Deviations from the spec, with reasons
## Deferred
## Blockers
## How to run
## Checks run in the session, and the CI result expected
```
