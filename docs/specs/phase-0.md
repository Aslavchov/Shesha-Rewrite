# Phase 0 — Foundations

Shesha 2.0 · Phase 0 spec · v1.4 · 13 November 2026

Place this file at `docs/specs/phase-0.md` before the run starts.

## 1. Goal

Stand up the walking skeleton of Shesha 2.0: a repository, an app shell, the design-token foundation, a light Rust server, and CI that produces a downloadable single binary for Linux, Windows and macOS.

At the end of this phase a person can download one file, run it, open the printed local address, and see a polished, themed app shell with working navigation. Nothing gets installed on their machine.

No form features are built in this phase. Everything later builds on what this phase sets up, so quality and conventions matter more than speed.

## 2. How to work in this phase

- You own this codebase and its design. Where restructuring gives a better result than adding layers, restructure.
- Finish the whole phase before stopping. Do not end with a list of remaining work unless you are genuinely blocked. If blocked, record exactly what blocked you in the report and stop.
- Build only what this spec lists. If you see something worth doing that is out of scope, write it under "Deferred" in the report instead of building it.
- Keep `docs/reports/phase-0.md` updated as you go, not only at the end. Another model may continue this session, and the report is how it picks up where you left off.
- Your training data may predate current versions of some tools in this stack. Check current versions when installing, and read the installed source (especially the shadcn/ui components copied into the repo) instead of relying on memory.
- If a package registry, documentation site or download is blocked by the network, do not work around it with vendored copies or mirrors. Record it in the report and continue with what you can.
- Use subagents for parallel, well-bounded work (for example CI setup while the shell is built). Give a one-line progress note every few steps.
- Before reporting done, run every check in section 9 that can run in CI, and fix what fails.

## 3. Stack (pinned for v1)

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend app | React 19, TypeScript (strict), Vite | Single-page app, built to static files |
| Components | shadcn/ui on **Base UI** primitives | Initialise with the shadcn CLI and choose Base UI as the component base. Component source lives in the repo and is ours to edit |
| Styling | Tailwind CSS v4 + CSS-variable tokens | All values come from `web/src/styles/tokens.css` (section 6) |
| Routing | React Router (current major), client-side | |
| Server data | TanStack Query | |
| Server | Rust, Axum 0.8.x, Tokio | |
| Database | SQLite, bundled into the binary | No system SQLite needed; migrations embedded; builds must not need a live database |
| Single binary | rust-embed 8.x | Built frontend is compiled into release builds |
| Shared types | ts-rs 12.x | Rust structs generate TypeScript types |
| Unit tests | Vitest (web), `cargo test` (server) | |
| End-to-end tests | Playwright, run in CI against the release binary | |
| CI | GitHub Actions | |
| Package manager | npm, lockfile committed | |

Do not add other UI libraries, CSS-in-JS, or a second component system.

## 4. Repository layout

```
.
├── CLAUDE.md                 # rules for every session (appendix A)
├── README.md
├── Cargo.toml                # Rust workspace
├── crates/
│   ├── server/               # Axum app, produces the `shesha2` binary
│   └── contracts/            # shared types; generates TS into web/src/generated
├── web/
│   ├── src/
│   │   ├── app/              # shell, layout, routes, pages
│   │   ├── components/ui/    # shadcn/ui sources (owned, editable)
│   │   ├── styles/tokens.css # the single source of design values
│   │   └── generated/        # ts-rs output — never edit by hand
│   └── e2e/                  # Playwright tests
├── scripts/                  # build, dev and check scripts
├── docs/
│   ├── specs/phase-0.md      # this file
│   ├── reports/phase-0.md    # your running report (appendix B)
│   └── adr/                  # decision records
└── .github/workflows/
```

"Shesha 2.0" and the binary name `shesha2` are working names. Keep them in one place each so a rename is trivial.

## 5. Deliverables

### 5.1 Server (`crates/server`)

