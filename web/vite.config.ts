import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"

import { THEME_STORAGE_KEY } from "./src/app/theme/storage-key.ts"
import { APP_NAME } from "./src/generated/app.ts"

// The Rust server the dev server proxies /api to (see scripts/dev.mjs).
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:7400"

/** Replaces %NAME% placeholders in index.html, so shared constants live in one place. */
function htmlConstants(constants: Record<string, string>): Plugin {
  return {
    name: "html-constants",
    transformIndexHtml: (html) =>
      html.replace(/%([A-Z_]+)%/g, (placeholder, name: string) => constants[name] ?? placeholder),
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), htmlConstants({ APP_NAME, THEME_STORAGE_KEY })],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
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
