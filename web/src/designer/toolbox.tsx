import type { ComponentCategory, ComponentDefinition } from "@/forms/runtime"

import { useDesignerContext } from "./context"
import { PanelTitle } from "./panel-title"

/** The groups, in the order they are listed, and what each is called. */
const CATEGORIES: readonly { category: ComponentCategory; title: string }[] = [
  { category: "input", title: "Inputs" },
  { category: "layout", title: "Layout" },
  { category: "action", title: "Actions" },
]

/**
 * The toolbox (spec 3.2): every registered component, grouped by category,
 * built from each definition and nothing else. Drag an item onto the canvas
 * or the outline, or press it to add it after the selection.
 */
export function Toolbox() {
  const { store } = useDesignerContext()
  const definitions = [...store.schema.registry.values()]

  return (
    <nav aria-label="Toolbox" data-testid="designer-toolbox" className="flex flex-col gap-1 pb-3">
      {CATEGORIES.map(({ category, title }) => {
        const items = definitions.filter((definition) => definition.category === category)
        if (items.length === 0) return null
        const titleId = `designer-toolbox-${category}`
        return (
          <section key={category} aria-labelledby={titleId}>
            <PanelTitle id={titleId}>{title}</PanelTitle>
            <ul className="flex flex-col gap-0.5 px-2">
              {items.map((definition) => (
                <li key={definition.type}>
                  <ToolboxItem definition={definition} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </nav>
  )
}

function ToolboxItem({ definition }: { definition: ComponentDefinition }) {
  const { store, drag } = useDesignerContext()
  const nameId = `designer-toolbox-${definition.type}-name`
  const descriptionId = `designer-toolbox-${definition.type}-description`
  return (
    <button
      type="button"
      data-testid={`toolbox-item-${definition.type}`}
      aria-labelledby={nameId}
      aria-describedby={descriptionId}
      className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition-colors select-none hover:bg-muted"
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
