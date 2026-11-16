import * as React from "react"
import { CheckIcon } from "lucide-react"

import { PROPERTY_TYPES } from "@/data/properties"
import type { PropertyDefinition } from "@/generated"

import { useFormBinding } from "./binding"
import { useDesigner, useDesignerContext } from "./context"
import { PanelTitle } from "./panel-title"

/**
 * The properties of the entity the form is bound to (spec 5.2), beside the
 * toolbox. Drag one onto the canvas or the outline, or press it, to add the
 * component that edits it: bound to the property, labelled with its display
 * name, carrying its required flag and limits. A property already on the
 * form is marked, and pressing it selects its component.
 *
 * Like the toolbox it is one Tab stop: the arrow keys move between the
 * properties, Home and End go to the first and the last.
 */
export function DataPanel() {
  const { store } = useDesignerContext()
  const binding = useFormBinding()
  const document = useDesigner((snapshot) => snapshot.editor.document)
  const listRef = React.useRef<HTMLUListElement>(null)
  const [current, setCurrent] = React.useState<string | null>(null)

  if (binding.status === "none") return null

  const properties = binding.status === "ready" ? binding.entity.properties : []
  /** Property name to the id of the instance bound to it. */
  const placed = new Map<string, string>()
  for (const node of store.schema.outline(document).order) {
    if (node.instance.bind !== undefined) placed.set(node.instance.bind, node.instance.id)
  }
  const tabStop = properties.some((property) => property.name === current)
    ? current
    : properties[0]?.name

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const index = properties.findIndex((property) => property.name === tabStop)
    const target =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? properties[Math.min(index + 1, properties.length - 1)]
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? properties[Math.max(index - 1, 0)]
          : event.key === "Home"
            ? properties[0]
            : event.key === "End"
              ? properties.at(-1)
              : undefined
    if (!target) return
    event.preventDefault()
    setCurrent(target.name)
    listRef.current?.querySelector<HTMLElement>(`[data-property="${target.name}"]`)?.focus()
  }

  return (
    <section
      aria-labelledby="designer-data-title"
      data-testid="designer-data-panel"
      className="flex flex-col border-b pb-2"
    >
      <PanelTitle id="designer-data-title">
        {binding.status === "ready" ? `${binding.entity.displayName} properties` : "Data"}
      </PanelTitle>
      {binding.status === "loading" ? (
        <p className="px-4 pb-2 text-xs text-muted-foreground">Loading the properties…</p>
      ) : binding.status === "missing" ? (
        <p
          role="alert"
          data-testid="designer-data-missing"
          className="px-4 pb-2 text-xs text-foreground"
        >
          The form is bound to “{binding.name}”, which is not an entity. Choose another in the
          form&rsquo;s properties.
        </p>
      ) : properties.length === 0 ? (
        <p className="px-4 pb-2 text-xs text-muted-foreground">
          {binding.entity.displayName} has no properties yet. Add some on the Entities page.
        </p>
      ) : (
        <ul ref={listRef} className="flex flex-col gap-0.5 px-2">
          {properties.map((property) => (
            <li key={property.name}>
              <PropertyItem
                property={property}
                placedId={placed.get(property.name) ?? null}
                isTabStop={property.name === tabStop}
                onFocus={() => setCurrent(property.name)}
                onKeyDown={onKeyDown}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PropertyItem({
  property,
  placedId,
  isTabStop,
  onFocus,
  onKeyDown,
}: {
  property: PropertyDefinition
  placedId: string | null
  isTabStop: boolean
  onFocus: () => void
  onKeyDown: (event: React.KeyboardEvent) => void
}) {
  const { store, drag } = useDesignerContext()
  const type = PROPERTY_TYPES[property.type]
  const component = store.schema.componentFor(property)
  const isPlaced = placedId !== null
  const id = `designer-data-${property.name}`
  return (
    <button
      type="button"
      data-testid={`data-property-${property.name}`}
      data-property={property.name}
      data-placed={isPlaced ? "true" : undefined}
      tabIndex={isTabStop ? 0 : -1}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-about`}
      className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors select-none hover:bg-muted"
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onClick={() => {
        if (isPlaced) {
          store.select(placedId)
          store.announce(`${property.displayName} is already on the form; selected it.`)
        } else if (component) {
          store.run({ type: "add", component: component.type, property })
        } else {
          store.announce(`No component can edit ${property.displayName}.`)
        }
      }}
      onPointerDown={(event) => {
        if (!isPlaced && component) {
          drag.press({ kind: "new", component: component.type, property }, event)
        }
      }}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-xs">
        <type.icon aria-hidden="true" className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={`${id}-name`} className="truncate font-medium text-foreground">
          {property.displayName}
          {property.required ? (
            <span aria-hidden="true" className="text-destructive">
              {" *"}
            </span>
          ) : null}
        </span>
        <span id={`${id}-about`} className="text-xs text-muted-foreground">
          {type.label}
          {property.required ? ", required" : ""}
          {isPlaced ? ", on the form" : component ? `, adds a ${component.displayName}` : ""}
        </span>
      </span>
      {isPlaced ? <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-success" /> : null}
    </button>
  )
}
