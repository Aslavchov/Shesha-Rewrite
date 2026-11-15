/**
 * Colour arithmetic for themes (ADR 0010): hex to OKLCH and back, and WCAG
 * contrast. Plain functions with no imports, because the same code runs in
 * the small script that applies the published theme before first paint.
 */

export type Oklch = { readonly l: number; readonly c: number; readonly h: number }

type Rgb = readonly [number, number, number]

const HEX = /^#[0-9a-f]{6}$/i

/** Whether the text is a colour a theme may hold: `#RRGGBB`. */
export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value)
}

function parse(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

const toGamma = (channel: number) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055

/** Linear sRGB to OKLab (Björn Ottosson's matrices). */
function linearToOklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function oklabToLinear([lightness, a, b]: Rgb): Rgb {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export function toOklch(hex: string): Oklch {
  const [r, g, b] = parse(hex)
  const [l, a, bb] = linearToOklab([toLinear(r), toLinear(g), toLinear(b)])
  const c = Math.hypot(a, bb)
  const h = (Math.atan2(bb, a) * 180) / Math.PI
  return { l, c, h: h < 0 ? h + 360 : h }
}

function oklchToLinear({ l, c, h }: Oklch): Rgb {
  const angle = (h * Math.PI) / 180
  return oklabToLinear([l, c * Math.cos(angle), c * Math.sin(angle)])
}

const IN_GAMUT_SLACK = 0.0001
const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -IN_GAMUT_SLACK && v <= 1 + IN_GAMUT_SLACK)

/**
 * The sRGB colour nearest to an OKLCH one, as `#rrggbb`. A colour outside
 * what a screen shows keeps its lightness and hue and gives up chroma.
 */
export function toHex(colour: Oklch): string {
  const l = Math.min(1, Math.max(0, colour.l))
  let rgb = oklchToLinear({ ...colour, l })
  if (!inGamut(rgb)) {
    let low = 0
    let high = colour.c
    for (let step = 0; step < 20; step++) {
      const middle = (low + high) / 2
      if (inGamut(oklchToLinear({ l, c: middle, h: colour.h }))) low = middle
      else high = middle
    }
    rgb = oklchToLinear({ l, c: low, h: colour.h })
  }
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, value))))) * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = parse(hex)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(one: string, other: string): number {
  const a = luminance(one)
  const b = luminance(other)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Part of the way from one colour to another, through OKLab, as `#rrggbb`. */
export function mix(from: string, to: string, amount: number): string {
  const a = toOklab(from)
  const b = toOklab(to)
  const lab: Rgb = [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]
  const c = Math.hypot(lab[1], lab[2])
  const h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI
  return toHex({ l: lab[0], c, h: h < 0 ? h + 360 : h })
}

function toOklab(hex: string): Rgb {
  const [r, g, b] = parse(hex)
  return linearToOklab([toLinear(r), toLinear(g), toLinear(b)])
}
