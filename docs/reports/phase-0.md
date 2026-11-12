# Phase 0 report

> Running report. Last update: 12 Nov 2026, all deliverables built and passing locally; pull request being opened, CI results to follow in the last section.

## Status

- [x] 5.1 Server
- [x] 5.2 Shared types
- [x] 5.3 Frontend
- [x] 5.4 Test IDs
- [x] 5.5 Build and CI (workflow written; see "CI and end-to-end results" for the run)
- [x] 5.6 Documentation

## What was built

**Server (`crates/server`, binary `shesha2`)**

- Axum 0.8 on Tokio. Binds `127.0.0.1`, default port 7400, moves to the next free port (up to 20 tries) and prints the one used.
- Prints exactly one line to stdout (`Shesha 2.0 running at http://localhost:7400`); all logging goes to stderr at info level.
- Flags: `--port`, `--data-dir` (default `shesha2-data` next to the binary), `--demo`, `--help`.
- SQLite through sqlx with bundled SQLite. The database file is created on first run; embedded migrations run on start; migration 1 creates `app_meta` with `schema_version`. `--demo` deletes the database and rebuilds it from the migrations (Phase 0 has no seed rows; the seed hook is in `db.rs`).
- `GET /api/health`, `GET /api/info`, 404 for any other `/api` path, all errors in the standard shape through one `AppError` type. Health returns 503 with `"db": "error"` when the database does not answer.
- Serves the embedded frontend; any non-`/api` path with no matching file returns `index.html`. Hashed files under `/assets/` are cached forever, everything else revalidates.
- Graceful shutdown on Ctrl+C (and SIGTERM on Unix).
- `build.rs` resolves the commit (`BUILD_COMMIT`, else git, else `dev`) and refuses a release build when `web/dist` is missing, so a binary can never ship without the frontend.

**Shared types (`crates/contracts`)**

- `HealthResponse`, `AppInfo`, `ApiError` (plus the small enums and body type they use) and `APP_NAME`.
- `node scripts/generate-types.mjs` regenerates `web/src/generated/`. CI regenerates and fails on any difference; a `cargo test` also compares the committed files byte for byte.

**Frontend (`web/`)**

- Vite, React 19, TypeScript strict, shadcn/ui (`base-nova` style) on Base UI, Tailwind v4, React Router 8, TanStack Query 5.
- Shell: skip link, sidebar (`nav`) with the product name and six items, header with the current page title and the light/dark toggle, `main` with one `h1` per page.
- Below 768px the sidebar is hidden behind a menu button and opens as a modal overlay; it closes on navigation, on Escape and on a click outside.
- Home shows name, version and commit from `/api/info`, and the "Design tokens" preview card. If the server cannot be reached it shows "Can't reach the server" with Retry; the rest of the page keeps working.
- Forms, Designer, Entities, Themes and Settings each show an empty state with one line on what is coming and in which phase. Unknown routes show Not Found with a link Home.
- Theme: light by default, `dark` class on `<html>`, stored in `localStorage`, applied before first paint.
- Inter is bundled; the app makes no request to any other host.

**Test IDs.** All 23 required IDs exist. Four more were added under the same convention because tests check them: `header-title`, `app-name`, `empty-state`, `empty-state-description`.

**Build, scripts and CI**

- `scripts/` (plain Node, no dependencies): `build.mjs`, `dev.mjs`, `check.mjs`, `e2e.mjs`, `generate-types.mjs`, `style-guard.mjs` (with `style-guard.test.mjs`), `smoke.mjs`.
- `.github/workflows/ci.yml`: web, server (including generated types), style guard, release binaries for three platforms, end-to-end tests against the Linux binary, artifact upload, and a GitHub Release on `phase-*` tags. Cargo and npm are cached.

**Tests**

| Suite | Count | Where |
| --- | --- | --- |
| Server and contracts (`cargo test`) | 38 | `crates/*/src`, `crates/*/tests` |
| Frontend unit (Vitest) | 32 | `web/src/**/*.test.ts(x)` |
| Style guard (`node --test`) | 9 | `scripts/style-guard.test.mjs` |
| End-to-end (Playwright, release binary) | 37 | `web/e2e` |

