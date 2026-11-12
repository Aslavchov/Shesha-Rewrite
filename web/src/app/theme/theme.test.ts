import { describe, expect, it, vi } from "vitest"

import { THEME_STORAGE_KEY } from "./storage-key"
import { getTheme, initTheme, setTheme, subscribeToTheme, toggleTheme } from "./theme"

const isDarkClassSet = () => document.documentElement.classList.contains("dark")

describe("theme", () => {
  it("is light on a first visit", () => {
    initTheme()

    expect(getTheme()).toBe("light")
    expect(isDarkClassSet()).toBe(false)
  })

  it("restores a stored dark theme", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark")

    initTheme()

    expect(getTheme()).toBe("dark")
    expect(isDarkClassSet()).toBe(true)
  })

  it("treats an unrecognised stored value as light", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia")

    initTheme()

    expect(getTheme()).toBe("light")
  })

  it("toggles the dark class on <html> and stores the choice", () => {
    initTheme()

    toggleTheme()
    expect(isDarkClassSet()).toBe(true)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")

    toggleTheme()
    expect(isDarkClassSet()).toBe(false)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light")
  })

  it("notifies subscribers, and stops after they unsubscribe", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToTheme(listener)

    setTheme("dark")
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setTheme("light")
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("follows a theme change made in another tab", () => {
    const unsubscribe = subscribeToTheme(() => {})
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark")

    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }))

    expect(getTheme()).toBe("dark")
    unsubscribe()
  })

  it("still switches theme when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled")
    })

    setTheme("dark")

    expect(getTheme()).toBe("dark")
  })
})
