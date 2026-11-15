# ADR 0010: Themes

- Status: accepted
- Date: 15 November 2026
- Phase: 4

## Context

Phase 4 lets an administrator restyle the whole app from inside it, with no rebuild: brand and status colours, roundness, text size, density, and a default look for each component. Components follow the theme unless an author overrides them on one instance, and the designer shows where every value comes from.

The current Shesha also changes its theme from inside the app, and its team was working towards a standard default style per component. Both ideas are kept. What is left behind is free-form CSS and per-component styling code: here a theme is data, built from the tokens (ADR 0002) and the slot style model (ADR 0006).

The spec asks this record to settle five things: the theme document, how theme values reach components (including a preview scoped to part of the page, the question ADR 0002 left open), how dark values are derived, the draft and publish model, and the API. ADRs 0003, 0004, 0006, 0008 and 0009 are frozen; this record extends them and changes none.

## Decision

### 1. The theme document

```json
{
  "formatVersion": 1,
  "colors": {
    "primary": { "light": "#0F766E" },
    "sidebar": { "light": "#F9FAFB", "dark": "#15181D" }
  },
  "radius": 12,
  "textSize": 15,
  "density": "compact",
  "components": {
    "button": { "root": { "background": { "token": "success" } } },
    "text-field": { "control": { "radius": "full" } }
  }
}
```

| Key | Meaning |
| --- | --- |
| `formatVersion` | Integer, the only version marker. This build reads 1. |
| `colors` | Up to seven roles: `primary`, `destructive`, `success`, `warning`, `info`, `background`, `sidebar`. Each is `{ light?, dark? }`, each `"#RRGGBB"`. No alpha: a theme colour fills surfaces and is measured for contrast. |
| `radius` | The base radius in pixels, 0 to 16. The built-in look is 8. |
| `textSize` | The base UI text size in pixels, 13 to 16. The built-in look is 14. |
| `density` | `compact`, `regular` or `comfortable`. The built-in look is `regular`. |
| `components` | Component type to slot to a slot style: exactly ADR 0006's typed properties. |

**Sparse, like a form (ADR 0003, D5).** A key is present only when the theme changes something, and empty objects are left out. The empty theme, `{ "formatVersion": 1 }`, is the built-in look: Shesha blue and Inter. The built-in values live in `tokens.css` and nowhere else; a theme never repeats them.

**Constrained.** Every control has a small range, so a theme cannot break the layout: a radius of 0 to 16 px, four text sizes, three densities. The typeface stays Inter.

**Who checks what.** As for forms. The server checks the structure: the format version, that every colour is `#RRGGBB`, that roles, keys and values are known and in range, that slot styles are ADR 0006's, and the limits (200 component types, 50 slots each, names of 1 to 64 characters from `A-Z a-z 0-9 _ -`). It never knows component types: an unknown type is stored, returned untouched, ignored by the renderer and flagged in the editor, with a way to remove it. A slot a component does not have is treated the same way. The client ignores what it cannot use and never fails on it. A theme in another format version is stored by the server as it was sent; this build reads nothing of it, shows the built-in look, and the editor says it cannot edit it.

The structure is defined in `crates/contracts/src/themes.rs` and generated to TypeScript, with the limits as constants.

### 2. How theme values reach components

**The chain.** `tokens.css` stays the single source of design values (ADR 0002). Every system token a theme can change reads a theme property first and falls back to its built-in value:

```css
--sys-color-primary: var(--theme-primary, var(--ref-blue-600)); /* light */
--sys-color-primary: var(--theme-dark-primary, var(--ref-blue-400)); /* .dark */
--sys-radius-base: var(--theme-radius-base, 0.5rem);
--sys-text-scale: var(--theme-text-scale, 1);
--sys-space-unit: var(--theme-space-unit, 0.25rem);
```

`web/src/theme/variables.ts` is the one place a theme document becomes CSS: it turns a document into these `--theme-*` properties, as `styles.ts` is the one place a slot style becomes CSS (ADR 0006). Light and dark values are separate properties, so the `dark` class keeps choosing the scheme as it always has, and a theme carries both schemes at once.

**What each control changes.**

| Control | Changes |
| --- | --- |
| A colour role | Its token, and the tokens that sit on it: primary sets primary, its hover and the text on it; the focus ring follows primary. Background sets the page and its text; sidebar sets the sidebar, its text, its current-item fill and its border |
| Roundness | `--sys-radius-base`. The scale is derived from it (ADR 0002), so every step follows |
| Text size | `--sys-text-scale`, which multiplies every step of the type scale, sizes and line heights together |
| Density | `--sys-space-unit`: 3.5, 4 or 4.5 px. Every gap, padding and control height is a multiple of it |