Acceptance checks covered end to end: C0-1 to C0-12, each named in its test title. C0-11 is covered in full for Home (tab order and a ring on every focusable element). C0-13 is by eye; light, dark and mobile were reviewed from screenshots of the release binary.

## Design choices for review (type scale, spacing, radius, shadows, focus, dark mode)

Full detail and reasoning: [ADR 0002](../adr/0002-tokens.md). Every value is in `web/src/styles/tokens.css`.

| Area | Choice |
| --- | --- |
| Primary | `#003BB2` in light. **Dark: `oklch(0.715 0.148 262.4)` ≈ `#70A1FF`**, the same hue, lighter, with dark text on it. `#003BB2` reaches only 2.1:1 on the dark background; the tint reaches 7.8:1. |
| Neutrals | 12 steps in OKLCH with a very slight tint towards the brand hue |
| Type scale | 12/16, 14/20, 16/24, 18/28, 20/28, 24/32, 30/36. 14px is the UI default; page titles 24px semibold |
| Weights | 400, 500, 600 |
| Spacing | 4px unit; controls 32px tall; cards padded 20px |
| Radius | 8px base; derived scale 4, 6, 8, 12, 16. Controls 8px, cards 12px |
| Shadows | Four soft layered steps; cards and controls use the lightest; three times stronger in dark |
| Focus | One rule for the whole app: 2px solid ring in the focus colour, 2px offset. Replaces shadcn's translucent halo |
| Dark mode | Background `#080A0E`, cards and sidebar `#15181D`, borders white at 10% |
| Sidebar | Light neutral-50 panel, 16rem wide; the active item has a neutral highlight and a brand-coloured icon |

Two structural choices worth a look:

- **Tailwind's default colour, type, radius and shadow scales are cleared.** Only token-backed utilities exist, so `bg-red-500` produces nothing.
- **Two token tiers:** `--ref-*` (palette) and `--sys-*` (decisions). shadcn's variables and the Tailwind theme both point at `--sys-*`.

## Deviations from the spec, with reasons

Items 1 and 2 are the ones most likely to need a decision from you.

1. **Phase numbers in the empty states are my assumption.** The spec asks each empty state to name the phase that brings the page, but contains no roadmap. I used Forms 1, Designer 1, Entities 2, Themes 3, Settings 4. They live in one place, `web/src/app/pages.ts`.
2. **"Default Button" is shadcn's `outline` variant.** In shadcn the variant called `default` is the filled primary one, so "one primary Button, one default Button" cannot both be taken literally. `token-preview-primary` is the filled brand button; `token-preview-default` is the neutral bordered one. I kept shadcn's variant names so components added later behave as their source expects.
3. **Home re-checks `/api/info` every 5 seconds.** C0-9 says to stop the binary and then click Retry, which needs the error to appear without a reload (a reload cannot work, because the binary also serves the page). The same polling means Home recovers by itself when the server returns.
4. **`status` is `"error"` when `db` is `"error"`.** The spec gives only the healthy shape and says the unhealthy one has `"db": "error"` and HTTP 503.
5. **The header title and the `h1` show the same text.** The spec asks for both. The header one is plain text, so each page still has exactly one `h1`.
6. **The menu button exists only below 768px.** On wider screens the sidebar is always shown and cannot be collapsed, which keeps the Tab order in C0-11 (skip link, navigation, theme toggle).
7. **CI artifacts are zips.** Each artifact is named `shesha2-<os>-<arch>` as specified and contains the binary (`shesha2` or `shesha2.exe`). Release assets on `phase-*` tags are the bare files, named by platform.
8. **A missing file under `/assets/` returns `index.html`,** as the spec states for any non-API path. A 404 there would be easier to debug; left as specified.
9. **Linting uses oxlint,** which is what the current Vite template ships and which supports TypeScript 7. The spec only says "lint". Prettier checks formatting in the same step.

