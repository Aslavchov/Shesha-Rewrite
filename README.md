# Shesha 2.0

Shesha 2.0 is a low-code builder for CRUD applications: forms built with a drag-and-drop designer, bound to entities, and themed through design tokens. The frontend is React, TypeScript and shadcn/ui; the backend is Rust; the whole app ships as a single binary.

This repository is the v1 prototype, built in phases (see the [roadmap](docs/roadmap.md)).

- **Phase 0** is the walking skeleton: an app shell with working navigation, the design-token foundation, a light Rust server, and CI that produces one downloadable binary each for Linux, Windows and macOS.
- **Phase 1** defines what a form is and renders it: the form document format, the component contract, ten components, validation, edit and read-only modes, and forms stored on the server and listed on the Forms page. There is no designer yet: `--demo` seeds a sample form, and other forms are created through the API.

"Shesha 2.0" and the binary name `shesha2` are working names.

## Download and run

Nothing is installed on your machine. The binary keeps its data in a `shesha2-data` folder that it creates next to itself.

1. Get the binary for your system:
   - **From a release:** open the repository's Releases page and download `shesha2-linux-x86_64`, `shesha2-macos-arm64` or `shesha2-windows-x86_64.exe`.
   - **From a pull request or commit:** open its CI run under Actions, and download the artifact `shesha2-linux-x86_64`, `shesha2-macos-arm64` or `shesha2-windows-x86_64`. It arrives as a zip; unzip it to get `shesha2` (`shesha2.exe` on Windows).
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

Until the designer exists, other forms are created through the API. A form is a JSON document ([ADR 0003](docs/adr/0003-form-document.md)):

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

## Development

You need [Node](https://nodejs.org) (the version in `.node-version`) and [Rust](https://rustup.rs) (`rust-toolchain.toml` selects the version). Run every command from the repository root.

| Command | What it does |
| --- | --- |
| `node scripts/dev.mjs` | Run for development: the Rust server plus the Vite dev server, with `/api` proxied. Open the Vite address it prints. |
| `node scripts/build.mjs` | Build the release binary: the frontend first, then the server with the frontend embedded. Output: `dist/shesha2-<os>-<arch>/`. CI uses this same command. |
| `node scripts/check.mjs` | Run the checks CI runs: typecheck, lint, unit tests and build for the frontend; format, clippy and tests for the server; generated types; style guard. Pass `web`, `server`, `types` or `style` to run one group. |
| `node scripts/e2e.mjs` | Run the Playwright end-to-end tests against the binary built by `build.mjs`. First time: `npx playwright install chromium` in `web/`. |
| `node scripts/generate-types.mjs` | Regenerate `web/src/generated/` from the Rust types in `crates/contracts`. CI fails if the committed files are out of date. |

On Linux the release build is static and needs the musl C compiler:

```bash
sudo apt-get install musl-tools
```

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
- [ADR 0001: the stack](docs/adr/0001-stack.md)
- [ADR 0002: design tokens](docs/adr/0002-tokens.md)
- [ADR 0003: the form document format](docs/adr/0003-form-document.md)
- [ADR 0004: the component definition contract](docs/adr/0004-component-contract.md)
- [ADR 0005: form state and validation](docs/adr/0005-form-state-and-validation.md)
- [ADR 0006: how style overrides reach a component's slots](docs/adr/0006-slot-styles.md)
- [ADR 0007: the error shape's `details` field, and the forms API](docs/adr/0007-error-details-and-forms-api.md)
