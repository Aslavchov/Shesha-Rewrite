import { DEFINITION_MAX_NAME_CHARS } from "@/generated"

/**
 * The identifier made from what people call something (spec 3.1):
 * "Date of birth" gives `dateOfBirth`. Only ASCII letters and digits are
 * kept, and it starts with a letter, as the server asks of a name.
 */
export function toName(displayName: string): string {
  const words = displayName
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word !== "")
  const joined = words
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join("")
  const named = /^[A-Za-z]/.test(joined) || joined === "" ? joined : `n${joined}`
  return named.slice(0, DEFINITION_MAX_NAME_CHARS)
}

/** `name`, or the first of `name2`, `name3`, … that is not taken. */
export function unique(name: string, taken: readonly string[]): string {
  if (!taken.includes(name)) return name
  for (let number = 2; ; number++) {
    const candidate = `${name}${number}`
    if (!taken.includes(candidate)) return candidate
  }
}

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/

/** Why a name cannot be used, or null. The server checks the same. */
export function nameProblem(name: string, taken: readonly string[]): string | null {
  if (name === "") return "Give it a name."
  if (!NAME.test(name)) return "Use letters, digits and _, starting with a letter."
  if (name.length > DEFINITION_MAX_NAME_CHARS)
    return `Use no more than ${DEFINITION_MAX_NAME_CHARS} characters.`
  if (taken.some((other) => other.toLowerCase() === name.toLowerCase()))
    return "That name is already used."
  return null
}

/**
 * A noun with "a" or "an" before it, by its first letter: "an organisation",
 * "a person". English has exceptions ("an hour", "a unit"); a display name
 * that is one reads a little oddly, and nothing breaks.
 */
export function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun.trim()) ? "an" : "a"} ${noun.trim()}`
}
