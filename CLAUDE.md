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

## Forms
- A form is a JSON document: ADR 0003. Its structure lives in crates/contracts;
  what goes inside `settings` lives with each component.
- web/src/forms/runtime is the component contract, the form store and the
  renderer. web/src/forms/parts is what inputs share (label, help text, error,
  read-only value).
- One folder per component in web/src/forms/components: `index.ts` (the
  definition), `settings.ts`, the renderers, and tests. Registering it is one
  line in web/src/forms/registry.ts. Nothing outside a component's folder names
  its type.
- Components never build styles. They spread the `slots.*` props they are
  given; web/src/forms/runtime/styles.ts is the only place a document's style
  values become CSS (ADR 0006).
- Frozen by Phase 1 (ADRs 0003 to 0007): the document format, the component
  contract, value types, name and data path rules, the slot style model, the
  forms API and the error shape's `details`.

## Designer
- web/src/designer is the form designer: ADR 0008.
- web/src/designer/model is pure: no React, no DOM. Every change to a document
  is one of three operations (insert, move, remove) applied through
  `runCommand`; undo history is a list of whole documents.
- The canvas is the real renderer in design mode, inert. Never build a second
  set of components for it. Selection, hover, focus and drops happen on boxes
  laid over it, placed by measuring the form.
- The designer must never produce a document the server would refuse.
  web/src/designer/model/rules.ts is the server's validation in TypeScript;
  crates/server/tests/fixtures/document-rules.json holds the two together.
  A new server rule needs a case there and the same rule in rules.ts.
- Frozen by Phase 2 (ADR 0008): the editing operations and the undo history
  model, the naming rule for new instances (`<type in camelCase><number>`,
  inputs bound to their name), and autosave with revision conflict handling.

## Properties and styles
- web/src/designer/properties is the properties panel: ADR 0009. It is
  generated from definitions, one editor per setting kind; no file there names
  a component type. A setting that is invalid only together with another needs
  a constraint on the definition, not a check in the panel.
- web/src/designer/appearance is the Appearance editor. It takes slots,
  current values and where defaults come from, and knows nothing of the
  designer, so the Phase 4 theme editor reuses it.
- Frozen by Phase 3 (ADR 0009): the edit operations beside insert, move and
  remove, how a run of edits merges into one undo step, the panel being
  generated from definitions, the Appearance editor's props, and Tabs regions
  keyed by stable keys.

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
- Unit tests fail on any console.error or console.warn. A test that expects
  one calls `expectConsoleProblems()` from web/src/test/console.ts.
- End-to-end tests fail on any console error or warning too. A test that makes
  the server refuse a request on purpose calls `expectRefusal(status)`.

## Working in a session
- Run every check in the session before pushing: typecheck, lint, unit tests,
  Rust tests, the style guard, the Linux build and the end-to-end suite.
- Push once, when the phase is complete and every check passes. Then open the
  pull request and stop.
- Do not watch CI: no scheduled check-ins, no waiting for runs, and no
  follow-up commits that only update the report. If CI fails, Auto-fix brings
  the session back.
- Pull request CI is Linux only. Windows and macOS builds run only when started
  by hand from the Actions tab.

## Quality
- Zero console errors or warnings.
- Keyboard accessible, with a visible focus ring everywhere.
- Prefer clear, small modules over clever abstractions.

## Commands
Run these from the repository root. They need Node (see .node-version) and
Rust (rust-toolchain.toml installs the right version by itself).

- `node scripts/dev.mjs`: run for development. Starts the Rust server and the
  Vite dev server with /api proxied; open the Vite address it prints.
- `node scripts/build.mjs`: build the release binary (frontend first, then the
  server with the frontend embedded) into dist/. CI uses the same command.
  The Linux build is static and needs musl-gcc (`apt-get install musl-tools`).
- `node scripts/check.mjs`: run every check CI runs except the end-to-end
  tests. Name groups to run only some: `web`, `server`, `types`, `style`.
- `node scripts/smoke.mjs`: start the binary that `build.mjs` produced, check
  that it answers, and stop it.
- `node scripts/e2e.mjs`: run the Playwright tests against the binary that
  `build.mjs` produced. While iterating, `--binary target/debug/shesha2` uses
  a debug build (`cargo build -p server`), which serves web/dist from disk.
- `node scripts/generate-types.mjs`: regenerate web/src/generated/ after
  changing a type in crates/contracts. Commit the result.
- `npm run format` (in web/): format the frontend and the scripts.
  `cargo fmt --all` formats the Rust code.

The product name lives in crates/contracts/src/lib.rs (`APP_NAME`) and the
binary name in crates/server/Cargo.toml (`[[bin]] name`). Everything else
reads them from there; do not repeat either as a literal.
