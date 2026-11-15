import * as React from "react"
import { cn } from "cn"
import { CircleHelpIcon, EyeOffIcon } from "lucide-react"

import { useDesigner, useDesignerContext, useDrag } from "./context"
import { SCROLL_AREA_ATTRIBUTE } from "./drag/controller"
import type { OutlineNode } from "./model/schema"
import { outlineDropAt, type OutlineRow, outlineRows } from "./outline-rows"
import { PanelTitle } from "./panel-title"

/**
 * The outline (spec 3.2): the form's component tree, with each instance's
 * icon and name. It shows what the canvas cannot: instances stored in a
 * region their container does not show, marked as hidden. Everything can be
 * selected, dragged and dropped here as on the canvas.
 */
export function OutlinePanel() {
  const { store, drag } = useDesignerContext()
  const document = useDesigner((snapshot) => snapshot.editor.document)
  const selection = useDesigner((snapshot) => snapshot.editor.selection)
  const focus = useDesigner((snapshot) => snapshot.focus)
  const outline = store.schema.outline(document)
  const rows = React.useMemo(() => outlineRows(outline), [outline])

  const paneRef = React.useRef<HTMLDivElement>(null)
  const treeRef = React.useRef<HTMLDivElement>(null)
  /** Two elements as wide as a row's first indent and as each further one, to measure them. */
  const baseRef = React.useRef<HTMLDivElement>(null)
  const indentRef = React.useRef<HTMLDivElement>(null)

  // Drops: the row under the pointer, and how far in from the left the pointer is.
  React.useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    return drag.register({
      name: "outline",
      element: pane,
      locate(x, y) {
        const tree = treeRef.current
        if (!tree) return null
        const current = store.schema.outline(store.getSnapshot().editor.document)
        const currentRows = outlineRows(current)
        const elements = [...tree.querySelectorAll<HTMLElement>("[data-row]")]
        const treeBox = tree.getBoundingClientRect()
        const base = baseRef.current?.getBoundingClientRect().width ?? 0
        const indent = indentRef.current?.getBoundingClientRect().width || 1

        const hit = window.document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-row]")
        const last = elements.at(-1)?.getBoundingClientRect()
        const over = hit && tree.contains(hit) ? hit : null
        if (!over && last && y <= last.bottom) return null

        const box = over?.getBoundingClientRect()
        const drop = outlineDropAt(current, currentRows, {
          row: over ? Number(over.dataset.row) : null,
          fraction: box ? (y - box.top) / box.height : 0,
          depth: Math.floor((x - treeBox.left - base) / indent),
        })
        if (!drop) return null

        const lineRow = elements[drop.line.row]?.getBoundingClientRect()
        const lineY = lineRow
          ? drop.line.edge === "top"
            ? lineRow.top
            : lineRow.bottom
          : treeBox.top
        const left = treeBox.left + base + drop.line.depth * indent
        return {
          position: drop.position,
          indicator: {
            shape: "line",
            box: {
              left,
              top: lineY - 1,
              width: Math.max(treeBox.right - base - left, 16),
              height: 2,
            },
          },
          region: null,
        }
      },
    })
  }, [drag, store])

  // Keyboard focus goes to the selection when a command asks for it.
  React.useEffect(() => {
    if (focus.count === 0 || focus.surface !== "outline") return
    const pane = paneRef.current
    const target = rowOf(pane, store.getSnapshot().editor.selection) ?? pane
    target?.focus()
  }, [focus, store])

  // The selection stays in view: after it changes, and after it moves.
  const selectedRow = rows.findIndex(
    (row) => row.kind === "instance" && row.node.instance.id === selection,
  )
  React.useEffect(() => {
    if (selectedRow !== -1)
      rowOf(paneRef.current, selection)?.scrollIntoView?.({ block: "nearest" })
  }, [selection, selectedRow])

  const instances = rows.flatMap((row) => (row.kind === "instance" ? [row.node] : []))
  const tabStop = instances.find((node) => node.instance.id === selection) ?? instances[0]

  return (
    <section aria-labelledby="designer-outline-title" className="flex min-h-0 flex-1 flex-col">
      <PanelTitle id="designer-outline-title">Outline</PanelTitle>
      <div
        ref={paneRef}
        data-testid="designer-outline"
        {...{ [SCROLL_AREA_ATTRIBUTE]: "" }}
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 -outline-offset-2"
        onFocus={() => store.noteSurface("outline")}
      >
        <div ref={baseRef} aria-hidden="true" className="h-0 w-(--sys-space-sm)" />
        <div ref={indentRef} aria-hidden="true" className="h-0 w-(--sys-space-md)" />
        {rows.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            Nothing yet. Components you add to the form are listed here.
          </p>
        ) : (
          <div ref={treeRef} role="tree" aria-labelledby="designer-outline-title">
            {rows.map((row, index) =>
              row.kind === "instance" ? (
                <InstanceRow
                  key={row.node.instance.id}
                  row={row}
                  index={index}
                  isTabStop={row.node === tabStop}
                  instances={instances}
                />
              ) : (
                <RegionRow
                  key={`${row.parent.instance.id}/${row.region.name}`}
                  row={row}
                  index={index}
                />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  )
}

const rowOf = (pane: HTMLElement | null, id: string | null) =>
  id === null ? null : (pane?.querySelector<HTMLElement>(`[data-outline-item="${id}"]`) ?? null)

/** A row's indent as a CSS custom property: layout data, like the columns template. */
type IndentStyle = React.CSSProperties & { "--row-indent": string }

const indentStyle = (depth: number): IndentStyle => ({
  "--row-indent": `calc(var(--sys-space-sm) + ${depth} * var(--sys-space-md))`,
})

function HiddenBadge() {
  return (
    <span
      data-slot="outline-hidden"
      className="ml-auto flex shrink-0 items-center gap-1 rounded-sm bg-muted px-1 text-xs text-muted-foreground"
    >
      <EyeOffIcon aria-hidden="true" className="size-3" />
      Hidden
    </span>
  )
}

function InstanceRow({
  row,
  index,
  isTabStop,
  instances,
}: {
  row: Extract<OutlineRow, { kind: "instance" }>
  index: number
  isTabStop: boolean
  /** Every instance row's node, top to bottom: where the arrow keys go. */
  instances: readonly OutlineNode[]
}) {
  const { store, drag } = useDesignerContext()
  const { node, depth } = row
  const { id, name, type } = node.instance
  const isSelected = useDesigner((snapshot) => snapshot.editor.selection === id)
  const isDragged = useDrag((state) => state?.source.kind === "existing" && state.source.id === id)
  const Icon = node.definition?.icon ?? CircleHelpIcon
  const typeName = node.definition?.displayName ?? `unknown component ${type}`
  // A container with several regions says which one each child is in.
  const where = node.parent && node.parent.regions.length > 1 ? `, in ${node.position.region}` : ""

  const go = (to: OutlineNode | null | undefined) => {
    if (!to) return
    store.select(to.instance.id)
    store.focusSelection("outline")
  }

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isSelected}
      aria-label={`${name}, ${typeName}${where}${node.shown ? "" : ", hidden"}`}
      data-row={index}
      data-outline-item={id}
      data-testid={`outline-${name}`}
      data-hidden={node.shown ? undefined : "true"}
      tabIndex={isTabStop ? 0 : -1}
      style={indentStyle(depth)}
      className={cn(
        "flex h-7 items-center gap-2 rounded-md pr-2 pl-(--row-indent) text-foreground -outline-offset-2 select-none hover:bg-muted",
        isSelected && "bg-primary/10 font-medium hover:bg-primary/10",
        !node.shown && "text-muted-foreground",
        isDragged && "opacity-50",
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        store.select(id)
        drag.press({ kind: "existing", id }, event)
      }}
      onFocus={() => store.select(id)}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
        const position = instances.indexOf(node)
        const target =
          event.key === "ArrowDown"
            ? instances[position + 1]
            : event.key === "ArrowUp"
              ? instances[position - 1]
              : event.key === "ArrowLeft"
                ? node.parent
                : event.key === "ArrowRight"
                  ? node.regions.flatMap((region) => region.children)[0]
                  : event.key === "Home"
                    ? instances[0]
                    : event.key === "End"
                      ? instances.at(-1)
                      : null
        if (target === null) return
        event.preventDefault()
        go(target)
      }}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-3.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")}
      />
      <span className="truncate">{name}</span>
      {node.shown ? null : <HiddenBadge />}
    </div>
  )
}

/** The row of one region of a container with several: where to drop into that region. */
function RegionRow({
  row,
  index,
}: {
  row: Extract<OutlineRow, { kind: "region" }>
  index: number
}) {
  const { parent, region, depth } = row
  // Hidden as a whole only when the region itself is the reason, not its container.
  const isStray = parent.shown && !region.shown
  return (
    <div
      role="none"
      data-row={index}
      data-testid={`outline-${parent.instance.name}-${region.name}`}
      data-hidden={region.shown ? undefined : "true"}
      style={indentStyle(depth)}
      className="flex h-6 items-center gap-2 pr-2 pl-(--row-indent) font-mono text-xs text-muted-foreground select-none"
    >
      <span className="truncate">{region.name}</span>
      {isStray ? <HiddenBadge /> : null}
    </div>
  )
}
