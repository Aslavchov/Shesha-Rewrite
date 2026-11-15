# Phase 4 report

> Last update: 15 Nov 2026. The phase is complete: every requirement in sections 3 to 6 is built, ADR 0010 is written, and every check passed in the session before the one push. What CI is expected to say is at the end. Per the working rules, CI is not watched and this report is not updated with its result.

## Status

- [x] 3.1 Stored theme
- [x] 3.2 What the theme controls
- [x] 3.3 How values reach components
- [x] 3.4 Source in the designer
- [x] 4 Theme editor
- [x] 4.1 Draft and publish
- [x] 5 API
- [x] 6 Small fixes

## What was built

**The theme on the server (`crates/contracts/src/themes.rs`, `crates/server/src/themes/`)**

| Part | Holds |
| --- | --- |
| Contracts | `ThemeDocument`, `ThemeColors`, `ThemeColor`, `Density`, `ThemeRecord`, `ThemeState`, `SaveThemeDraftRequest`, `ThemeRevisionRequest`, and the limits as constants (`theme.ts` in TypeScript): format version, colour roles, radius 0 to 16, text size 13 to 16, 200 component types, 50 slots each |
| Migration `0003_theme.sql` | One row: the published document and the draft, each with a revision and a time. Both start as the empty theme |
| `themes/validate.rs` | Every problem with its path: format version, `#RRGGBB` colours, known roles and keys, ranges, slot styles (the forms' check, now shared), limits. Component types are never checked |
| `themes/store.rs` | Save, publish and discard, each checking the revision in the same statement that writes |
| `themes/mod.rs` | The five routes (below) |
| `assets.rs` | Writes the published theme into `index.html`, escaped for a script element |

**The theme in the app (`web/src/theme/`)**

| File | Does |
| --- | --- |
| `colour.ts` | Hex to OKLCH and back, WCAG contrast, OKLab mixing. No imports, so the pre-paint script can use it |
| `variables.ts` | The one place a theme becomes CSS: the `--theme-*` properties, derived dark values, text on colours, contrast warnings, and the built-in colours as hex |
| `apply.ts`, `boot.ts` | Set a theme on `<html>`; read the theme the server wrote into the page. `boot.ts` is built into the inline script that runs before first paint |
| `published.tsx`, `use-published-theme.ts` | The published theme for the whole app, and its component defaults for every form |
| `scope.tsx` | A part of the page with a theme of its own, in light or dark: the preview |
| `editor/` | The theme editor: the pure editing model with undo, its store, the colours, scales and component-default sections, the preview, the palette and the sample form |

**Tokens.** The system tokens a theme can change read `--theme-<token>` (light) or `--theme-dark-<token>` (dark) first; radius, text size and density read `--theme-radius-base`, `--theme-text-scale` and `--theme-space-unit`. The token blocks and shadcn's bindings are declared on `[data-theme-scope]` too, and the `dark:` variant follows a scope's own scheme.

**Runtime.** The hosts that hand every renderer its slots merge the theme's defaults for the component's type under the instance's overrides, property by property (`withThemeStyles`, `ThemeStylesContext`). Components did not change.

**The designer.** The Appearance editor says where each style's value comes from, in words that the editor is described by: "Set here", "From the theme" or "Default". The colour picker's swatches are one Tab stop.

**The Themes page** (`/themes`) is built and no longer an upcoming page. Beside the controls, a sticky preview shows a miniature of the shell and one of every registered component, rendered by the real renderer, in light or dark. The status says whether there are unpublished changes; the draft saves itself; Undo, Redo, Reset to default, Discard and Publish sit together above.

**Tests**

| Suite | Count | Phase 3 |
| --- | --- | --- |
| Server and contracts (`cargo test`) | 147 | 82 |
| Frontend unit (Vitest) | 965 | 912 |
| Style guard (`node --test`) | 9 | 9 |
| End-to-end (Playwright, release binary) | 156 | 134 |

**Acceptance checks**

| Check | Covered by |
| --- | --- |
| C4-1 to C4-16 | `web/e2e/themes.spec.ts`, each named in its test title. Unit tests cover the same ground in `theme/editor/theme-editor.test.tsx`, `theme/variables.test.ts` and `designer/properties/properties.test.tsx` (C4-8). The API side of C4-15 is also in `crates/server/tests/themes.rs` |
| C4-17 Small fixes | `web/e2e/themes.spec.ts`: swatches as one Tab stop moved by the arrow keys, the Card's region edge inside its border, the slot tag clear of the name badge for root, label and control, and the properties at more than 60 % of the right column at 1280 × 900. The look is by eye |
| C4-18 Earlier phases | The 134 Phase 0 to 3 end-to-end tests run in the same suite (two changed, see deviation 6) |
| C4-19 Visual quality | By eye. I reviewed screenshots of the editor at 1280 × 900 in light and dark, with a teal and a yellow primary, a component chosen and a part pointed at; the demo form and the designer with a published theme, light and dark. The automated checks that nothing overflows sideways run in C4-6 |

## Design decisions (link ADR 0010)

[ADR 0010: themes](../adr/0010-themes.md) records the decisions the spec asks for, with the alternatives:

| Decision | In short |
| --- | --- |
| The theme document | Sparse, like a form: seven colour roles with light and dark, a base radius, a text size, a density, and slot styles per component type. Small ranges, so a theme cannot break the layout |
| How values reach components | `tokens.css` reads `--theme-*` properties, which `variables.ts` alone writes: on `<html>` for the published theme, on a `data-theme-scope` element for a preview. Component defaults merge under the instance's styles in the runtime's hosts |
| The scoped preview | The system tokens are declared on `[data-theme-scope]` as well, so they are worked out again inside it; the scope sets every theme property, to `initial` where the draft sets none, and names its scheme |
| No flash | The server writes the published theme into the page; an inline script built from the app's own code applies it before first paint |
| Dark values | Same OKLCH hue, at the dark brand blue's lightness or more, chroma kept up to its; surfaces become near-neutral darks. A hand-set value is kept |
| Draft and publish | One row, two documents, two revisions. Autosave with 409 conflicts, as in the designer; undo with ADR 0009's runs; publish saves first |
| The API | `GET /api/theme`, `GET` and `PUT /api/theme/draft`, `POST /api/theme/publish`, `POST /api/theme/discard`; 400 `invalid_theme` with details |

Decisions the spec left to me:

- **Controls.** Colours with a palette of twelve accents (each 4.5:1 or more on white) or ten surfaces, and a custom hex. Roundness 0 to 16 px on a slider. Text size 13, 14, 15 or 16 px. Density Compact, Regular or Comfortable: a space unit of 3.5, 4 or 4.5 px.
- **What follows each colour.** Primary sets its hover, the text on it and the focus ring. Background sets the page's text. Sidebar sets its text, its current item and its border.
- **Text on a colour is chosen, never set.** White where white reaches 4.5:1; otherwise the better of white and a dark tint of the same hue. A yellow primary therefore gets dark text. What cannot be chosen (a themed colour used as text on the page, muted text on a themed background) is listed in a warning with its ratio and what uses it.
- **Discard is undoable.** It is one more step in the history, so a discard by mistake is one undo away; the server's draft is then the published theme until the next save.
- **The preview is inert.** It is there to be looked at; nothing in it takes focus or a click, so Tab never wanders into a second copy of every control.
- **The preview's components are generated** from the registry, one of each with its default settings (containers hold one text field), so a new component appears in the preview by being registered.
- **The Themes page is wide** (88 rem instead of 64), because it is an editor beside its preview.
- **The outline takes what it needs, up to a third** of the designer's right-hand column; the properties get the rest. At 1280 × 900 that is about two thirds for the properties, where it was three fifths.
- **The slot tag moves below a part that starts at the top of its instance**, where the name badge is; elsewhere it stays above, at the end where a label never is.
- **A theme in another format version** is stored and returned untouched; this build applies nothing of it and the editor says it cannot edit it, as the renderer does for forms.

## Deviations from the spec, with reasons

1. **Two optional props were added to ADR 0009's Appearance editor** (`defaults.fallbackLabel`, `defaults.setLabel`) and two to the colour picker (`choices`, `inheritedValue`). The frozen props are unchanged; these let one editor say "From the theme" for a property the theme sets and "Default" for one it does not, and let the theme editor offer plain colours for a role instead of the roles themselves.
2. **`PropertyRow` shows where a value comes from in words for every style property**, set or not, instead of a dot and hidden text. Settings still use the dot and "Default", as in Phase 3.
3. **`Autosave` is generic over the document type** and gained `settle()`, which sends what is waiting and resolves once nothing is on its way, for Publish. The designer uses it exactly as before.
4. **The region of an instance on the canvas records its inner box** (inside the padding) as an optional field, which the edge is drawn from. Drops still use the whole box.
5. **Extra test ids**, under the same convention: `theme-colours`, `theme-scales`, `theme-components`, `theme-component-defaults`, `theme-component-reset`, `theme-component-<type>-remove`, `theme-stray-slot-<slot>`, `theme-color-<role>-reset` (and `-dark-reset`), `theme-swatch-<hex>`, `theme-radius-value`, `theme-text-size-<size>`, `theme-density-<step>`, `theme-preview-mode-light`, `-dark`, `theme-preview-sidebar`, `-page`, `-primary`, `-destructive`, `-link`, `-focus`, `-nav-current`, `theme-slot-highlight`, `theme-save-status`, `theme-save-retry`, `theme-failure`, `theme-live`, `theme-loading`, `theme-error`, `theme-unsupported-version`, `props-style-source-<slot>-<property>` (the spec's), `theme-style-source-<slot>-<property>`, `canvas-slot-tag`, `canvas-name-badge`.
6. **Changes to earlier phases' tests**, beyond adding to them: the C3-14 keyboard test reaches a swatch with the arrow keys instead of Tab (section 6 makes the swatches one Tab stop); the end-to-end `NAV` list marks Themes as built and puts it before Entities, as the sidebar now does; the unit test for upcoming pages no longer lists Themes, and the sidebar navigation test clicks Entities instead. None was removed.
7. **Node 22 in the session**, as in Phase 3. `.node-version` asks for 24; CI uses 24.

Changes to earlier phases' code, beyond adding to it:

- `tokens.css`: the themed system tokens read `--theme-*` properties, the type scale is multiplied by `--sys-text-scale`, and the colour and scale blocks are declared on `[data-theme-scope]` too. Without a theme every value is what it was.
- `index.css`: the `dark:` variant also applies inside a dark theme scope, and not inside a light one.
- `index.html`: the published-theme element and the pre-paint script; the build checks the marker is there.
- `forms/runtime`: Container renderers go through a host (`ContainerHost`) like inputs and statics, so their slots get the theme's defaults too. `Meta` is exported for the hosts.
- `pages.ts`: Themes is a built page (`THEMES_PAGE`) and sits after Designer in the sidebar.
- `forms/validate.rs`: the slot-style check moved into a function the theme's check shares; forms' behaviour and messages are unchanged.

## Deferred

- Multiple named themes, a theme per form, another typeface, state-specific (hover) overrides, per-side padding, exporting and importing a theme, and theme defaults for component settings (out of scope, section 7).
- A theme scope for a form rendered by itself, such as a preview of one form in another theme. The scope exists; nothing uses it outside the editor yet.
- Picking a colour from a full colour field. Today it is a palette or a typed hex value.
- Showing the published value beside the draft for each control, and a list of what changed since publishing.
- A history of published themes, to go back to one.
- Contrast warnings for colours on the sidebar's current item and for component defaults. Today the warnings cover the roles and the page's and sidebar's text.
- The theme's own colours as tokens a document may name: a form may already use `primary`, `success` and the rest, which follow the theme.
- Still open from earlier phases: touch dragging, deleting forms from the UI, a designer layout for narrow windows, retrying a failed save by itself, locale-aware formats, an automated guard for raw values in components, a Card that has nothing to show in read-only mode, and splitting the JavaScript bundle (now 889 kB, 281 kB gzipped).

## Blockers

None.

## How to run

From the repository root:

| To | Run |
| --- | --- |
| Develop | `node scripts/dev.mjs`, then open the Vite address it prints. The dev server does not write the published theme into the page, so the built-in look shows for a moment on a reload there |
| Build the release binary | `node scripts/build.mjs` (the Linux build needs `musl-gcc`: `apt-get install musl-tools`) |
| Run it with the demo form | `./dist/shesha2-linux-x86_64/shesha2 --demo`, then open the printed address |
| Try the theme | Themes in the sidebar: change a colour, see the preview, Publish, then open Forms |
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
| Frontend unit tests, 965 in 45 files | Pass |
| Frontend build | Pass |
| `cargo fmt --check`, clippy with `-D warnings` | Pass |
| Rust tests, 147 | Pass |
| Generated types up to date | Pass |
| Style guard and its 9 tests, 270 files | Pass |
| Linux release build (static musl, 6.3 MB) | Pass |
| Smoke test of that binary | Pass |
| Playwright, 156 tests against the release binary | Pass, two full runs in a row |
| The 22 Phase 4 tests repeated 6 times on 4 workers, to look for flakiness | 132 of 132 |

**Expected in CI on the pull request**

| Job | Expected |
| --- | --- |
| Web (typecheck, lint, unit tests, build) | Pass |
| Server (format, clippy, tests, generated types) | Pass |
| Style guard | Pass |
| Release binary, Linux x86_64 static (build and smoke test) | Pass |
| End-to-end tests against the Linux binary | Pass, 156 of 156 |
| GitHub Release | Skipped (runs only on `phase-*` tags) |
| Windows and macOS builds | Not run. They run only when the workflow is started by hand |

What differs between the session and CI, and so is the place to look if something fails:

- **Node 24 in CI, 22.23 here** (deviation 7).
- **Chromium.** CI installs the build Playwright asks for; the session used the machine's pre-installed build (1243).
- **The theme is shared state.** Every worker has one server, and the theme is global, so every Phase 4 test puts the built-in look back afterwards, retrying if a page's last save lands in between. If an earlier phase's test sees a teal button or a large text size in CI, a Phase 4 test left its theme behind.
- **Background tabs.** The two-tab tests bring the tab they act in to the front, because a browser gives a background tab no animation frames and a popup there never finishes closing. A timeout on a popup in C4-11 or C4-12 would point there.
- **Rust changed** (a migration, new routes, the page written with the theme), so the Windows and macOS builds, when started by hand, build new server code.

Still open for the phase to be accepted: the pass of section 10 in Chrome, with C4-17's look and C4-19 by eye.
