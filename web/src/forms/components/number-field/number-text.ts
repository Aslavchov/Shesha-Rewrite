/**
 * A number as the text a person types and reads: digits with an optional
 * sign and an optional decimal point. Nothing else is a number here: no
 * decimal comma, no thousands separators, no exponent, no "Infinity".
 */

const NUMBER_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)$/

/** The number `text` stands for, or null if it cannot be read as one. */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim()
  if (!NUMBER_TEXT.test(trimmed)) return null
  const value = Number(trimmed)
  // Too many digits to hold is not a value either. "-0" is plain zero.
  if (!Number.isFinite(value)) return null
  return value === 0 ? 0 : value
}

const EXPONENT_FORM = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/

/**
 * The number as text that `parseNumber` reads back to the same number.
 * `String` writes very large and very small numbers with an exponent
 * ("1e-7"); those are written out in full instead ("0.0000001").
 */
export function formatNumber(value: number): string {
  const text = String(value)
  const parts = EXPONENT_FORM.exec(text)
  if (!parts) return text

  const [, sign = "", lead = "", fraction = "", exponent = "0"] = parts
  const digits = lead + fraction
  // How many of the digits come before the decimal point.
  const whole = 1 + Number(exponent)
  if (whole <= 0) return `${sign}0.${"0".repeat(-whole)}${digits}`
  return `${sign}${digits.padEnd(whole, "0")}`
}
