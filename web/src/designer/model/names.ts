/**
 * Names for new instances (spec 3.7, frozen by ADR 0008): the component type
 * in camelCase plus the lowest number that is free, such as `textField1`. An
 * input is bound to a data path equal to its name, so for an input the number
 * must be free as a data path too.
 */

/** The longest name the server accepts. */
const MAX_NAME_LENGTH = 64
/** Room kept for the number. */
const MAX_BASE_LENGTH = MAX_NAME_LENGTH - 8

/** `text-field` → `textField`. A type id is lowercase words joined by hyphens. */
export function nameBase(type: string): string {
  const [first = "", ...rest] = type.split("-").filter((word) => word !== "")
  const base = first + rest.map((word) => word[0].toUpperCase() + word.slice(1)).join("")
  // A type id starts with a letter; anything else would not be a name.
  return (/^[A-Za-z_$]/.test(base) ? base : `c${base}`).slice(0, MAX_BASE_LENGTH)
}

/** Whether a value stored under `path` would clash with one stored under `other`. */
export function pathsClash(path: string, other: string): boolean {
  return path === other || path.startsWith(`${other}.`) || other.startsWith(`${path}.`)
}

/** The names and data paths already used in a form. */
export type Taken = { readonly names: Set<string>; readonly paths: Set<string> }

/**
 * The next free name for a component of this type, and records it as taken.
 * `bound` says the instance will be bound to a data path equal to its name.
 */
export function takeName(type: string, bound: boolean, taken: Taken): string {
  const base = nameBase(type)
  for (let number = 1; ; number++) {
    const name = `${base}${number}`
    if (taken.names.has(name)) continue
    if (bound && [...taken.paths].some((path) => pathsClash(name, path))) continue
    taken.names.add(name)
    if (bound) taken.paths.add(name)
    return name
  }
}
