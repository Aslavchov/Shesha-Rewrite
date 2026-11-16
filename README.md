# Shesha 2.0

Shesha 2.0 is a low-code builder for CRUD applications: forms built with a drag-and-drop designer, bound to entities, and themed through design tokens. The frontend is React, TypeScript and shadcn/ui; the backend is Rust; the whole app ships as a single binary.

This repository is the v1 prototype, built in phases (see the [roadmap](docs/roadmap.md)).

- **Phase 0** is the walking skeleton: an app shell with working navigation, the design-token foundation, a light Rust server, and CI that produces one downloadable binary each for Linux, Windows and macOS.
- **Phase 1** defines what a form is and renders it: the form document format, the component contract, ten components, validation, edit and read-only modes, and forms stored on the server and listed on the Forms page.
- **Phase 2** is the designer's canvas: create a form, drag components onto it, nest them, rearrange them, and it saves itself. Everything works from the keyboard too.
- **Phase 3** makes components configurable: a properties panel generated from each component's definition edits its name, data path, settings and styles, live on the canvas and undoable, and says what is wrong with a form and how to fix it. Five components join: Card, Tabs, Text, Alert and Radio group.
- **Phase 4** adds the theme: colours, roundness, text size, density and a default look per component, edited as a draft with a live preview and published to the whole app.
- **Phase 5** turns forms into CRUD screens: entities and reference lists defined in the app, a data API for every entity, forms bound to an entity that load and save a row, and four components: Data table, Reference-list select, Entity picker and Status tag.

"Shesha 2.0" and the binary name `shesha2` are working names.

## Download and run

Nothing is installed on your machine. The binary keeps its data in a `shesha2-data` folder that it creates next to itself.

1. Get the binary for your system:
   - **Linux, from a release:** open the repository's Releases page and download `shesha2-linux-x86_64`. Until the final phase, releases carry the Linux binary only.
   - **Linux, from a pull request or commit:** open its CI run under Actions, and download the artifact `shesha2-linux-x86_64`. It arrives as a zip; unzip it to get `shesha2`.
   - **Windows and macOS:** these are built only when someone asks. Open Actions, choose the **CI** workflow, press **Run workflow** and pick the branch. When the run finishes it has three artifacts: `shesha2-linux-x86_64`, `shesha2-macos-arm64` and `shesha2-windows-x86_64`, each a zip holding `shesha2` (`shesha2.exe` on Windows).
2. Run it as shown below. It prints one line with its address, for example `Shesha 2.0 running at http://localhost:7400`.
3. Open that address in a browser. Press Ctrl+C in the terminal to stop.

The examples use the file name from a CI artifact (`shesha2`). A file downloaded from a release keeps its platform name, so use that name instead.

### Linux (x86_64)

```bash
chmod +x shesha2
```

```bash
./shesha2 --demo
```

The binary is statically linked, so it runs on any distribution.

### macOS (Apple Silicon)

```bash
chmod +x shesha2
```

```bash
./shesha2 --demo
```

The binary is not signed, so macOS may refuse to open it the first time. If it does, allow it under System Settings → Privacy & Security → "Open Anyway", or remove the quarantine flag:

```bash
xattr -d com.apple.quarantine shesha2
```

### Windows (x86_64)

```powershell
.\shesha2.exe --demo
```

The binary is not signed, so Windows SmartScreen may show "Windows protected your PC". Choose "More info", then "Run anyway".

### Options

| Flag | What it does |
| --- | --- |
| `--port <n>` | Port to listen on. Default `7400`. If it is busy, the next free port is used and printed. |
| `--data-dir <path>` | Folder for the database. Default: `shesha2-data` next to the binary. |
| `--demo` | Reset the database to the seed state, then start. |
| `--help` | Show the options. |

The server listens on `127.0.0.1` only, so it is reachable from this computer and nowhere else.

### Forms

Start with `--demo` and open **Forms** to find "Person details", a form that uses every component. Fill it in and submit it to see the values it hands over; switch to Read-only to see them as text.

### The designer

Press **New form** on the Forms page, give the form a name, and it opens in the designer. **Open in designer** on any form in the list does the same for an existing one, and **Designer** in the sidebar lists the forms to open.

