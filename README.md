# Shesha 2.0

Shesha 2.0 is a low-code builder for CRUD applications: forms built with a drag-and-drop designer, bound to entities, and themed through design tokens. The frontend is React, TypeScript and shadcn/ui; the backend is Rust; the whole app ships as a single binary.

This repository is the v1 prototype, built in phases. **Phase 0** (this one) is the walking skeleton: an app shell with working navigation, the design-token foundation, a light Rust server, and CI that produces one downloadable binary each for Linux, Windows and macOS. No form features exist yet.

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

- [Phase 0 spec](docs/specs/phase-0.md) and [Phase 0 report](docs/reports/phase-0.md)
- [ADR 0001: the stack](docs/adr/0001-stack.md)
- [ADR 0002: design tokens](docs/adr/0002-tokens.md)