**The whole app, the same way.** The published theme's properties are set on `<html>`, so the shell, the designer, the theme editor's own controls and every form follow it, with no component knowing.

**Overrides stay relative.** A slot style names a step (`"radius": "full"`, `"padding": "md"`), never a length (ADR 0006). A step resolves through the scale, so it keeps its place when the base changes: Large stays large, Full stays full.

**Component defaults, merged as data.** ADR 0006 planned the order `definition ← theme ← instance`. The definition's look is its shadcn classes; the theme's defaults and the instance's overrides are both slot styles. The runtime's hosts (`forms/runtime/hosts.tsx`), which already hand every renderer its slots, merge the theme's defaults for the component's type under the instance's own, property by property (`withThemeStyles`), and the result is written onto the element as before. One property merged by itself: an instance that sets a slot's colour keeps the theme's radius for it. The theme's defaults reach the hosts through a React context (`ThemeStylesContext`), so a theme change re-renders forms without their documents being read again. Components are unchanged; the component contract (ADR 0004) is unchanged.

**A preview scoped to part of the page (the open question of ADR 0002).** Custom properties inherit, but a system token is resolved where it is declared: on `<html>`. Setting `--theme-primary` on an element further down would change nothing below it, because `--sys-color-primary` was already worked out above. So the system token blocks of `tokens.css`, and shadcn's bindings in `theme.css`, are declared on `[data-theme-scope]` too. A theme scope (`theme/scope.tsx`) is an element with that attribute and the draft's `--theme-*` properties in its `style`; every token is worked out again inside it from the draft. Two details make it exact:

- **Nothing of the page shows through.** A scope sets every theme property: to its value, or to `initial` where the draft sets nothing. `initial` makes the `var()` fall back to the built-in value, so a published teal does not leak into a draft that went back to the default.
- **The scope chooses its scheme.** Its value is `light` or `dark`. `[data-theme-scope="dark"]` takes the dark token block, and the `dark:` variant applies inside a dark scope and not inside a light one, whatever the page uses. The preview shows light or dark at the press of a switch, without touching the page.

The theme editor's preview is such a scope; the rest of the page, the editor's own controls included, keeps the published theme.

**No flash.** The server writes the published theme into `index.html`, in place of `null` in `<script type="application/json" id="published-theme">null</script>`, escaped so it cannot close the element. An inline script after it, built at build time from `src/theme/boot.ts` with the same `variables.ts` the app uses, sets the properties on `<html>` before the first paint, as the dark-mode script already does. The app then reads the same record as its first value and keeps it in step: at once after a publish in this tab, and from the server when the window is looked at again. The build fails if `index.html` ever loses the marker. On the Vite dev server, which does not write the theme, the built-in look shows until the app has fetched it.

### 3. Dark values

A colour role has a light and a dark value. A dark value that is not set is **derived** from the light one: the same OKLCH hue, at the lightness of ADR 0002's dark brand blue (L 0.715) or more, with the chroma kept up to its 0.148. That is how ADR 0002 made the dark primary, now a rule. The page background and the sidebar become near-neutral dark surfaces at the built-in lightness, with a trace of the hue. A dark value set by hand is kept, and reset returns the role to deriving.

The editor shows each value with where it comes from: set, "From light" (derived) or "Built-in", with the value itself.

**Contrast.** Text on a themed fill is chosen, not set: white where white reaches 4.5:1, otherwise the better of white and a dark tint of the same hue. The sidebar's text is the built-in one or, where that would not read, the strongest. What cannot be chosen is a themed colour used as text on the page (a link, a warning) and muted text on a themed background; where those stay under 4.5:1 (a very light primary in light mode), the editor says so in words, with the ratio and what uses the colour. Contrast is measured with WCAG's formula on the hex values; `BUILT_IN` in `variables.ts` holds the built-in colours as hex, and a test reads `tokens.css` and fails if they ever differ.

### 4. Draft and publish

A theme change affects everyone, so editing makes a draft.

- **One theme.** One row holds the published document and the draft, each with a revision and a time.
- **The draft is saved** shortly after each change, stating the revision it was based on, by the same `Autosave` as the designer (made generic over the document type). A 409 stops saving for good, says so, and offers a reload; nothing is overwritten. Leaving the page sends what is waiting.
- **Undo and redo** cover every change, with ADR 0009's runs: a hex colour typed, or a slider dragged, is one step, kept or taken back when its field is left. The editing model (`theme/editor/model.ts`) is pure, like the designer's, and its history is a list of whole documents.
- **Publish** makes the draft the published theme. What is on screen is saved first. **Discard** returns the draft to the published theme, as one more step that can be undone. **Reset to default** makes a draft of the built-in look, which still needs publishing.
- The editor always shows whether the draft differs from the published theme, compared as values.

