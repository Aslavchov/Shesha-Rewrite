# Phase 2 report

> Last update: 14 Nov 2026. The phase is complete: every deliverable is built and every check passed in the session before the one push. What CI is expected to say is at the end. Per the Phase 2 rules, CI is not watched and this report is not updated with its result.

## Status

- [x] 3.1 Getting in
- [x] 3.2 Layout
- [x] 3.3 Canvas
- [x] 3.4 Adding, moving and nesting
- [x] 3.5 Selection and commands
- [x] 3.6 Keyboard and screen readers
- [x] 3.7 New instances
- [x] 3.8 Saving
- [x] 4 Small fixes
- [x] 7 CI changes
- [x] 9 CLAUDE.md

## What was built

**The designer (`web/src/designer`)**

| Part | Files | Holds |
| --- | --- | --- |
| Editing model | `model/tree.ts`, `operations.ts`, `editor.ts` | Pure changes to a document; the three operations (insert, move, remove); commands, selection and the undo history |
| New instances | `model/ids.ts`, `names.ts` | Ids (`c_` plus ten base-32 characters) and names (`textField1`) |
| The server's rules | `model/rules.ts` | The server's validation in TypeScript, and its limits on a request |
| Reading a document | `model/schema.ts` | A document against the registry: each instance's definition, place, regions, and whether the form shows it |
| Drag and drop | `drag/controller.ts`, `drag/drag-layer.tsx` | The drag engine on Pointer Events; the label and the drop indicator |
| Canvas | `canvas.tsx`, `canvas-measure.ts`, `canvas-geometry.ts` | The real form in design mode, the boxes laid over it, and which place a point is over |
| Outline | `outline-panel.tsx`, `outline-rows.ts` | The tree, hidden instances, and drops on rows |
| The rest | `toolbox.tsx`, `properties-panel.tsx`, `toolbar.tsx`, `shortcuts.ts`, `save.ts`, `store.ts`, `designer.tsx` | Toolbox, properties, toolbar and shortcut list, autosave, the store, and the workspace that ties them together |

**Renderer (`web/src/forms/runtime`)**: `FormRenderer` takes an optional `design` surface (`design.ts`). With it, the same components render in edit mode, each instance and region handed to the surface. Nothing else in the runtime changed.

**Pages**

- **Forms** has a New form button (a dialog asking for a name and an optional description) and an Open in designer action on every form.
- **Designer** (`/designer`) lists the forms to open, with New form. It is no longer an upcoming page.
- **`/designer/<id>`** is the designer for one form. It takes the whole window, with a back link to the list, a link to the running form, and the theme toggle.

**Contracts and server**

- `crates/contracts`: `MAX_JSON_DEPTH` (127) and `MAX_REQUEST_BYTES` (2 MiB), generated into TypeScript. The server applies the size limit explicitly instead of relying on the framework's default; the value is the same.
- `crates/server/tests/fixtures/document-rules.json`: 95 documents with the paths of the problems the server reports. `crates/server/tests/document_rules.rs` and `web/src/designer/model/rules.test.ts` both run every case.
- New server tests pin both limits to what the server really does: a request nested to exactly 127 levels and to 128, and one of exactly 2 MiB and one byte more.
- No endpoint, response or validation rule changed.

**Small fixes (section 4)**

| Fix | How |
| --- | --- |
| Empty and not-found states size to their content | `ui/empty.tsx` no longer grows to fill the page |
| The Edit / Read-only switch sits with the form | It is directly above the form's card, at its left edge |
| Each page shows its title once | The header no longer repeats it; the page's `h1` is the title. The header keeps the menu button and the theme toggle |
| Text area shows a character count | `12 / 500` under the control when it has a maximum length; marked when over; part of what describes the control to a screen reader |

**CI (section 7)**: pull requests and pushes to `main` run the web checks, the server checks, the style guard, the Linux release build with its smoke test, and the end-to-end suite. Windows and macOS build only on a run started by hand ("Run workflow"), which builds, smoke-tests and uploads all three. A `phase-*` tag releases the Linux binary only. The README's download section says the same.

**shadcn/ui components added** with the CLI: Dialog and Tooltip. Both were moved onto the tokens (raw colours, sizes and the Tailwind important modifiers in the upstream Tooltip removed; its arrow dropped). Button gained a disabled look for `aria-disabled`, for toolbar buttons that stay focusable while disabled.

**Dependency added**: `fast-check` 4.10 (development only), for the property-based test.

**Tests**

| Suite | Count | Phase 1 |
| --- | --- | --- |
| Server and contracts (`cargo test`) | 82 | 78 |
| Frontend unit (Vitest) | 791 | 504 |
| Style guard (`node --test`) | 9 | 9 |
| End-to-end (Playwright, release binary) | 111 | 72 |

**Acceptance checks**

