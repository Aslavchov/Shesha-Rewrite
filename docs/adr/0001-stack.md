# ADR 0001: The stack

- Status: accepted
- Date: 12 November 2026
- Phase: 0

## Context

Shesha 2.0 is a rewrite, not a port. It must be easy to try (download one file, run it, nothing installed), fast to build on, and free of the technical debt of the current Shesha. The Phase 0 spec pins the stack; this record states what was pinned, which versions were installed, and why each choice holds up.

## Decision

| Layer | Choice | Installed in Phase 0 |
| --- | --- | --- |
| Frontend app | React, TypeScript (strict), Vite | React 19.3, TypeScript 7.0, Vite 8.3 |
| Components | shadcn/ui on Base UI primitives | shadcn CLI 4.23, style `base-nova`, `@base-ui/react` 1.9 |
| Styling | Tailwind CSS v4 + CSS-variable tokens | Tailwind 4.3 |
| Routing | React Router, client-side | 8.5 |
| Server data | TanStack Query | 5.107 |
| Server | Rust, Axum, Tokio | Rust 1.97, Axum 0.8.9, Tokio 1.54 |
| Database | SQLite, bundled into the binary | sqlx 0.9 (`sqlite-bundled`) |
| Single binary | rust-embed | 8.14 |
| Shared types | ts-rs | 12.0 |
| Unit tests | Vitest (web), `cargo test` (server) | Vitest 5.1 |
| End-to-end tests | Playwright against the release binary | 1.65 |
| CI | GitHub Actions | |
| Package manager | npm, lockfile committed | |

No other UI library, CSS-in-JS runtime or second component system is allowed.

## Why

**One binary, nothing installed.** A Rust server with the built frontend compiled in (rust-embed) and SQLite compiled in (sqlx's bundled SQLite) gives one file per platform that starts in milliseconds. The Linux build targets musl and is fully static, so it runs on any distribution; the Windows build links the C runtime statically. A Node or JVM server could not meet "download one file and run it".

**React, TypeScript, Vite.** The largest ecosystem for the drag-and-drop, form and editor work in later phases, with strict typing end to end. The app is a client-side single-page app built to static files, which is exactly what the binary embeds.

**shadcn/ui on Base UI.** The component source is copied into `web/src/components/ui` and is ours to edit. That is the point: when a component is wrong we change it, instead of overriding a library from outside. This is the structural answer to the `!important` and override layers that accumulate around a packaged component library. Base UI supplies the accessible behaviour (focus management, dialogs, keyboard handling) underneath.

**Tailwind v4 and CSS-variable tokens.** Tailwind v4 reads its theme from CSS variables, so the design tokens in `tokens.css` drive every utility directly and can change at run time, which the Themes phase needs. See ADR 0002.

**React Router and TanStack Query.** Client-side routing with deep links (the server returns `index.html` for any non-API path). TanStack Query owns server state, so components never hand-roll loading, error and retry logic.

**Axum and Tokio.** A small, well-understood async HTTP stack. The router is built by a plain function, so tests drive it in memory without opening a port.

**SQLite through sqlx.** One file in the data folder, no service to run. sqlx is async, embeds migrations with `migrate!`, and its runtime `query()` API needs no database at build time. Later phases need dynamic SQL for user-defined entities, which rules out relying on compile-time-checked queries anyway. Only the `macros` (for `migrate!`), `migrate`, `runtime-tokio` and `sqlite-bundled` features are on: no TLS, no other drivers.

**ts-rs.** Types that cross the API are written once, in Rust (`crates/contracts`), and generated into TypeScript. CI fails if the generated files are stale, so the two sides cannot drift.

**Vitest and Playwright.** Vitest shares Vite's configuration. Playwright runs against the real release binary in CI, so the end-to-end tests exercise what a person downloads, including the embedded frontend and the first-run database.

## Decisions made while implementing

- **Scripts are plain Node** (`scripts/*.mjs`, no dependencies). The same build command has to run on Linux, Windows and macOS in CI, which rules out shell scripts, and Node is already required for the frontend.
- **Linting is oxlint, formatting is Prettier.** oxlint is what the current Vite React template ships and it supports TypeScript 7. `cargo fmt` and clippy (warnings as errors) cover Rust.
- **The Rust toolchain is pinned** in `rust-toolchain.toml`, so a new clippy release cannot turn CI red on an unrelated change.
- **The product name and binary name each live in one place.** `APP_NAME` in `crates/contracts/src/lib.rs` (generated into `web/src/generated/app.ts` for the frontend) and `[[bin]] name` in `crates/server/Cargo.toml` (read by the scripts through `cargo metadata`, and by CI through the build script's outputs).
- **The shadcn sidebar was cut down** to what the shell uses. See the Phase 0 report.

## Consequences

- Contributors need both Node and Rust installed. `rust-toolchain.toml` and `.node-version` keep versions aligned.
- Upgrading a shadcn component means re-applying our edits by hand; the CLI's `add --diff` shows upstream changes.
- The static Linux build needs a musl C compiler (`musl-tools`) because SQLite is C.
- The binaries are unsigned in this phase; the README explains the warnings each OS may show.