### 5. The API

All under `/api`, with the standard error shape and `details` (ADR 0007). Bodies are read by hand, as for forms, so every failure has the standard shape.

| Route | Does | Answers |
| --- | --- | --- |
| `GET /api/theme` | The published theme | 200 `ThemeRecord { revision, updatedAt, document }` |
| `GET /api/theme/draft` | The draft and the published theme | 200 `ThemeState { published, draft, unpublished }` |
| `PUT /api/theme/draft` | Saves the draft: `{ revision, document }` | 200 `ThemeState`; 409 `revision_conflict` when `revision` is not the draft's; 400 `invalid_theme` with `details` |
| `POST /api/theme/publish` | The draft becomes the published theme: `{ revision }`, the draft's | 200 `ThemeState`; 409 when stale. Publishing a draft equal to the published theme changes nothing |
| `POST /api/theme/discard` | The draft becomes the published theme again: `{ revision }` | 200 `ThemeState`; 409 when stale. Nothing changes when they are already equal |

The revision check and the write are one SQL statement, so two writers cannot both win. Documents are stored as sent and returned untouched. `--demo` resets the database, and with it the theme to empty. `invalid_theme` says "The theme has 1 problem." or "The theme has N problems." and lists each with its path, such as `colors.primary.light` or `components.button.root.background`.

### 6. The designer shows where a value comes from

In the instance's Appearance editor, every style property says where its value comes from, in words beside its label: "Set here", "From the theme" or "Default", with the inherited value in the editor itself ("From the theme: Success"). The words have an id the editor is described by, so a screen reader hears them; they are never only a colour or an icon. Resetting a property brings back the theme's value. The theme editor uses the same Appearance editor, with "Set in the theme" and "Component default".

This uses ADR 0009's `defaults` prop as planned. Two optional fields are added to it, so the frozen props are extended, not changed: `fallbackLabel`, what an unset value is called where the theme says nothing about it, and `setLabel`. The colour picker gains optional `choices` (the theme editor offers a palette of plain colours for a role, where an instance offers the theme's roles) and `inheritedValue` (the swatch shows the inherited colour).

## Alternatives considered

- **A theme as a set of token values** (every system token, stored in full). Simple to apply, but every theme would repeat the built-in look, a change to the built-in look would never reach a saved theme, and nothing would stop a theme that breaks contrast or layout. A few constrained controls that derive the tokens are easier to get right and to read.
- **Generating a stylesheet from the theme** (`:root { … }` served as CSS). It works for the published theme, but not for the preview, and a stylesheet is a second source of values. Custom properties on an element do both, through one function.
- **The preview in an iframe.** Real isolation, but a second document to boot, its own copy of the app, focus and pointing across frames, and a slower preview. Redeclaring the system tokens on a scope is a few lines of CSS.
- **Applying the published theme from JavaScript after load.** The built-in look would flash first. Writing the theme into the page costs one database read per page load, which is small next to everything else the page asks for.
- **Free colour for derived dark values.** Inverting lightness, or picking from a fixed palette, either changes the hue or ignores the brand. Keeping the hue and fixing the lightness at the brand blue's is the rule ADR 0002 already used.
- **Component defaults as classes or variables per component** (the current Shesha's per-component styling). That is the override layer ADR 0006 rejected. Theme defaults are slot styles, merged as data, written once.
- **Named themes.** Out of scope for v1; the routes leave room for `/api/themes/{id}` later.

## Which later phase this serves

| Decision | Serves |
| --- | --- |
| A sparse, constrained document | Phase 7: a proof app themed to a client's brand in a few minutes |
| Theme scopes | A future theme per form or per tenant: a form rendered inside a scope takes that theme |
| Merging in the hosts, as data | Phase 6: a script that changes an instance's style goes through the same merge |
| Draft and publish with revisions | Every later settings page: the same model and the same autosave |

## Consequences

- Frozen after this phase, changeable only through a new ADR: the theme document format; the merge order `definition ← theme ← instance`, property by property, and how an inherited value and its source are shown; the draft and publish model and the theme API.
- A system token a theme should change reads a `--theme-*` property in `tokens.css`, and `variables.ts` sets it. `THEME_VARIABLES` lists them all; a test fails if `tokens.css` does not read one.
- A token block added to `tokens.css` must be declared on `[data-theme-scope]` as well as on the page, or a preview will not follow it.
- `index.html` must keep the published-theme marker on one line; the build checks it.
- Adding a colour role, a control or a density step changes the document format: it needs an ADR.
