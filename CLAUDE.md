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
- Do not report a phase done until CI is green.

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
