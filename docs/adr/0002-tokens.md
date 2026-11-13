# ADR 0002: Design tokens

- Status: accepted
- Date: 12 November 2026
- Phase: 0

## Context

Themes are a core Shesha concept, so design values must be data, not literals scattered through components. The Phase 0 spec fixes two brand values (primary `#003BB2` and the Inter typeface) and asks for everything else to follow current practice, starting from shadcn/ui's defaults rather than from Ant Design or the current Shesha.

## Decision

### One file holds every raw value

`web/src/styles/tokens.css` is the single source of design values. The chain is:

```
tokens.css  →  theme.css  →  components
raw values     bindings      Tailwind utilities only
```

- **`tokens.css`** is the only file with raw colours, sizes, shadows and durations.
- **`theme.css`** contains no raw values. It binds shadcn/ui's variables (`--primary`, `--border`, `--radius`, …) and the Tailwind theme (`--color-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--spacing`) to tokens with `var()`.
- **Components** use Tailwind utilities, which resolve to tokens. They contain no hex, `rgb()`, `oklch()`, pixel or rem literals, no arbitrary values carrying such literals, and no inline styles.

### Two tiers

| Tier | Prefix | Holds | Changes with light/dark |
| --- | --- | --- | --- |
| Reference | `--ref-*` | The palette: brand blue 50–950, neutrals 0–950, red, translucent black and white | No |
| System | `--sys-*` | The decisions components consume | Colours yes (redefined under `.dark`); type, space, radius, shadow, motion and layout no |

A theme changes system tokens (which palette step is "primary", how round the base radius is). Components never read reference tokens directly.

### Tailwind's default scales are cleared

`theme.css` resets Tailwind's default colour, font, type, weight, tracking, leading, radius, shadow, blur and easing scales (`--color-*: initial`, …) and redefines only the steps that exist as tokens. A class such as `bg-red-500` or `shadow-2xl` therefore generates nothing: reaching for a value outside the tokens fails visibly instead of quietly adding a second source of truth.

Breakpoints and container widths stay on Tailwind's defaults, because media queries cannot read CSS variables. The `md` breakpoint (768px) is where the sidebar collapses.

### What counts as "tokens only" in a component

- Allowed: Tailwind utilities on the token-backed scales (`p-4`, `text-sm`, `rounded-lg`, `bg-primary`, `shadow-xs`), hairlines (`border`, `h-px`), and fractions or keywords (`w-full`, `size-4`).
- Not allowed: raw colours, arbitrary values with literal sizes or colours (`w-[220px]`, `text-[#333]`), inline `style` with literals, `!important`, and Tailwind's important modifier. CI's style guard enforces the last two.

## Design choices

These are the values chosen in Phase 0. All are in `tokens.css` and can be reviewed live in the "Design tokens" card on Home.

**Colour**

| Role | Light | Dark |
| --- | --- | --- |
| Primary | `#003BB2` (fixed brand value; 9.3:1 on white) | `oklch(0.715 0.148 262.4)` ≈ `#70A1FF` |
| Text on primary | white | blue-950 ≈ `#04153C` (7.0:1 on the dark primary) |
| Primary hover | blue-700 ≈ `#002F96` | blue-300 ≈ `#A0C1FF` |
| Page background | white | neutral-950 ≈ `#080A0E` |
| Card | white with a hairline border | neutral-900 ≈ `#15181D` |
| Sidebar | neutral-50 ≈ `#F9FAFB` | neutral-900 |
| Muted text | neutral-500 (4.8:1 or better on white) | neutral-400 (6.9:1 on cards) |
| Border | neutral-200 | white at 10% |
| Control border | neutral-300 | white at 15% |
| Focus ring | `#003BB2` | the dark primary |

- **Dark-mode primary.** `#003BB2` reaches only 2.1:1 against the dark background, too low for a button edge, a link or a focus ring. Dark mode uses a lighter tint of the same OKLCH hue (262.4°), `oklch(0.715 0.148 262.4)`, which reaches 7.8:1 on the background and 7.0:1 on cards, with dark text on top.
- **Blue ramp.** Step 600 is the brand hex exactly; the other ten steps keep its hue and vary lightness and chroma in OKLCH, so tints look like the same blue.
- **Neutrals** carry a very slight tint towards the brand hue (chroma 0.002–0.016), which sits better beside the blue than pure grey.

**Type**

- Inter (variable font, weights 100–900), self-hosted from the `@fontsource-variable/inter` package and bundled into the binary. The `@font-face` rules are our own so the family is named plain `Inter`; seven Unicode subsets are included and each loads only when used.
- Scale (size / line height): xs 12/16, sm 14/20, base 16/24, lg 18/28, xl 20/28, 2xl 24/32, 3xl 30/36. **14px is the UI default**; page titles are 24px semibold with tight tracking (−0.015em).
- Weights: 400, 500, 600. Monospace (the commit id) uses the system monospace stack.

**Spacing.** One unit, 4px (`--sys-space-unit`). Every gap, padding and control height is a multiple. Controls are 32px tall, which suits a dense builder UI.

**Radius.** One base value, 8px (`--sys-radius-base`), with the scale derived from it: sm 4, md 6, lg 8 (controls), xl 12 (cards), 2xl 16. Changing the base re-rounds the whole app.

**Shadows.** Four soft, layered steps (xs, sm, md, lg) tinted with `--sys-shadow-color`. Dark mode multiplies their strength by three and relies mainly on borders, because shadows read weakly on dark surfaces. Cards and controls use xs; the mobile sidebar overlay uses lg.

**Focus.** One indicator for the whole app, set once in the base stylesheet: a 2px solid ring in the focus colour, offset 2px from the element (flush on text inputs). Components do not restyle or remove it. This replaces shadcn's default translucent 3px halo, whose contrast is weaker.

**Dark mode.** Applied by a `dark` class on `<html>`. Light is the default on a first visit regardless of the operating system's preference; the choice is stored in `localStorage` and applied by a small inline script before first paint, so a dark reload never flashes light.

**Motion.** 150ms for colour changes, 200ms for the sidebar overlay, one easing curve.

## Consequences

- Adding a value means adding a token first. That is deliberate friction.
- shadcn components added later arrive with shadcn's default classes; any raw or non-token value in them (a palette colour, an arbitrary size) must be moved to tokens when the component is added. Several were fixed this way in Phase 0 (see the report).
- System tokens are resolved on `<html>`, where the `dark` class lives. Scoping a theme to a subtree would need the derived tokens redeclared at that scope; that is a question for the Themes phase.
- There is no automated guard yet for raw values in components (only for `!important`); it is listed as deferred in the Phase 0 report.
