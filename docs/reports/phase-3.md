# Phase 3 report

> Last update: 15 Nov 2026. The phase is complete: every requirement in sections 3 to 5 is built, ADR 0009 is written, and every check passed in the session before the one push. The first pull request was merged; the fixes from the Chrome checks (below) follow in a second one, after every check passed again. What CI is expected to say is at the end. Per the working rules, CI is not watched and this report is not updated with its result.

## Fixes after the Chrome checks

The Chrome pass of section 9 found four problems. All are fixed, with tests:

| Found | Cause | Fix | Tests |
| --- | --- | --- | --- |
| A field left with an invalid value left a half-typed value saved: "textField" on the way to the taken "textField2", no maximum on the way from 5 to -3, a minimum of 1 on the way to 10, "person.firstNam" on the way to a clashing path | Valid values are applied as they are typed, and nothing undid them when the final value was not valid | A run of edits now ends when its field is left or goes away. With a valid value it is kept (`end-run`); with one that cannot be stored it is taken back (`revert-run`): the document returns to what it was when the field took focus, the run leaves no undo step, and the field shows the document's value without its error (ADR 0009, section 2) | Model: `edits.test.ts` ("a run of edits ends"); the property-based test now runs `end-run` and `revert-run` too. Panel: `properties.test.tsx`. End to end: the four cases above, in C3-4 and C3-5 |
| After undo or redo, a field showed the restored value with the old error | Errors were state of the field, untouched by a jump of the document | The store has an `epoch` that goes up on undo, redo, a run taken back and a reload; every field drops its draft and its error when it changes | Panel and end to end ("after undo, a field shows the restored value without its old error") |
| Focus dropped to the page after a reset button, removing a tab or option, or a problem's fix | The pressed button went away with what it changed | Focus moves after the change is drawn: a reset to the setting's or property's editor (or the slot, for a whole slot); a removed row to the row that takes its place, the one before, or Add; a moved row follows the row; a fix to the next fix, then what was fixed, then the name | Panel (five cases) and end to end |
| The live region said only the first keystroke of a run ("Label of textField3: “P”.") | A run was announced on its first change | Nothing is said while a run goes on; `end-run` says the run once, with its final value. A Columns run says what it hid or showed as a whole | Model, panel, and C3-14 end to end |

The Appearance editor's props gained `onRunEnd` and `resetKey` for the same reasons; it still knows nothing of the designer.

## Status

- [x] 3.1 Generated panel
- [x] 3.2 Identity
- [x] 3.3 Editing settings
- [x] 3.4 Appearance
- [x] 3.5 Problems
- [x] 4 Five components
- [x] 5 Small fixes

## What was built

**The properties panel (`web/src/designer/properties`)**

| Part | Files | Holds |
| --- | --- | --- |
| The panel | `properties-panel.tsx` | The selection's header, problems, identity, settings and Appearance; with nothing selected, the form's own properties |
| Settings | `settings-editor.tsx`, `editors.tsx`, `list-editors.tsx` | One editor per setting kind, in sections by group, each with set-or-default, reset, its error and its help. List editors for options, tabs and validation messages |
| Identity | `identity.tsx` | Name and data path, checked as typed with the server's rules |
| The form | `form-properties.tsx` | The form's name, description and settings (gap) |
| Problems | `problems-list.tsx` | What is wrong with the selection, each with its fix |
| Shared | `property-row.tsx`, `edit-run.ts`, `described-by.ts` | A row's label, state and reset; runs of edits and drafts |

**The Appearance editor (`web/src/designer/appearance`)**: one component that takes slots, the current overrides and where defaults come from, and reports each change. A colour picker that offers the theme colours first, by name, then a custom hex value. Hovering or focusing a slot outlines that part on the canvas.

**The editing model (`web/src/designer/model`)**

- `operations.ts`: `rename`, `bind`, `set-setting`, `reset-setting`, `set-style`, `rename-form` and `describe-form` beside insert, move and remove, with the same guarantees.
- `editor.ts`: the commands for them, a `merge` key that turns a run of edits into one undo step, and announcements, including when a setting hides components or shows them again.
- `settings.ts`: asks a component (or the form) whether a value may be stored.
- `problems.ts`: an instance's problems in plain words, with fixes as commands.
- `rules.ts`: the server's rules for one name, data path, form name or description, with words to put it right.

**Five components**, one folder and one registry line each, with unit tests like the others:

| Component | Kind | Settings | Slots |
| --- | --- | --- | --- |
| Card | Container, one region | title, description, gap | root, header, title, description, content |
| Tabs | Container, one region per tab | tabs (stable key and label), default tab, gap | root, list, tab, panel |
| Text | Static | text (several lines), variant (heading 2 to 4, paragraph, muted), alignment | root |
| Alert | Static | variant (information, success, warning, destructive), title, description | root, icon, title, description |
| Radio group | Input, option value | label, help text, options, default (one of the options), required, orientation | root, label, item, description, error |

**Runtime additions (`web/src/forms/runtime`)**, all additive, recorded in ADR 0009: constraints between settings (`lengthRange`, `numberRange`, `dateRange`, used by Text field, Number field and Date picker); `checkSettings` on every definition; `choicesFrom`, `limits` and `multiline` on descriptors; the `tabs` setting kind; region labels; `shownRegion` and `regionSwitch` for containers; a `data-form-slot` attribute on every slot element; the `content` category; and a `form-reveal` event so that a hidden tab shows the invalid field it holds before it takes focus.

**Canvas, outline and toolbox**: tabs can be chosen on the canvas; the slot being pointed at is outlined; the canvas measures again when a component changes what it shows by itself. The outline marks instances with problems and names tab regions by their labels. The toolbox has a Content group.

**Small fixes (section 5)**

| Fix | How |
| --- | --- |
| Outlines get space around the content | The hover and selection ring is drawn 4 px outside the instance, and region edges 5 px outside the region, so labels no longer touch them |
| The toolbox is one Tab stop | A roving tab stop: the arrow keys move between items, Home and End go to the ends, Enter adds the focused one |
| The live region's role | `role="status"` on the designer's `<output>` |

**shadcn/ui components added** with the CLI: Tabs, Radio group and Alert. All three were moved onto the tokens: raw sizes removed, the per-component focus rings removed (the app has one, ADR 0002), the Tailwind important modifier removed. Alert gained the info, success and warning tones.

**Tokens**: `--sys-color-success`, `--sys-color-warning` and `--sys-color-info`, light and dark. As text they reach 5.5:1 or more on white and about 10:1 on the dark background.

**Tests**

| Suite | Count | Phase 2 |
| --- | --- | --- |
| Server and contracts (`cargo test`) | 82 | 82 |
| Frontend unit (Vitest) | 912 | 791 |
| Style guard (`node --test`) | 9 | 9 |
| End-to-end (Playwright, release binary) | 134 | 111 |

**Acceptance checks**

| Check | Covered by |
| --- | --- |
| C3-1 to C3-14 | `web/e2e/properties.spec.ts`, each named in its test title. C3-4 and C3-5 also have the cases found in the Chrome checks: a taken name, a clashing data path, a maximum typed as -3 and a minimum of 10 under a maximum of 5, each typed key by key and then left |
| C3-15 Small fixes | `web/e2e/properties.spec.ts`: one tab stop in the toolbox, `role="status"`, and the ring at least 3 px outside the instance. The look of the spacing is by eye |
| C3-16 Valid documents | `web/src/designer/model/editor.property.test.ts` now runs renames, data paths, settings, resets, styles and the form's name and description, valid and invalid, some merged into runs, from starting documents that include the new components. I checked that it fails when a bug is put in: a rename that skips the uniqueness check, a data path that skips the clash check |
| C3-17 Earlier phases | The 111 Phase 0 to 2 end-to-end tests run in the same suite (two changed, see deviation 9) |
| C3-18 Visual quality | By eye. I reviewed screenshots of the debug build at 1280 px in light and dark: the panel for a text field, a radio group and Tabs, the colour picker, the Appearance editor pointing at a slot, the problems list, and the five components on the canvas and in Preview. The automated check that nothing overflows the window at 1280 px still runs |
| 3.1 "Prove it with a test" | `web/src/designer/properties/properties.test.tsx`: a test component gains a setting, and the panel shows it, in its group, with its help, with no panel change. Another test opens every registered component and finds an editor for each setting and each slot |

## Design decisions (link ADR 0009)

[ADR 0009: properties and styles](../adr/0009-properties-and-styles.md) records the decisions the spec asks for, with the alternatives:

| Decision | In short |
| --- | --- |
| New editing operations | Seven named operations beside insert, move and remove: by id, all or nothing, never mutating, refused for named reasons. A component is asked, through `checkSettings`, whether a value may be stored before it becomes an operation |
| One undo step per edit | Commands carry a `merge` key; a change with the same key as the last history entry replaces its "after". The panel gives each field a new key each time it takes focus |
| A generated panel | One editor per setting kind (a `Record` over the kinds, so a new kind does not compile without one), in sections by group. Set means the key is stored; reset removes it |
| The Appearance editor | Props: slots, current styles, where defaults come from, and callbacks. It knows nothing of the designer, so Phase 4 reuses it |
| Tabs regions | Keyed by stable keys; a new tab never reuses a stored region's key |

Decisions the spec left to me:

- **An invalid value is shown until the field is left.** While the field has focus, what is typed stays, with the reason under it. Leaving the field takes the whole run back, so the document is as it was when the field took focus.
- **Undo works from the panel's fields.** Ctrl+Z in a panel field is the designer's undo, a run of typing at a time, not the field's own. The same in the colour picker's popup: otherwise the browser's own undo acts on whichever field it last saw typed into (an end-to-end test found that).
- **Choosing the default value stores it.** Only Reset returns a setting to its default. A value chosen on purpose should not move when a default changes later (the Phase 4 theme).
- **Emptying an optional field resets it.** Empty text means "not set" for those settings (ADR 0003).
- **A new selection starts the panel at the top**, where its problems are.
- **Tab panels stay mounted** when the form runs, so a required field in a tab that is not shown still blocks a submit; that tab is shown before the field takes focus.
- **Headings in Text start at level 2.** The page around a form already has its level 1 heading.
- **Alert is a note, not a live alert.** It is there from the start; announcing it as it appears would only interrupt.
- **Select's default value is chosen from its options**, like Radio group's, instead of typed.
- **The designer's right-hand column is wider** (17 rem to 19 rem), with the outline taking two fifths of it and the panel the rest, each scrolling. At 1280 px the canvas still shows the form at its running width (C2-11 still passes).

## Deviations from the spec, with reasons

1. **The Columns warning comes with the change, not before it.** Settings are edited live, so reducing the count applies at once; the row then warns that a component is now hidden, the live region says so, the outline marks it hidden, and the Columns lists it under its problems. One undo, or raising the count again, brings it back. A confirmation before the change would break typing a number.
2. **Undo inside a panel field is the designer's** (see above). Phase 2 said typing in a field is not a shortcut; that stays true everywhere else.
3. **Choosing a tab on the canvas uses measured buttons over the tabs.** The canvas is inert (ADR 0008), so the real tab cannot be pressed. From the keyboard, a tab is shown from the panel (focus its label, or its eye button) or by selecting something inside it in the outline.
4. **A new category, Content**, holds Text and Alert in the toolbox. The contract's category type gained the value.
5. **Every slot element carries `data-form-slot`.** It is how the designer finds a part to outline. Three Phase 1 unit tests of `resolveSlots` were updated to expect it.
6. **Three colour tokens were added** for Alert's tones (ADR 0002 is extended, not changed).
7. **Extra test ids**, under the same convention: `props-identity`, `props-form`, `props-group-<group>`, `props-warning-<key>`, `props-problem`, `props-problem-fix-<n>`, `props-option-<n>-label`, `-value`, `-up`, `-down`, `-remove`, `props-option-add`, `props-tab-<n>-label`, `-show`, `-up`, `-down`, `-remove`, `props-tab-add`, `props-message-<rule>`, `props-token-<token>`, `props-style-<slot>-<property>-hex`, `-popup`, `-choices`, `props-style-reset-<slot>-<property>`, `props-slot-section-<slot>`, `props-setting-<key>-choices`, `designer-properties-body`, `canvas-slot-highlight`, `canvas-switch-<name>-<region>`, `field-<name>-tab-<key>`, `field-<name>-panel-<key>`, `field-<name>-option` (each radio).
8. **Node 22 in the session.** The machine has Node 22.23; `.node-version` asks for 24 and `package.json` allows 22.22 or later. CI uses 24.
9. **Changes to earlier phases' tests**, beyond adding to them: the C2-6 test no longer looks for "Settings arrive in Phase 3" and checks the panel's fields instead, and reads the selection ring from its new element; the toolbox unit test expects the Content group; the `resolveSlots` unit tests expect `data-form-slot`. None was removed.

Changes to earlier phases' code, beyond adding to it:

- `PropertiesPanel` moved from `designer/properties-panel.tsx` to `designer/properties/properties-panel.tsx` and was rebuilt.
- The designer's title follows the document's name, so renaming the form renames the page.
- The canvas's selection ring is a child element drawn outside the instance's box; the box itself, what is clicked, is unchanged.
- `parts/field.tsx` gained `GroupField` for a labelled group of controls, used by Radio group.
- Text field, Number field and Date picker gained a constraint each; their behaviour when filled in is unchanged.

## Deferred

- State-specific style overrides (hover) and per-side padding (out of scope, section 6).
- Theme defaults per component and slot, and the theme editor (Phase 4). The Appearance editor already takes its defaults as a parameter.
- A description for each radio option, and a disabled option. Neither is needed for a CRUD screen yet.
- Reordering options and tabs by dragging. Today they move with up and down buttons.
- Collapsing the panel's sections, and searching settings. Not needed at these sizes.
- Keeping an invalid draft when another component is selected and then selected again. Today the field shows the document's value again.
- A Card that has nothing to show in read-only mode (only buttons inside) still draws its frame. Container hides itself in that case; Card should too.
- The slot outline's name tag can sit over a label when the slot is narrow (a radio item). It is a hint shown while pointing.
- Splitting the JavaScript bundle: now 846 kB (267 kB gzipped).
- Still open from earlier phases: touch dragging, deleting forms from the UI, a designer layout for narrow windows, retrying a failed save by itself, locale-aware formats, and an automated guard for raw values in components.

## Blockers

None.

## How to run

From the repository root:

| To | Run |
| --- | --- |
| Develop | `node scripts/dev.mjs`, then open the Vite address it prints |
| Build the release binary | `node scripts/build.mjs` (the Linux build needs `musl-gcc`: `apt-get install musl-tools`) |
| Run it with the demo form | `./dist/shesha2-linux-x86_64/shesha2 --demo`, then open the printed address |
| Try the panel | Forms → Open in designer on Person details, then select a component |
| Run all checks | `node scripts/check.mjs` |
| Smoke-test the binary | `node scripts/smoke.mjs` |
| Run the end-to-end tests | `node scripts/e2e.mjs` (after a build) |
| Run them without a release build | `cargo build -p server`, `npm run build` in `web/`, then `node scripts/e2e.mjs --binary target/debug/shesha2` |

## Checks run in the session, and the CI result expected

**Run in the session, Linux x86_64, on the commit that was pushed**

| Check | Result |
| --- | --- |
| Typecheck (`tsc -b`) | Pass |
| Lint (oxlint with warnings as errors, Prettier) | Pass |
| Frontend unit tests, 912 in 40 files | Pass |
| Frontend build | Pass |
| `cargo fmt --check`, clippy with `-D warnings` | Pass |
| Rust tests, 82 | Pass |
| Generated types up to date | Pass (no contract changed) |
| Style guard and its 9 tests, 235 files | Pass |
| Linux release build (static musl, 6.1 MB) | Pass |
| Smoke test of that binary | Pass |
| Playwright, 134 tests against the release binary | Pass, two full runs in a row on the final code |
| The 23 Phase 3 tests repeated 4 times on 4 workers, to look for flakiness | 92 of 92 |

**Expected in CI on the pull request**

| Job | Expected |
| --- | --- |
| Web (typecheck, lint, unit tests, build) | Pass |
| Server (format, clippy, tests, generated types) | Pass |
| Style guard | Pass |
| Release binary, Linux x86_64 static (build and smoke test) | Pass |
| End-to-end tests against the Linux binary | Pass, 134 of 134 |
| GitHub Release | Skipped (runs only on `phase-*` tags) |
| Windows and macOS builds | Not run. They run only when the workflow is started by hand |

What differs between the session and CI, and so is the place to look if something fails:

- **Node 24 in CI, 22.23 here** (deviation 8).
- **Chromium.** CI installs the build Playwright 1.65 asks for; the session used the machine's pre-installed build (1243).
- **Timing.** The Tabs tests depend on the canvas measuring again after a tab is shown by Base UI's own effect; a MutationObserver does that, and the repeated runs found no flakiness. If a Tabs drop lands in the wrong tab in CI, that is where to look.
- **No Rust code changed**, so Windows and macOS builds are not affected.

Still open for the phase to be accepted: the pass of section 9 in Chrome, with C3-15's spacing and C3-18 by eye.