- Binary `shesha2`. On start it prints exactly one line with its address, for example `Shesha 2.0 running at http://localhost:7400`, then logs at info level.
- Binds to `127.0.0.1` by default. Default port `7400`. If the port is busy, try the next free port and print the one used.
- Command-line flags: `--port <n>`, `--data-dir <path>` (default: a `shesha2-data` folder next to the binary), `--demo` (reset the database to the seed state, then start), `--help`.
- SQLite database file in the data directory, created on first run. Embedded migrations run on start. The first migration creates an `app_meta` table holding the schema version.
- Endpoints:
  - `GET /api/health` → `{ "status": "ok", "version": "<semver>", "db": "ok" }`. Returns `"db": "error"` and HTTP 503 if the database is unreachable.
  - `GET /api/info` → `{ "name": "Shesha 2.0", "version": "<semver>", "commit": "<short sha or 'dev'>" }`.
  - Any other `/api/*` path → HTTP 404 with the standard error shape.
- Standard error shape for every API error: `{ "error": { "code": "<snake_case>", "message": "<human readable>" } }`.
- Serves the embedded frontend at `/`. Any non-`/api` path with no matching file returns `index.html`, so deep links work.
- Graceful shutdown on Ctrl+C.
- Request types and response types for both endpoints come from `crates/contracts`.

### 5.2 Shared types (`crates/contracts`)

- Holds `HealthResponse`, `AppInfo` and `ApiError` for now.
- One documented command regenerates `web/src/generated/`. CI fails if the generated files are out of date.

### 5.3 Frontend (`web/`)

**App shell**

- Left sidebar with the product name and six navigation items: Home, Forms, Designer, Entities, Themes, Settings. Use shadcn/ui's sidebar if the Base UI base provides one; otherwise compose it from installed primitives.
- Header with the current page title and a light/dark toggle.
- Main content area with a page title and an empty state on every page except Home. Each empty state says in one line what the page will hold and which phase brings it (see `docs/roadmap.md`; Settings is not in a v1 phase, so it says it comes after v1).
- A "Skip to content" link as the first focusable element.
- Below 768 px wide, the sidebar collapses behind a menu button and opens as an overlay.
- A Not Found page for unknown routes, with a link back to Home.

**Home page**

