import { Calendar } from "@/components/ui/calendar"

import { isoFromLocalDate, localDateFromIso, toIsoDate } from "../../runtime/dates"

/** How far the month and year dropdowns reach when no limit is set. */
const YEARS_BACK = 120
const YEARS_AHEAD = 20

/**
 * The months the calendar can show, as the first and last day it reaches.
 * A limit that is set is the bound. One that is not set gets a bound wide
 * enough for a date of birth, and for the current value if it lies further out.
 */
function reach(value: string | null, minDate: string | null, maxDate: string | null) {
  const year = new Date().getFullYear()
  const back = toIsoDate({ year: year - YEARS_BACK, month: 1, day: 1 })
  const ahead = toIsoDate({ year: year + YEARS_AHEAD, month: 12, day: 31 })
  // "YYYY-MM-DD" strings sort in date order, so dates compare as text.
  const first = minDate ?? (value !== null && back !== null && value < back ? value : back)
  const last = maxDate ?? (value !== null && ahead !== null && value > ahead ? value : ahead)
  return {
    first: first === null ? undefined : (localDateFromIso(first) ?? undefined),
    last: last === null ? undefined : (localDateFromIso(last) ?? undefined),
  }
}

/**
 * The calendar a date is picked from. It works in local `Date` objects, as
 * react-day-picker does; the value crosses that boundary only through
 * `localDateFromIso` and `isoFromLocalDate`, so the day picked is the day
 * stored, in every time zone.
 */
export function DateCalendar({
  value,
  minDate,
  maxDate,
  onChoose,
}: {
  value: string | null
  minDate: string | null
  maxDate: string | null
  onChoose: (value: string) => void
}) {
  const selected = value === null ? undefined : (localDateFromIso(value) ?? undefined)
  const earliest = minDate === null ? null : localDateFromIso(minDate)
  const latest = maxDate === null ? null : localDateFromIso(maxDate)
  const { first, last } = reach(value, minDate, maxDate)

  return (
    <Calendar
      mode="single"
      // Picking the selected day again confirms it; clearing is done in the text.
      required
      selected={selected}
      onSelect={(date) => {
        const picked = isoFromLocalDate(date)
        if (picked !== null) onChoose(picked)
      }}
      // Opens on the selected day's month, or today's, with that day focused.
      defaultMonth={selected}
      autoFocus
      captionLayout="dropdown"
      startMonth={first}
      endMonth={last}
      disabled={[
        ...(earliest === null ? [] : [{ before: earliest }]),
        ...(latest === null ? [] : [{ after: latest }]),
      ]}
    />
  )
}
