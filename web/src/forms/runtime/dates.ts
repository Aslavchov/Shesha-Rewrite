/**
 * Calendar dates. A date value is the string "YYYY-MM-DD": a day on the
 * calendar, not a moment in time. Nothing here goes through UTC, so the same
 * day is the same string in every time zone (ADR 0005).
 */

export type DateParts = { year: number; month: number; day: number }

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return leap ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function isRealDate({ year, month, day }: DateParts): boolean {
  return (
    year >= 1 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  )
}

const pad = (value: number, width: number) => String(value).padStart(width, "0")

/** "YYYY-MM-DD" for a real calendar date, otherwise null. */
export function toIsoDate(parts: DateParts): string | null {
  return isRealDate(parts)
    ? `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`
    : null
}

/** The parts of a "YYYY-MM-DD" string naming a real date, otherwise null. */
export function parseIsoDate(text: string): DateParts | null {
  const match = ISO_DATE.exec(text)
  if (!match) return null
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  return isRealDate(parts) ? parts : null
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && parseIsoDate(value) !== null
}

/** A date for people to read: "14 March 1990". */
export function formatDate(iso: string): string {
  const parts = parseIsoDate(iso)
  if (!parts) return iso
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`
}

const DAY_MONTH_YEAR = /^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})$/i

/**
 * Reads a date a person typed. Two unambiguous forms are accepted:
 * "1990-03-14" and "14 March 1990" (the month may be shortened to three
 * letters or more). Anything else, or a day that does not exist, is null.
 */
export function parseDateText(text: string): string | null {
  const trimmed = text.trim()
  const iso = parseIsoDate(trimmed)
  if (iso) return toIsoDate(iso)

  const match = DAY_MONTH_YEAR.exec(trimmed)
  if (!match) return null
  const name = match[2].toLowerCase()
  const month = MONTHS.findIndex((candidate) => candidate.toLowerCase().startsWith(name)) + 1
  if (month === 0) return null
  return toIsoDate({ year: Number(match[3]), month, day: Number(match[1]) })
}

/** The local-time `Date` at the start of that day, for calendar widgets. */
export function localDateFromIso(iso: string): Date | null {
  const parts = parseIsoDate(iso)
  if (!parts) return null
  const date = new Date(2000, parts.month - 1, parts.day)
  // The constructor reads years 0 to 99 as 1900 to 1999; setFullYear does not.
  date.setFullYear(parts.year)
  return date
}

/** The calendar day a local-time `Date` falls on. */
export function isoFromLocalDate(date: Date): string | null {
  return toIsoDate({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
}
