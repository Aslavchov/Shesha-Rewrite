// Proves the style guard catches what it claims to. Run with: node --test scripts/style-guard.test.mjs
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import { findViolations, hasImportantModifier } from "./style-guard.mjs"

const GUARD = path.join(import.meta.dirname, "style-guard.mjs")
const rules = (source, fileName) => findViolations(source, fileName).map((v) => v.rule)

test("catches !important in CSS", () => {
  const css = ".card {\n  color: red !important;\n  margin: 0 ! important;\n}\n"

  const violations = findViolations(css, "card.css")

  assert.deepEqual(
    violations.map((v) => [v.rule, v.line]),
    [
      ["important", 2],
      ["important", 3],
    ],
  )
})

test("catches !important in TSX", () => {
  const tsx = 'export const style = { color: "red !important" }\n'

  assert.deepEqual(rules(tsx, "widget.tsx"), ["important"])
})

test("catches the Tailwind important modifier in TSX, in both spellings", () => {
  const tsx = [
    "export function Widget() {",
    '  return <div className="flex p-4! hover:bg-primary! md:!mt-2 !hidden">x</div>',
    "}",
  ].join("\n")

  const violations = findViolations(tsx, "widget.tsx")

  assert.deepEqual(
    violations.map((v) => [v.rule, v.line, v.text]),
    [
      ["tailwind-important", 2, "p-4!"],
      ["tailwind-important", 2, "hover:bg-primary!"],
      ["tailwind-important", 2, "md:!mt-2"],
      ["tailwind-important", 2, "!hidden"],
    ],
  )
})

test("catches the modifier inside cn(), cva() and template literals", () => {
  const tsx = [
    'const a = cn("size-8", active && "group-data-[collapsible=icon]:size-8!")',
    "const b = `w-[10px]! ${a} text-sm`",
    "const c = cva('rounded-md', { variants: { size: { lg: '!h-12' } } })",
  ].join("\n")

  assert.deepEqual(
    findViolations(tsx, "variants.ts").map((v) => [v.line, v.text]),
    [
      [1, "group-data-[collapsible=icon]:size-8!"],
      [2, "w-[10px]!"],
      [3, "!h-12"],
    ],
  )
})

test("catches the modifier in @apply and the important flag on the Tailwind import", () => {
  const css = '@import "tailwindcss" important;\n.btn {\n  @apply px-4 font-medium!;\n}\n'

  assert.deepEqual(
    findViolations(css, "index.css").map((v) => [v.rule, v.line]),
    [
      ["tailwind-important", 1],
      ["tailwind-important", 3],
    ],
  )
})

test("leaves ordinary code alone", () => {
  const tsx = [
    "// !important and p-4! in a comment are fine",
    "/* so is !hidden here */",
    "const ready = !loading && value !== other",
    "const element = document.getElementById('root')!",
    'const label = "Saved! Nothing else to do."',
    'const classes = "flex items-center data-[state=open]:bg-muted aria-[current=page]:font-medium"',
    "export const App = () => <p className={classes}>Don&apos;t panic!</p>",
  ].join("\n")
  const css = "/* never use !important */\n.card { color: var(--foreground); }\n"

  assert.deepEqual(findViolations(tsx, "app.tsx"), [])
  assert.deepEqual(findViolations(css, "card.css"), [])
})

test("ignores files that are neither styles nor scripts", () => {
  assert.deepEqual(findViolations("# Never use !important", "notes.md"), [])
})

test("hasImportantModifier understands variants and arbitrary values", () => {
  for (const token of ["p-4!", "!p-4", "hover:p-4!", "dark:md:!p-4", "[color:red]!", "!-mt-2"]) {
    assert.equal(hasImportantModifier(token), true, token)
  }
  for (const token of ["p-4", "hover:p-4", "data-[a=b!]:p-4", "!", "!==", "Saved!", "[&>p]:m-0"]) {
    assert.equal(hasImportantModifier(token), false, token)
  }
})

test("the command exits 1 on a violation and 0 on a clean tree", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "style-guard-"))
  try {
    mkdirSync(path.join(directory, "components"))
    const file = path.join(directory, "components", "widget.tsx")

    writeFileSync(file, 'export const classes = "p-4"\n')
    const clean = spawnSync(process.execPath, [GUARD, directory], { encoding: "utf8" })
    assert.equal(clean.status, 0, clean.stderr)

    writeFileSync(file, 'export const classes = "p-4!"\n')
    const dirty = spawnSync(process.execPath, [GUARD, directory], { encoding: "utf8" })
    assert.equal(dirty.status, 1)
    assert.match(
      dirty.stderr,
      /widget\.tsx:1 {2}Tailwind's important modifier is not allowed: p-4!/,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
