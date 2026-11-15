import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { build, type Plugin } from "vite"
import { defineConfig } from "vitest/config"

import { THEME_STORAGE_KEY } from "./src/app/theme/storage-key.ts"
import { APP_NAME } from "./src/generated/app.ts"

// The Rust server the dev server proxies /api to (see scripts/dev.mjs).
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:7400"

const alias = { "@": path.resolve(import.meta.dirname, "./src") }

/**
 * The script that applies the published theme before first paint, built from
 * src/theme/boot.ts into one self-contained classic script (ADR 0010). It is
 * the same code the app uses, so the two can never disagree about a colour.
 */
async function themeBootScript(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    resolve: { alias },
    build: {
      write: false,
      lib: {
        entry: path.resolve(import.meta.dirname, "./src/theme/boot.ts"),
        formats: ["iife"],
        name: "themeBoot",
      },
    },
  })
  const [output] = Array.isArray(result) ? result : [result]
  if (!("output" in output)) throw new Error("The theme boot script was not built.")
  const code = output.output[0].code.trim()
  if (code.includes("</script")) throw new Error("The theme boot script cannot be inlined.")
  return code
}

/**
 * Where the server writes the published theme into the page. It looks for
 * exactly this text (crates/server/src/assets.rs), so the build fails if the
 * page ever loses it, to a formatter or an edit.
 */
const PUBLISHED_THEME_MARKER = '<script type="application/json" id="published-theme">null</script>'

/** Replaces %NAME% placeholders in index.html, so shared constants live in one place. */
function htmlConstants(constants: Record<string, string>): Plugin {
  return {
    name: "html-constants",
    async transformIndexHtml(html) {
      if (!html.includes(PUBLISHED_THEME_MARKER)) {
        throw new Error(`index.html must hold ${PUBLISHED_THEME_MARKER} on one line.`)
      }
      const values: Record<string, string> = { ...constants, THEME_BOOT: await themeBootScript() }
      return html.replace(
        /%([A-Z_]+)%/g,
        (placeholder, name: string) => values[name] ?? placeholder,
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), htmlConstants({ APP_NAME, THEME_STORAGE_KEY })],
  resolve: { alias },
  server: {
    proxy: { "/api": API_ORIGIN },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    // Tests see stylesheets as empty, except the tokens: one test reads them
    // to check that the token names used in TypeScript exist.
    css: { include: [/styles\/tokens\.css/] },
  },
})