- **Add** a component by dragging it from the toolbox onto the canvas or into the outline, or by pressing it: it lands after the selected component, or at the end of the form.
- **Move** a component by dragging it, on the canvas or in the outline. A line shows exactly where it will land. A container cannot be dropped into itself; where a drop is refused, no line is shown.
- **Select** by pressing a component on the canvas or in the outline. Delete and Duplicate act on the selection. Undo and Redo cover every change.
- **Configure** the selection in the properties panel: its name and data path, every setting of its component, and the look of each of its parts under Appearance, where a theme colour follows light and dark mode. Changes show on the canvas as you type; one undo takes back one edit. Hovering a part in Appearance outlines it on the canvas. With nothing selected, the panel edits the form's own name, description and spacing.
- **Problems** are marked in the outline and explained in the panel, with a fix where there is one.
- **Tabs:** press a tab on the canvas, or the eye beside it in the panel, to show it and drop components into it.
- **Preview** shows the form as people will use it. **Design** returns to the canvas as you left it.
- Changes **save themselves** a moment after the last edit; the status beside the form's name says so. If the form was changed somewhere else in the meantime, the designer stops saving, says so, and offers to reload.
- **From the keyboard:** Tab moves between the toolbox, the canvas, the outline and the properties panel; in the toolbox the arrow keys move between items and Enter adds one; the arrow keys select; Alt+↑ and Alt+↓ move the selection up and down, into and out of containers. The keyboard button in the toolbar lists every shortcut.

### Themes

**Themes** in the sidebar restyles the whole app, with no rebuild: the brand and status colours, the page background and the sidebar, roundness, text size and density, and a default look for each component. Every change shows at once in a preview beside the controls, in light or dark; the rest of the app keeps the published theme until you press **Publish**.

- A **dark value** you do not set is worked out from the light one, keeping its hue. Text on a colour is chosen for you to stay readable; where a colour cannot reach 4.5:1, the editor says so.
- **Component defaults** use the same Appearance editor as the designer. A form's author can still override any of them on one instance; the designer shows which values come from the theme.
- The draft **saves itself** and survives a reload. **Discard** returns it to the published theme; **Reset to default** makes a draft of the built-in look. Undo and redo cover every change. If the theme is changed in another tab, saving stops and the editor offers to reload.

### The forms API

Forms can also be created and changed through the API. A form is a JSON document ([ADR 0003](docs/adr/0003-form-document.md)):

```bash
curl -X POST http://localhost:7400/api/forms -H "Content-Type: application/json" -d '{
  "document": {
    "formatVersion": 1,
    "name": "Feedback",
    "components": [
      { "id": "c_1", "type": "text-field", "name": "subject", "bind": "subject",
        "settings": { "label": "Subject", "required": true } },
      { "id": "c_2", "type": "text-area", "name": "message", "bind": "message",
        "settings": { "label": "Message" } },
      { "id": "c_3", "type": "button", "name": "send", "settings": { "label": "Send" } }
    ]
  }
}'
```

| Endpoint | What it does |
| --- | --- |
| `GET /api/forms` | Lists the forms, most recently updated first. |
| `POST /api/forms` | Creates a form from `{ "document": … }`. |
| `GET /api/forms/{id}` | Returns a form's document and revision. |
| `PUT /api/forms/{id}` | Replaces it from `{ "revision": n, "document": … }`. A stale revision is refused with 409. |
| `DELETE /api/forms/{id}` | Deletes it. |

An invalid document is refused with 400 and a list of every problem and where it is ([ADR 0007](docs/adr/0007-error-details-and-forms-api.md)).

### The theme API

The app has one theme, stored as a sparse JSON document ([ADR 0010](docs/adr/0010-themes.md)): only what differs from the built-in look.

