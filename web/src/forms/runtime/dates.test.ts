import { afterEach, describe, expect, it, vi } from "vitest"

import {
  formatDate,
  isIsoDate,
  isoFromLocalDate,
  localDateFromIso,
  parseDateText,
  parseIsoDate,
  toIsoDate,
} from "./dates"

describe("ISO dates", () => {
  it("accepts real calendar dates only", () => {
    for (const good of ["1990-03-14", "2024-02-29", "2000-02-29", "0001-01-01", "9999-12-31"]) {
      expect(isIsoDate(good), good).toBe(true)
    }
    for (const bad of [
      "1990-3-14",
      "14/03/1990",
      "2023-02-29",
      "1900-02-29",
      "2024-13-01",
      "2024-00-10",
      "2024-04-31",
      "0000-01-01",
      "1990-03-14T00:00:00Z",
      "",
      null,
      19900314,
    ]) {
      expect(isIsoDate(bad), String(bad)).toBe(false)
    }
  })

  it("splits and joins without losing anything", () => {
    expect(parseIsoDate("1990-03-04")).toEqual({ year: 1990, month: 3, day: 4 })
    expect(toIsoDate({ year: 1990, month: 3, day: 4 })).toBe("1990-03-04")
    expect(toIsoDate({ year: 33, month: 1, day: 1 })).toBe("0033-01-01")
    expect(toIsoDate({ year: 2023, month: 2, day: 30 })).toBeNull()
  })

  it("formats a date for people", () => {
    expect(formatDate("1990-03-14")).toBe("14 March 1990")
    expect(formatDate("2026-11-01")).toBe("1 November 2026")
    expect(formatDate("not a date")).toBe("not a date")
  })
})

describe("typed dates", () => {
  it.each([
    ["1990-03-14", "1990-03-14"],
    ["  1990-03-14 ", "1990-03-14"],
    ["14 March 1990", "1990-03-14"],
    ["14 Mar 1990", "1990-03-14"],
    ["14 mar. 1990", "1990-03-14"],
    ["4 SEPT 2001", "2001-09-04"],
    ["1 january, 2000", "2000-01-01"],
    ["29 Feb 2024", "2024-02-29"],
  ])("reads %j as %s", (text, expected) => {
    expect(parseDateText(text)).toBe(expected)
  })

  it.each([
    "",
    "tomorrow",
    "14/03/1990",
    "03/14/1990",
    "14-03-1990",
    "1990-02-30",
    "31 June 2020",
    "29 Feb 2023",
    "14 Ma 1990",
    "14 Marchember 1990",
    "March 14 1990",
    "14 March 90",
  ])("does not guess at %j", (text) => {
    expect(parseDateText(text)).toBeNull()
  })

  it("reads back what formatDate writes", () => {
    for (const iso of ["1990-03-14", "2024-02-29", "1899-12-31", "2026-11-13"]) {
      expect(parseDateText(formatDate(iso))).toBe(iso)
    }
  })
})

describe("dates and time zones", () => {
  // Node re-reads TZ whenever it is assigned, so each case runs in its zone.
  afterEach(() => vi.unstubAllEnvs())

  it.each(["Etc/GMT+8", "Etc/GMT-12", "Pacific/Kiritimati", "Pacific/Niue", "UTC"])(
    "a day stays the same day through a local Date in %s",
    (timeZone) => {
      vi.stubEnv("TZ", timeZone)

      for (const iso of ["1990-03-14", "2024-02-29", "2026-01-01", "2026-12-31", "0099-06-15"]) {
        const local = localDateFromIso(iso) ?? new Date(Number.NaN)
        expect(local.getHours(), iso).toBe(0)
        expect(isoFromLocalDate(local), iso).toBe(iso)
      }
    },
  )

  it("reads the local day of a Date, not its UTC day", () => {
    vi.stubEnv("TZ", "Etc/GMT-12")
    // 13 November in UTC is already 14 November twelve hours ahead.
    const instant = new Date("2026-11-13T20:00:00Z")

    expect(isoFromLocalDate(instant)).toBe("2026-11-14")
    expect(instant.toISOString().slice(0, 10)).toBe("2026-11-13")
  })

  it("returns null for something that is not a date", () => {
    expect(localDateFromIso("2023-02-30")).toBeNull()
  })
})