| Check | Covered by |
| --- | --- |
| C2-1 to C2-12, C2-14 | `web/e2e/designer.spec.ts`, each named in its test title |
| C2-13 Smooth with many components | By eye is the check. Also automated: with fifty instances, the last is dragged to the top edge, the canvas scrolls to the top by itself, and the drop lands first |
| C2-15 Valid documents | `web/src/designer/model/editor.property.test.ts`: 400 random command sequences, 200 sequences of additions, 300 starting documents. I checked that it fails when a bug is put in: no clash check on data paths, no uniqueness of names, a duplicate keeping its data path, no depth limit |
| C2-16 Earlier phases | The 72 Phase 0 and Phase 1 end-to-end tests run in the same suite, with the section 4 changes: the header-title assertions became "the title is shown once" |
| C2-17 Visual quality | By eye is the check. I reviewed screenshots of the release build at 1280 px in light and dark: empty form, nested layout, selection, a drag in progress, hidden instances, the shortcut list, Preview, the conflict message, the New form dialog. One automated check: nothing overflows the window in either theme |

## Design decisions (link ADR 0008)

[ADR 0008: the designer](../adr/0008-designer.md) records the four the spec asks for, with the alternatives:

| Decision | In short |
| --- | --- |
| Editing model | Three operations by id on an immutable document. History is a list of whole documents that share what they did not touch, with the selection. Undo puts the same object back |
| Drag and drop | Our own controller on Pointer Events, about 270 lines, no library. dnd-kit, Pragmatic drag and drop and React Aria were considered; the ADR says why not |
| Canvas | The real `FormRenderer` in design mode, inert, with each instance wrapped in an element that has no box. Selection, hover, focus and drops happen on measured boxes laid over it |
| Saving | Autosave 700 ms after the last edit, with the revision. Documents compared by identity, one request at a time. A 409 stops autosave, locks the designer and offers a reload |

Decisions the spec left to me:

- **The designer takes the whole window.** At `/designer/<id>` there is no app sidebar. At 1280 px that is what lets the canvas show the form at the width it runs at, so C2-11 is true to a tenth of a pixel (there is a test). The back link returns to the list.
- **The keyboard moves a component one place at a time** (Alt+↑, Alt+↓) through every position in document order, into and out of containers, rather than imitating a drag.
- **Delete and Duplicate are toolbar buttons** beside Undo and Redo, enabled when something is selected.
- **Preview locks the designer.** The toolbox, outline and properties are dimmed and inert, and the shortcuts are off, so typing in a previewed field is only typing. A valid submit shows the submitted data, as the form's own page does.
- **A conflict locks the designer** until it is reloaded. The spec asks for autosave to stop; working on in a copy that can no longer be saved would only add to what is lost.
- **Regions in the outline.** A container with several regions (Columns) shows a row per region, which is also where to drop into an empty one. A container with one region lists its children directly.
- **The save status says "Saving…"** from the edit until the server has answered, covering both the short wait and the request.
- **Toolbar buttons stay focusable while disabled**, so a command that disables its own button (the last Undo) does not strand keyboard focus.
- **A name tag on the selected instance**, on its top edge, because every new instance carries its type's default label until Phase 3.

## Deviations from the spec, with reasons

1. **`canvas-<name>` is a box over the instance, not an element around it.** It is exactly over the component, it is what is clicked, hovered, focused and dragged, and its bounding box is the instance's. The component itself is `field-<name>` inside `designer-canvas`. The reason is in the ADR: an element around the component would change its layout.
2. **Delete works from the canvas and the outline, not from everywhere.** With focus on a toolbox item or a toolbar button, Delete and Backspace do nothing, so a destructive key cannot act from a place that does not show the selection. Undo, redo, duplicate and move work wherever focus is. C2-8 is done by tabbing to the canvas before Delete.
3. **The browser writes its own console line for a refused request.** In C2-12 the second tab's console shows "Failed to load resource: the server responded with a status of 409". That is the conflict itself (ADR 0007), written by the browser, and a page cannot stop it. The app writes nothing. The same has always been true of the 404 in C1-18.
4. **The earlier end-to-end console check was not listening.** `consoleProblems` was first asked for in `afterEach`, so it attached its listeners after each test had finished and always saw nothing. It now listens from the start of every test. With that fixed, the only lines found in the whole suite were the browser's own for the 404 and 409 above; a test that causes one on purpose calls `expectRefusal(status)`.
5. **The nesting limit is 42 levels, not 41.** The Phase 1 report measured 41 with a document that carried an extra level. The limit is the JSON parser's, on depth of JSON (127), now a named constant with a test. No behaviour changed.
6. **The Text area count does not stop typing.** As Phase 1 decided for the length rule, text over the limit is kept and reported.
7. **Extra test ids**, under the same convention: `designer-back`, `designer-open-form`, `designer-shortcuts`, `designer-shortcuts-list`, `designer-live`, `designer-save-retry`, `designer-properties-name`, `-type`, `-hidden`, `-empty`, `designer-not-found` and its `-link`, `designer-error` and its `-retry`, `drop-target` and `drop-target-<container>-<region>` (the drop target of an empty region), `drag-label`, `outline-<container>-<region>`, `forms-new-description`, `forms-new-name-error`, `forms-new-error`, `field-<name>-count`.
8. **Node 22 in the session.** The session's machine has Node 22.23; `.node-version` asks for 24 and `package.json` allows 22.22 or later. Every check ran on 22.23. CI uses 24.

