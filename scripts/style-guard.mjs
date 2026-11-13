#!/usr/bin/env node
// Style guard: fails if anything under web/src forces a style to win.
//
//   node scripts/style-guard.mjs [directory]
//
// Two things are banned (CLAUDE.md, "Styling"):
//   1. `!important` in CSS, or in any string in TypeScript/TSX.
//   2. Tailwind's important modifier on a class: `p-4!` or the older `!p-4`,
//      with or without variants (`hover:p-4!`), in class strings and @apply.
//
// The fix is never a stronger override: edit the component in
// web/src/components/ui or the token it reads, so the conflict goes away.
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const STYLE_EXTENSIONS = new Set([".css"])
const SCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"])

const IMPORTANT_DECLARATION = /!\s*important\b/gi
const TAILWIND_IMPORTANT_IMPORT = /@import\s[^;]*["')\s]important\s*;/g

/**
 * Find violations in one file's source.
 * @returns {{ line: number, rule: "important" | "tailwind-important", text: string }[]}
 */
export function findViolations(source, fileName) {
  const extension = path.extname(fileName)
  if (STYLE_EXTENSIONS.has(extension)) return checkCss(source)
  if (SCRIPT_EXTENSIONS.has(extension)) return checkScript(source)
  return []
}

function checkCss(source) {
  const code = blankOut(source, /\/\*[\s\S]*?\*\//g)
  const violations = []

  for (const match of code.matchAll(IMPORTANT_DECLARATION)) {
    violations.push({ line: lineOf(code, match.index), rule: "important", text: match[0] })
  }
  for (const match of code.matchAll(TAILWIND_IMPORTANT_IMPORT)) {
    violations.push({
      line: lineOf(code, match.index),
      rule: "tailwind-important",
      text: match[0].trim(),
    })
  }
  for (const match of code.matchAll(/@apply\s([^;}]*)/g)) {
    const classesStart = match.index + match[0].length - match[1].length
    violations.push(...checkClassList(match[1], lineOf(code, classesStart)))
  }
  return violations
}

function checkScript(source) {
  const violations = []
  for (const literal of stringLiterals(source)) {
    for (const match of literal.text.matchAll(IMPORTANT_DECLARATION)) {
      violations.push({ line: literal.line, rule: "important", text: match[0] })
    }
    violations.push(...checkClassList(literal.text, literal.line))
  }
  return violations
}

/** Flag every class in a whitespace-separated list that carries the important modifier. */
function checkClassList(text, firstLine) {
  const violations = []
  for (const match of text.matchAll(/\S+/g)) {
    if (hasImportantModifier(match[0])) {
      violations.push({
        line: firstLine + lineOf(text, match.index) - 1,
        rule: "tailwind-important",
        text: match[0],
      })
    }
  }
  return violations
}

/**
 * True for a Tailwind class with the important modifier: `!` directly before
 * or after the utility, after any `variant:` prefixes.
 */
export function hasImportantModifier(token) {
  // `!important` itself is reported by the other rule.
  if (/^!important\b/i.test(token)) return false
  const utility = withoutVariants(token)
  // Legacy form: !p-4, !-mt-2, ![color:red]
  if (/^!-?[a-z[(@*]/.test(utility)) return true
  // Current form: p-4!, w-[10px]!, size-(--x)!
  return /^-?[a-z[(@*][^\s!]*!$/.test(utility)
}

/** Drop `hover:`, `data-[state=open]:` and friends: everything up to the last top-level colon. */
function withoutVariants(token) {
  let depth = 0
  let start = 0
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index]
    if (char === "[" || char === "(") depth += 1
    else if (char === "]" || char === ")") depth = Math.max(0, depth - 1)
    else if (char === ":" && depth === 0) start = index + 1
  }
  return token.slice(start)
}

/**
 * The string and template literals of a TypeScript/TSX source, with the line
 * each starts on. Comments are skipped; `${...}` holes in templates are scanned
 * as code. This is a small lexer, not a parser: it relies on JSX text having
 * no raw quotes (the linter's react/no-unescaped-entities enforces that).
 */
export function stringLiterals(source) {
  const literals = []
  let index = 0
  let line = 1

  // Scan code until `end` (or the end of the file), collecting literals.
  function scanCode(end) {
    while (index < source.length) {
      const char = source[index]
      const next = source[index + 1]
      if (char === end) return
      if (char === "\n") line += 1
      if (char === "/" && next === "/") {
        while (index < source.length && source[index] !== "\n") index += 1
      } else if (char === "/" && next === "*") {
        const close = source.indexOf("*/", index + 2)
        const stop = close === -1 ? source.length : close + 2
        line += countNewlines(source.slice(index, stop))
        index = stop
      } else if (char === '"' || char === "'") {
        scanQuoted(char)
      } else if (char === "`") {
        scanTemplate()
      } else if (char === "{") {
        index += 1
        scanCode("}")
        index += 1
      } else {
        index += 1
      }
    }
  }

  function scanQuoted(quote) {
    const startLine = line
    let text = ""
    index += 1
    while (index < source.length && source[index] !== quote) {
      // An unterminated literal: not a string after all (an apostrophe in prose).
      if (source[index] === "\n") return
      if (source[index] === "\\") index += 1
      text += source[index] ?? ""
      index += 1
    }
    index += 1
    literals.push({ line: startLine, text })
  }

  function scanTemplate() {
    const startLine = line
    let text = ""
    index += 1
    while (index < source.length && source[index] !== "`") {
      if (source[index] === "$" && source[index + 1] === "{") {
        index += 2
        scanCode("}")
        index += 1
        text += " "
        continue
      }
      if (source[index] === "\\") index += 1
      if (source[index] === "\n") line += 1
      text += source[index] ?? ""
      index += 1
    }
    index += 1
    literals.push({ line: startLine, text })
  }

  scanCode(undefined)
  return literals
}

const countNewlines = (text) => text.split("\n").length - 1
const lineOf = (text, offset) => countNewlines(text.slice(0, offset)) + 1

/** Replace matches with spaces, keeping newlines, so line numbers stay true. */
function blankOut(text, pattern) {
  return text.replace(pattern, (match) => match.replace(/[^\n]/g, " "))
}

function* filesUnder(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) yield* filesUnder(entryPath)
    else yield entryPath
  }
}

const MESSAGES = {
  important: "`!important` is not allowed",
  "tailwind-important": "Tailwind's important modifier is not allowed",
}

function main() {
  const repoRoot = path.resolve(import.meta.dirname, "..")
  const directory = path.resolve(process.argv[2] ?? path.join(repoRoot, "web", "src"))
  let fileCount = 0
  let violationCount = 0

  for (const file of filesUnder(directory)) {
    const violations = findViolations(readFileSync(file, "utf8"), file)
    fileCount += 1
    for (const violation of violations) {
      violationCount += 1
      const location = `${path.relative(repoRoot, file)}:${violation.line}`
      console.error(`${location}  ${MESSAGES[violation.rule]}: ${violation.text}`)
    }
  }

  if (violationCount > 0) {
    console.error(
      `\nStyle guard failed: ${violationCount} violation(s). Fix the component or token instead of forcing the style.`,
    )
    process.exit(1)
  }
  console.log(`Style guard passed: ${fileCount} files checked, nothing forces a style.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
