import * as React from "react"

import type { ComponentCategory, ComponentDefinition } from "@/forms/runtime"

import { useDesignerContext } from "./context"
import { PanelTitle } from "./panel-title"

/** The groups, in the order they are listed, and what each is called. */
const CATEGORIES: readonly { category: ComponentCategory; title: string }[] = [
  { category: "input", title: "Inputs" },
  { category: "layout", title: "Layout" },
  { category: "content", title: "Content" },
  { category: "action", title: "Actions" },
]

/**
 * The toolbox (spec 3.2): every registered component, grouped by category,
 * built from each definition and nothing else. Drag an item onto the canvas
 * or the outline, or press it to add it after the selection.
 *
 * It is one Tab stop (Phase 3, section 5): the arrow keys move between the
 * items, Home and End go to the first and the last, and Enter adds the one
 * with focus.
 */
export function Toolbox() {
  const { store } = useDesignerContext()
  const definitions = [...store.schema.registry.values()]
  const groups = CATEGORIES.map(({ category, title }) => ({
    category,
    title,
    items: definitions.filter((definition) => definition.category === category),
  })).filter((group) => group.items.length > 0)
  const order = groups.flatMap((group) => group.items.map((definition) => definition.type))

  /** The item that holds the Tab stop: the one last focused. */
  const [current, setCurrent] = React.useState(order[0])
  const listRef = React.useRef<HTMLElement>(null)

  const focusItem = (type: string | undefined) => {
    if (type === undefined) return
    setCurrent(type)
    listRef.current?.querySelector<HTMLElement>(`[data-toolbox-item="${type}"]`)?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const index = order.indexOf(current)
    const target =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? order[Math.min(index + 1, order.length - 1)]
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? order[Math.max(index - 1, 0)]
          : event.key === "Home"
            ? order[0]
            : event.key === "End"
              ? order.at(-1)
              : null
    if (target === null) return
    event.preventDefault()
    focusItem(target)
  }

  return (
    <nav
      ref={listRef}
      aria-label="Toolbox"
      data-testid="designer-toolbox"
      className="flex flex-col gap-1 pb-3"
    >
      {groups.map(({ category, title, items }) => {
        const titleId = `designer-toolbox-${category}`
        return (
          <section key={category} aria-labelledby={titleId}>
            <PanelTitle id={titleId}>{title}</PanelTitle>
            <ul className="flex flex-col gap-0.5 px-2">
              {items.map((definition) => (
                <li key={definition.type}>
                  <ToolboxItem
                    definition={definition}
                    isTabStop={definition.type === current}
                    onFocus={() => setCurrent(definition.type)}
                    onKeyDown={onKeyDown}
                  />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </nav>
  )
}

function ToolboxItem({
  definition,
  isTabStop,
  onFocus,
  onKeyDown,
}: {
  definition: ComponentDefinition
  isTabStop: boolean
  onFocus: () => void
  onKeyDown: (event: React.KeyboardEvent) => void
}) {
  const { store, drag } = useDesignerContext()
  const nameId = `designer-toolbox-${definition.type}-name`
  const descriptionId = `designer-toolbox-${definition.type}-description`
  return (
    <button
      type="button"
      data-testid={`toolbox-item-${definition.type}`}
      data-toolbox-item={definition.type}
      tabIndex={isTabStop ? 0 : -1}
      aria-labelledby={nameId}
      aria-describedby={descriptionId}
      className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition-colors select-none hover:bg-muted"
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onClick={() => store.run({ type: "add", component: definition.type })}
      onPointerDown={(event) => drag.press({ kind: "new", component: definition.type }, event)}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-xs">
        <definition.icon aria-hidden="true" className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span id={nameId} className="font-medium text-foreground">
          {definition.displayName}
        </span>
        <span id={descriptionId} className="text-xs text-muted-foreground">
          {definition.description}
        </span>
      </span>
    </button>
  )
}
