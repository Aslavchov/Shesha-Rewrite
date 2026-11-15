import type { ComponentInstance } from "@/generated"

import { type Command, STYLE_PROPERTY_LABELS, type StyleProperty } from "./editor"
import type { OutlineNode } from "./schema"

/**
 * What is wrong with one instance, in plain words, for its author (spec 3.5):
 * an unknown type, a stored setting or style the renderer ignores, children
 * in a region the form does not show, an input with no data path. Each
 * problem offers a fix when there is an obvious one.
 */

export type Problem = {
  readonly message: string
  readonly fix?: { readonly label: string; readonly command: Command }
}

const isStyleProperty = (key: string): key is StyleProperty =>
  Object.hasOwn(STYLE_PROPERTY_LABELS, key)

const components = (count: number) => (count === 1 ? "1 component" : `${count} components`)

/** Remembered per instance object: an instance never changes, so neither do its problems. */
const remembered = new WeakMap<ComponentInstance, readonly Problem[]>()

export function problemsOf(node: OutlineNode): readonly Problem[] {
  // Hidden children depend on the regions shown, which depend only on the
  // instance itself; the rest is the instance's own.
  let problems = remembered.get(node.instance)
  if (!problems) {
    problems = find(node)
    remembered.set(node.instance, problems)
  }
  return problems
}

function find(node: OutlineNode): Problem[] {
  const { instance, definition } = node
  const { id, name } = instance
  if (!definition) {
    return [
      {
        message: `This version has no component of type “${instance.type}”. ${name} is kept in the form as it is, but it cannot be shown or configured.`,
      },
    ]
  }

  const problems: Problem[] = []
  const prepared = definition.prepare(instance)
  for (const problem of prepared.problems) {
    if (problem.setting !== undefined) {
      const key = problem.setting
      const setting = definition.settings[key]
      const label = setting?.label ?? `“${key}”`
      problems.push({
        message: setting
          ? `${label}: ${problem.message}`
          : `“${key}” is not a setting of ${definition.displayName}, so it is ignored.`,
        fix: {
          label: setting ? `Reset ${label.toLowerCase()}` : `Remove “${key}”`,
          command: { type: "reset-setting", id, key },
        },
      })
    } else if (problem.slot !== undefined) {
      const { slot, property } = problem
      const isSlot = definition.slots.includes(slot)
      if (!isSlot) {
        problems.push({
          message: `${definition.displayName} has no part called “${slot}”, so its styles are ignored.`,
          fix: {
            label: `Remove the styles of “${slot}”`,
            command: { type: "reset-slot", id, slot },
          },
        })
      } else if (property !== undefined && isStyleProperty(property)) {
        const label = STYLE_PROPERTY_LABELS[property]
        problems.push({
          message: `${label} of ${slot}: ${problem.message}`,
          fix: {
            label: `Reset ${label.toLowerCase()}`,
            command: { type: "set-style", id, slot, property, value: undefined },
          },
        })
      } else {
        problems.push({
          message: `${slot}: ${problem.message}`,
          fix: { label: `Reset the styles of ${slot}`, command: { type: "reset-slot", id, slot } },
        })
      }
    } else {
      problems.push({ message: problem.message })
    }
  }

  if (definition.kind === "input" && !instance.bind) {
    problems.push({
      message: `${definition.displayName} needs a data path to store its value under. Until it has one, it is not shown.`,
      fix: { label: `Store it under ${name}`, command: { type: "bind", id, path: name } },
    })
  }

  for (const region of node.regions) {
    // Only regions the component does not have now; the container being
    // hidden itself is its own container's problem.
    if (prepared.regions.includes(region.name) || region.children.length === 0) continue
    const count = region.children.length
    problems.push({
      message: `${components(count)} ${count === 1 ? "is" : "are"} in ${region.name}, a region ${name} does not show now. ${count === 1 ? "It is" : "They are"} kept, marked hidden in the outline, and ${count === 1 ? "comes" : "come"} back when the region is shown again.`,
    })
  }
  return problems
}