| Endpoint | What it does |
| --- | --- |
| `GET /api/theme` | Returns the published theme and its revision. |
| `GET /api/theme/draft` | Returns the draft and the published theme, and whether they differ. |
| `PUT /api/theme/draft` | Saves the draft from `{ "revision": n, "document": … }`. A stale revision is refused with 409. |
| `POST /api/theme/publish` | Makes the draft the published theme, from `{ "revision": n }` (the draft's). |
| `POST /api/theme/discard` | Puts the draft back to the published theme, from `{ "revision": n }`. |

An invalid theme is refused with 400 `invalid_theme` and a list of every problem. `--demo` resets the theme to the built-in look.

## Development

You need [Node](https://nodejs.org) (the version in `.node-version`) and [Rust](https://rustup.rs) (`rust-toolchain.toml` selects the version). Run every command from the repository root.

| Command | What it does |
| --- | --- |
| `node scripts/dev.mjs` | Run for development: the Rust server plus the Vite dev server, with `/api` proxied. Open the Vite address it prints. |
| `node scripts/build.mjs` | Build the release binary: the frontend first, then the server with the frontend embedded. Output: `dist/shesha2-<os>-<arch>/`. CI uses this same command. |
| `node scripts/check.mjs` | Run the checks CI runs: typecheck, lint, unit tests and build for the frontend; format, clippy and tests for the server; generated types; style guard. Pass `web`, `server`, `types` or `style` to run one group. |
| `node scripts/smoke.mjs` | Start the binary built by `build.mjs`, check that it answers, and stop it. |
| `node scripts/e2e.mjs` | Run the Playwright end-to-end tests against the binary built by `build.mjs`. First time: `npx playwright install chromium` in `web/`. |
| `node scripts/generate-types.mjs` | Regenerate `web/src/generated/` from the Rust types in `crates/contracts`. CI fails if the committed files are out of date. |

On Linux the release build is static and needs the musl C compiler:

```bash
sudo apt-get install musl-tools
```

Pull requests and pushes to `main` run the checks, the Linux build with its smoke test, and the end-to-end tests on Linux. Windows and macOS builds run only when the CI workflow is started by hand from the Actions tab.

## Repository layout

```
.
├── CLAUDE.md                 # rules for every session
├── Cargo.toml                # Rust workspace
├── crates/
│   ├── server/               # Axum app, produces the shesha2 binary
│   └── contracts/            # shared types; generates TS into web/src/generated
├── web/
│   ├── src/
│   │   ├── app/              # shell, layout, routes, pages
│   │   ├── forms/
│   │   │   ├── runtime/      # component contract, form store, renderer
│   │   │   ├── parts/        # label, help text, error and read-only value, shared by inputs
│   │   │   ├── components/   # one folder per component
│   │   │   └── registry.ts   # one line per component
│   │   ├── designer/
│   │   │   ├── model/        # the editing model: operations, commands, undo history, the server's rules
│   │   │   ├── drag/         # drag and drop on Pointer Events
│   │   │   ├── properties/   # the properties panel, generated from definitions
│   │   │   ├── appearance/   # the Appearance editor (reused by the theme editor)
│   │   │   └── *.tsx         # canvas, outline, toolbox, toolbar
│   │   ├── theme/            # theme values to CSS, the published theme, the theme editor
│   │   ├── components/ui/    # shadcn/ui sources (owned, editable)
│   │   ├── styles/tokens.css # the single source of design values
│   │   └── generated/        # ts-rs output, never edited by hand
│   └── e2e/                  # Playwright tests
├── scripts/                  # build, dev and check scripts
├── docs/
│   ├── specs/                # one spec per phase
│   ├── reports/              # one report per phase
│   └── adr/                  # decision records
└── .github/workflows/        # CI
```

## Documentation

- [Roadmap](docs/roadmap.md): the phases of v1
- [Phase 0 spec](docs/specs/phase-0.md) and [Phase 0 report](docs/reports/phase-0.md)
- [Phase 1 spec](docs/specs/phase-1.md) and [Phase 1 report](docs/reports/phase-1.md)
- [Phase 2 spec](docs/specs/phase-2.md) and [Phase 2 report](docs/reports/phase-2.md)
- [Phase 3 spec](docs/specs/phase-3.md) and [Phase 3 report](docs/reports/phase-3.md)
- [Phase 4 spec](docs/specs/phase-4.md) and [Phase 4 report](docs/reports/phase-4.md)
- [Phase 5 spec](docs/specs/phase-5.md) and [Phase 5 report](docs/reports/phase-5.md)
- [ADR 0001: the stack](docs/adr/0001-stack.md)
- [ADR 0002: design tokens](docs/adr/0002-tokens.md)
- [ADR 0003: the form document format](docs/adr/0003-form-document.md)
- [ADR 0004: the component definition contract](docs/adr/0004-component-contract.md)
- [ADR 0005: form state and validation](docs/adr/0005-form-state-and-validation.md)
- [ADR 0006: how style overrides reach a component's slots](docs/adr/0006-slot-styles.md)
- [ADR 0007: the error shape's `details` field, and the forms API](docs/adr/0007-error-details-and-forms-api.md)
- [ADR 0008: the designer](docs/adr/0008-designer.md)
- [ADR 0009: properties and styles](docs/adr/0009-properties-and-styles.md)
- [ADR 0010: themes](docs/adr/0010-themes.md)
- [ADR 0011: entities and data](docs/adr/0011-entities-and-data.md)