- Shows the app name, version and commit from `/api/info`.
- Shows a "Design tokens" preview card containing one primary Button, one outline Button (shadcn's neutral, bordered variant), one text Input and one nested Card. This card exists so the seed tokens can be verified in the browser.
- If `/api/info` fails, shows a clear "Can't reach the server" message with a Retry button. No blank screen and no unhandled error.

**Theme**

- Light is the default on first visit. The toggle switches the whole app between light and dark, and the choice persists across reloads.
- Dark mode is applied with a `dark` class on `<html>`.
- Inter is self-hosted inside the build. The app makes no requests to external hosts.

**Quality bar**

- Zero console errors or warnings in the production build on every route.
- Visible focus indicator on every focusable element.
- Landmarks: `nav` for the sidebar, `main` for content, one `h1` per page.

### 5.4 Test IDs

Every interactive or checked element gets a stable `data-testid` in kebab-case, `area-element`. These are required in this phase:

`app-shell`, `sidebar`, `skip-link`, `nav-home`, `nav-forms`, `nav-designer`, `nav-entities`, `nav-themes`, `nav-settings`, `nav-menu-button`, `theme-toggle`, `page-title`, `app-version`, `app-commit`, `server-error`, `server-retry`, `token-preview`, `token-preview-primary`, `token-preview-outline`, `token-preview-input`, `token-preview-card`, `not-found`, `not-found-home-link`.

### 5.5 Build and CI

- One documented command builds the release binary (frontend first, then the Rust binary with the frontend embedded). CI uses the same command.
- One documented command runs the app in development (Rust server plus Vite dev server with `/api` proxied).
- GitHub Actions workflow on every pull request and every push to `main`:
  1. Web: install, typecheck, lint, unit tests, build.
  2. Server: format check, clippy with warnings as errors, `cargo test`.
  3. Generated types are up to date.
  4. Style guard: fails on any `!important` in CSS or TSX and on any Tailwind important modifier in `web/src`. Include a test proving the guard catches both forms.
  5. Release binaries for Linux x86_64 (statically linked, so it runs on any distribution), Windows x86_64 and macOS Apple Silicon.
  6. Playwright end-to-end tests against the Linux release binary, covering every check in section 9 that can run headless.
  7. Upload the three binaries as workflow artifacts, named `shesha2-<os>-<arch>`.
- On a pushed tag matching `phase-*`, create a GitHub Release with the three binaries attached.
- Cache Cargo and npm dependencies so repeat runs are fast.

### 5.6 Documentation

- `README.md`: what this is, how to download and run the binary on each OS (including `chmod +x` on Linux and macOS, and that unsigned binaries may show an OS warning), the dev and build commands, and the repo layout.
- `CLAUDE.md`: create it from appendix A. You may add a Commands section; do not remove or soften the rules.
- `docs/adr/0001-stack.md`: the stack in section 3 and why.
- `docs/adr/0002-tokens.md`: the token structure in section 6.
- `docs/reports/phase-0.md`: from appendix B, kept current.

## 6. Design tokens

`web/src/styles/tokens.css` is the single source of design values. shadcn/ui's CSS variables (such as `--primary`, `--border`, `--radius`) must reference these tokens, not repeat raw values. Components never contain raw colours, sizes or shadows.

Start from the latest shadcn/ui defaults. Make the UI look clean, modern and polished. You choose the type scale, spacing, radius, shadows, focus styles and dark-mode values.

There are exactly two fixed brand values:

| Token | Value |
| --- | --- |
| Primary | `#003BB2` (Shesha blue) |
| Font family | Inter, self-hosted |

In dark mode, use a lighter tint of the same blue if `#003BB2` does not give enough contrast, and record the value you chose.

Start from shadcn/ui and current best practice, not from the values or visual patterns of Ant Design or the current Shesha.

Record the design choices you made in `docs/adr/0002-tokens.md` and in the report, so they can be reviewed.

## 7. Frozen after this phase

These become contracts. Changing them later needs a new ADR:

- Repository layout (section 4).
- Token file location and the rule that components use tokens only.
- `/api` prefix and the standard error shape.
- The `data-testid` naming convention.
- The build and dev commands.

## 8. Out of scope

Forms, the designer, components beyond what the shell and token preview need, entities, authentication, theme editing UI, internationalisation, and any deployment beyond release binaries.

## 9. Acceptance checks

Each check is run in Chrome against the downloaded release binary started with `--demo`. Checks marked CI also run as Playwright tests.

| # | Check | Steps | Expected | CI |
| --- | --- | --- | --- | --- |
| C0-1 | Starts | Run the binary with `--demo` | One line printed with the local address within 3 seconds; `shesha2-data` folder created next to the binary | Yes |
| C0-2 | Shell loads clean | Open the printed address | `app-shell`, `sidebar` and six nav items visible; zero console errors or warnings | Yes |
| C0-3 | Navigation | Click each nav item, then Back | URL and `page-title` change for each; Back returns to the previous page | Yes |
| C0-4 | Deep links | Load `/themes` directly; then load `/nope` | Themes page renders; `/nope` shows `not-found`, and `not-found-home-link` returns Home | Yes |
| C0-5 | Theme toggle | Click `theme-toggle`, then reload | Whole app switches to dark, including sidebar and cards; dark persists after reload | Yes |
| C0-6 | API | Open `/api/health` and `/api/info`; open `/api/nope` | Health and info JSON as in 5.1; `/api/nope` returns 404 with the error shape | Yes |
| C0-7 | Version shown | Open Home | `app-version` and `app-commit` match `/api/info` | Yes |
| C0-8 | Brand values applied | In light mode on Home, read the computed background of `token-preview-primary` and the computed font family of the page | Background `rgb(0, 59, 178)`; font family starts with Inter | Yes |
| C0-9 | Server down | Stop the binary, then click Retry on Home | `server-error` shown with Retry; no blank screen; restart the binary, Retry recovers | Yes |
| C0-10 | Mobile width | Resize the window to 390 px wide | Sidebar hidden; `nav-menu-button` opens it as an overlay; no horizontal scroll | Yes |
| C0-11 | Keyboard | From page load, press Tab repeatedly | `skip-link` first, then nav items and `theme-toggle`; every focused element shows the focus ring | Partly |
| C0-12 | No external requests | Load Home and check network requests | Every request goes to the local address; Inter loads from the binary | Yes |
| C0-13 | Visual quality | Review Home in light and dark | Clean, modern look; consistent alignment and spacing; nothing clipped | No (reviewed by eye) |

## 10. Definition of done

- Every deliverable in section 5 exists.
- CI is green on the pull request, including all end-to-end tests.
- The three binaries are downloadable from the pull request's workflow run.
- `docs/reports/phase-0.md` is complete, with proposals and deviations listed.
- A pull request is open with a summary that links the report.

The phase is accepted when checks C0-1 to C0-13 pass in Chrome.

---

## Appendix A — CLAUDE.md (create verbatim, then add a Commands section)

```markdown
# Shesha 2.0 — rules for every session

Shesha 2.0 is a low-code builder for CRUD applications: forms built with a
drag-and-drop designer, bound to entities, themed through design tokens.
This repository is the v1 prototype, built in phases. Each phase has a spec
in docs/specs/ and a report in docs/reports/.

## Start of every session
1. Read this file.
2. Read the current phase spec in docs/specs/.
3. Read the previous phase report in docs/reports/.

## Scope
- Build only what the current phase spec lists.
- Ideas beyond scope go under "Deferred" in the phase report, not into code.
- Contracts frozen by an earlier phase change only through a new ADR in docs/adr/.
- Keep the current phase report updated as you work, so another session or
  model can continue from it.

## Architecture
- Frontend: web/ (React, TypeScript strict, Vite).
- Server: crates/server (Rust, Axum). Shared types: crates/contracts.
- TypeScript types for anything crossing the API come from crates/contracts.
  Never hand-edit web/src/generated/.
- All endpoints live under /api. Every API error uses
  { "error": { "code": "...", "message": "..." } }.
- The server binds to 127.0.0.1 unless told otherwise.

## Styling
- web/src/styles/tokens.css is the single source of design values.
- Components use tokens only: no raw colours, sizes or shadows in components.
- No !important and no Tailwind important modifier, anywhere. CI enforces this.
- shadcn/ui sources in web/src/components/ui are ours. Fix styling by editing
  them, never by overriding them from outside.
- The only fixed brand values are the primary blue (#003BB2) and the Inter font.
  Everything else follows current best practice, starting from shadcn/ui, not
  from Ant Design or the current Shesha's look.

## Fresh eyes
- Shesha 2.0 keeps Shesha's concepts (designer, components, properties, themes,
  entities, scripting, form API) and reinvents how they are built and how they
  look.
- Design every part from current, top-tier engineering and UX standards.
  The old Shesha's behaviour shows what users expect; it is not a template.
- Keep an old Shesha approach only when, judged against current best practice,
  it is genuinely the best option. Record that choice and the reason in an ADR.
  Much of the old implementation is technical debt, so the bar is high.

## Testing
- Every interactive or checked element has a data-testid in kebab-case,
  area-element.
- Every user-visible behaviour in a phase spec gets an end-to-end test.
- Do not report a phase done until CI is green.

## Quality
- Zero console errors or warnings.
- Keyboard accessible, with a visible focus ring everywhere.
- Prefer clear, small modules over clever abstractions.
```

## Appendix B — report template (`docs/reports/phase-0.md`)

```markdown
# Phase 0 report

## Status
- [ ] 5.1 Server
- [ ] 5.2 Shared types
- [ ] 5.3 Frontend
- [ ] 5.4 Test IDs
- [ ] 5.5 Build and CI
- [ ] 5.6 Documentation

## What was built
## Design choices for review (type scale, spacing, radius, shadows, focus, dark mode)
## Deviations from the spec, with reasons
## Decisions made (link ADRs)
## Deferred
## Blockers
## How to run
## CI and end-to-end results
```
