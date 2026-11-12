import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

import { toggleTheme } from "./theme"
import { useTheme } from "./use-theme"

export function ThemeToggle() {
  const theme = useTheme()
  const isDark = theme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      data-testid="theme-toggle"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggleTheme}
    >
      {isDark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
    </Button>
  )
}