Small additions that are not features but were needed or cheap and safe: a 405 in the error shape for a wrong method on an API route; a 500 in the error shape for a handler panic; `--version`; a smoke test that starts each built binary on its own OS in CI (the full end-to-end suite runs on Linux only).

## Decisions made (link ADRs)

- [ADR 0001: the stack](../adr/0001-stack.md), including versions installed and the decisions below.
- [ADR 0002: design tokens](../adr/0002-tokens.md).

Decisions recorded in ADR 0001:

- **sqlx rather than rusqlite**: async, embedded migrations, no database at build time, fits the dynamic SQL later phases need.
- **Scripts in plain Node**, so one build command works on all three operating systems.
- **Names in one place each**: `APP_NAME` in `crates/contracts/src/lib.rs`, binary name in `crates/server/Cargo.toml`. Scripts read the binary name from `cargo metadata`; the workflow gets artifact names from the build script. A rename touches those two lines plus the README.
- **Rust toolchain pinned** (1.97.0) in `rust-toolchain.toml`.

Changes to shadcn/ui sources (ours to edit, per the spec):

- **Sidebar cut down from 723 to about 290 lines.** Kept: provider, sidebar (fixed on desktop, Sheet overlay on mobile), trigger, inset, header, footer, content, group, menu, menu button. Removed: desktop collapse modes, rail, cookie, Ctrl+B shortcut, sub-menus, badges, skeletons, tooltips. The upstream file also contained three Tailwind important modifiers and several raw sizes, which the rules forbid.
- **Button, Input, Card, Sheet, Empty**: raw values replaced with tokens (`rounded-[min(…,10px)]`, `text-[0.8rem]`, `bg-black/10`, `translate-x-[2.5rem]`), per-component focus rings removed in favour of the single global one, a solid hover colour for the primary button, cards given a border and the lightest shadow.
- **`use-mobile` hook** rewritten on `useSyncExternalStore`, so the first render already knows the viewport width.
- The unused `tooltip` component was removed.

## Deferred

- An automated guard for raw values in components (today only `!important` and the important modifier are enforced).
- Code signing and notarisation of the binaries.
- Pinning GitHub Actions to commit SHAs instead of major version tags.
- Desktop sidebar collapse, and a "follow the system" theme option.
- Response compression and ETags for embedded assets.
- A Host-header check against DNS rebinding for the local server.
- Scoping a theme to part of the page (tokens currently resolve on `<html>`).
- End-to-end tests on Windows and macOS (CI smoke-tests those binaries but runs Playwright on Linux only).
- Caching the Playwright browser download in CI.
- A log-level flag or `RUST_LOG` support.

## Blockers

None. No registry, documentation site or download was blocked.

## How to run

From the repository root:

| To | Run |
| --- | --- |
| Develop | `node scripts/dev.mjs`, then open the Vite address it prints |
| Build the release binary | `node scripts/build.mjs` → `dist/shesha2-<os>-<arch>/shesha2` |
| Run it | `./dist/shesha2-linux-x86_64/shesha2 --demo`, then open the printed address |
| Run all checks | `node scripts/check.mjs` |
| Run the end-to-end tests | `node scripts/e2e.mjs` (after a build) |
| Regenerate shared types | `node scripts/generate-types.mjs` |

The static Linux build needs `musl-tools`. Downloading and running a CI binary is described in the README.

## CI and end-to-end results

**Local, Linux x86_64, before the pull request**

| Check | Result |
| --- | --- |
| Frontend typecheck, lint, 32 unit tests, build | Pass |
| `cargo fmt --check`, clippy with `-D warnings`, 38 tests | Pass |
| Generated types up to date | Pass |
| Style guard and its 9 tests | Pass |
| Release build (static musl, 5.4 MB) and smoke test | Pass; address printed in 5 ms |
| Playwright, 37 tests against the release binary | Pass, three runs in a row |

Not verifiable locally: the Windows and macOS builds, and the workflow itself. Those are proven by the CI run below.

**GitHub Actions**

_Pending: the pull request is being opened._