Changes to earlier phases' code, beyond adding to it:

- `FormRenderer` gained the `design` prop; `NodeView` passes it down. Without it, rendering is unchanged.
- `web/src/lib/api.ts`: one request function behind `apiGet`, `apiPost` and `apiPut`; `ApiRequestError` carries the server's `details`.
- `AppHeader` no longer takes a title, and routes no longer carry one.
- `ModeSwitch` is now a thin use of a shared `SegmentedSwitch`; the designer's Design / Preview uses the same one. The "Submitted data" panel moved to `components/submission.tsx` for the same reason.
- `forms-page.tsx` was split: the list is `forms-browser.tsx`, shared with the Designer page.
- `tokens.css`: two sizes for the designer's side panels. `index.css`: the cursor while dragging.
- Tests of earlier phases changed only where section 4 says so, plus the console fixture above. None was removed.

## Deferred

- Showing a document's recorded problems to its author (Phase 3, per the spec).
- Operations for settings, styles and names, and merging a run of edits to one setting into one undo step (Phase 3; the ADR says how they fit).
- Touch dragging. A touch scrolls; components are added by pressing a toolbox item and moved from the keyboard.
- Jumping a component straight to the top or the bottom of the form from the keyboard. Today that is one press per place.
- A search box in the toolbox, and collapsing containers in the outline. Neither is needed at ten components.
- A designer layout for narrow windows. Below 1024 px the panels stack; it works, and it is not designed.
- Trying a failed save again by itself. Today it is tried on the next edit or on Retry.
- A form over about 20 kB that is closed within 700 ms of an edit may lose that edit: browsers limit the size of a request that outlives its page. Leaving the designer inside the app always saves.
- Remembering the prepared form of unchanged instances, so that a change renders only what changed. Not noticeable at fifty instances.
- Splitting the JavaScript bundle: now 773 kB (246 kB gzipped) in one file.
- Still open from Phase 1: state-specific style overrides, per-side padding, locale-aware formats, a minus key on iOS number fields, deleting or renaming a form from the UI. From Phase 0: an automated guard for raw values in components.

## Blockers

None.

## How to run

From the repository root:

| To | Run |
| --- | --- |
| Develop | `node scripts/dev.mjs`, then open the Vite address it prints |
| Build the release binary | `node scripts/build.mjs` |
| Run it with the demo form | `./dist/shesha2-linux-x86_64/shesha2 --demo`, then open the printed address |
| Try the designer | Forms → New form, or Open in designer on Person details |
| Run all checks | `node scripts/check.mjs` |
| Smoke-test the binary | `node scripts/smoke.mjs` |
| Run the end-to-end tests | `node scripts/e2e.mjs` (after a build) |
| Run them without a release build | `cargo build -p server`, `npm run build` in `web/`, then `node scripts/e2e.mjs --binary target/debug/shesha2` |

## Checks run in the session, and the CI result expected

**Run in the session, Linux x86_64, before the one push**

| Check | Result |
| --- | --- |
| Typecheck (`tsc -b`) | Pass |
| Lint (oxlint with warnings as errors, Prettier) | Pass |
| Frontend unit tests, 791 in 33 files | Pass |
| Frontend build | Pass |
| `cargo fmt --check`, clippy with `-D warnings` | Pass |
| Rust tests, 82 | Pass |
| Generated types up to date | Pass |
| Style guard and its 9 tests, 195 files | Pass |
| Linux release build (static musl, 6.1 MB) | Pass |
| Smoke test of that binary | Pass |
| Playwright, 111 tests against the release binary | Pass, two full runs in a row |
| The 38 designer tests repeated 4 times on 4 workers, to look for flakiness | 152 of 152 |

**Expected in CI on the pull request**

| Job | Expected |
| --- | --- |
| Web (typecheck, lint, unit tests, build) | Pass |
| Server (format, clippy, tests, generated types) | Pass |
| Style guard | Pass |
| Release binary, Linux x86_64 static (build and smoke test) | Pass. The only build job on a pull request |
| End-to-end tests against the Linux binary | Pass, 111 of 111 |
| GitHub Release | Skipped (runs only on `phase-*` tags) |
| Windows and macOS builds | Not run. They run only when the workflow is started by hand |

What differs between the session and CI, and so is the place to look if something fails:

- **The workflow file itself.** Its new build matrix is an expression that picks one platform or three by how the run was started. I checked that the file parses and that both lists inside the expression are valid JSON; the expression can only be run by GitHub.
- **Node 24 in CI, 22.23 here** (deviation 8).
- **Chromium.** CI installs the build that Playwright 1.65 asks for; the session used the machine's pre-installed build.
- **Windows and macOS** were not built in this phase at all. No Rust code that differs by platform was changed.

Still open for the phase to be accepted: the pass of section 10 in Chrome, with C2-13 and C2-17 by eye.
