import * as React from "react"
import { cn } from "cn"
import { MousePointerClickIcon } from "lucide-react"

import { Submission } from "@/components/submission"
import { Card, CardContent } from "@/components/ui/card"
import {
  type DesignInstanceProps,
  type DesignRegionProps,
  type DesignSurface,
  FormRenderer,
  type NestedValues,
} from "@/forms/runtime"
import type { FormDocument } from "@/generated"

import { type Box, type CanvasLayout, EMPTY_LAYOUT, locateOnCanvas, shift } from "./canvas-geometry"
import { EMPTY_ATTRIBUTE, ITEM_ATTRIBUTE, measureCanvas, sameLayout } from "./canvas-measure"
import { useDesigner, useDesignerContext, useDrag } from "./context"
import { SCROLL_AREA_ATTRIBUTE } from "./drag/controller"
import type { OutlineNode } from "./model/schema"
import { ROOT_REGION } from "./model/tree"

/**
 * The canvas (spec 3.3). It shows the form through the real renderer, in
 * design mode, and inert: what is on the canvas is the form, and it cannot be
 * typed into. Selecting, hovering, focusing and dropping all happen on a
 * layer of boxes laid over it, one per instance, placed by measuring the
 * form (ADR 0008).
 */
export function Canvas() {
  const mode = useDesigner((snapshot) => snapshot.mode)
  const document = useDesigner((snapshot) => snapshot.editor.document)
  return mode === "preview" ? <Preview document={document} /> : <DesignCanvas document={document} />
}

const PAPER = "mx-auto w-full max-w-2xl"

// --- Preview ---------------------------------------------------------------------

/** The form as people will use it. Its values start afresh each time it is opened. */
function Preview({ document }: { document: FormDocument }) {
  const { store } = useDesignerContext()
  const [submitted, setSubmitted] = React.useState<NestedValues | null>(null)
  return (
    <section
      aria-label="Preview"
      data-testid="designer-canvas"
      data-mode="preview"
      className="min-h-0 flex-1 overflow-y-auto bg-muted/40 p-6"
    >
      <div className={cn(PAPER, "flex flex-col gap-6")}>
        <Card>
          <CardContent>
            <FormRenderer
              document={document}
              registry={store.schema.registry}
              mode="edit"
              onSubmit={setSubmitted}
              onReset={() => setSubmitted(null)}
            />
          </CardContent>
        </Card>
        {submitted === null ? null : <Submission values={submitted} />}
      </div>
    </section>
  )
}

// --- What the renderer is given to wrap instances and regions with ----------------

/** The name of the region the instances being rendered are in. */
const RegionContext = React.createContext(ROOT_REGION)

/** Around every instance: no box of its own, only a way to find what the instance drew. */
function InstanceMarker({ instance, children }: DesignInstanceProps) {
  const region = React.useContext(RegionContext)
  return (
    <div {...{ [ITEM_ATTRIBUTE]: instance.id }} data-region={region} className="contents">
      {children}
    </div>
  )
}

/** A region's instances, or the drop target that shows where they would go. */
function RegionSlot({ parent, name, isEmpty, children }: DesignRegionProps) {
  return (
    <RegionContext value={name}>
      {children}
      {isEmpty ? (
        <div
          {...{ [EMPTY_ATTRIBUTE]: "" }}
          data-parent={parent?.id ?? ""}
          data-region={name}
          data-testid={parent ? `drop-target-${parent.name}-${name}` : "drop-target"}
          className={cn(
            "flex w-full min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-input text-center text-muted-foreground",
            parent ? "min-h-11 px-3 py-2 text-xs" : "min-h-48 p-6",
          )}
        >
          {parent ? (
            "Drop a component here"
          ) : (
            <>
              <span className="mb-1 flex size-8 items-center justify-center rounded-lg bg-muted">
                <MousePointerClickIcon aria-hidden="true" className="size-4" />
              </span>
              <span className="font-medium text-foreground">Drag a component here</span>
              <span>Or select one in the toolbox to add it.</span>
            </>
          )}
        </div>
      ) : null}
    </RegionContext>
  )
}

/** One object for the life of the app, so the renderer's instances stay memoised. */
const SURFACE: DesignSurface = { Instance: InstanceMarker, Region: RegionSlot }

// --- The canvas in design mode -----------------------------------------------------

function DesignCanvas({ document: form }: { document: FormDocument }) {
  const { store, drag } = useDesignerContext()
  const outline = store.schema.outline(form)
  const selection = useDesigner((snapshot) => snapshot.editor.selection)
  const focus = useDesigner((snapshot) => snapshot.focus)

  const paneRef = React.useRef<HTMLElement>(null)
  /** The element the form's boxes are measured from, and the overlay is placed in. */
  const originRef = React.useRef<HTMLDivElement>(null)
  const [layout, setLayout] = React.useState<CanvasLayout>(EMPTY_LAYOUT)
  const layoutRef = React.useRef(layout)

  const measure = React.useCallback(() => {
    if (!originRef.current) return
    const measured = measureCanvas(originRef.current, originRef.current)
    if (sameLayout(layoutRef.current, measured)) return
    layoutRef.current = measured
    setLayout(measured)
  }, [])

  // After every render: nothing else can say when the form's layout changed,
  // and measuring it is cheap. The boxes are in place before the browser paints.
  React.useLayoutEffect(measure)

  // And when the form changes size without a render: a resize, a font arriving.
  React.useEffect(() => {
    const origin = originRef.current
    if (!origin || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(origin)
    void window.document.fonts?.ready.then(measure)
    return () => observer.disconnect()
  }, [measure])

  // Drops: a point of the viewport, looked up in the measured layout.
  React.useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    return drag.register({
      name: "canvas",
      element: pane,
      locate(x, y) {
        const origin = originRef.current?.getBoundingClientRect()
        if (!origin) return null
        const current = store.schema.outline(store.getSnapshot().editor.document)
        const place = locateOnCanvas(layoutRef.current, current, x - origin.left, y - origin.top)
        if (!place) return null
        const toViewport = (box: Box) => shift(box, origin.left, origin.top)
        return {
          position: place.position,
          indicator: { shape: place.indicator.shape, box: toViewport(place.indicator.box) },
          region: place.region && toViewport(place.region),
        }
      },
    })
  }, [drag, store])

  // Keyboard focus goes to the selection when a command asks for it. An
  // instance that has just appeared (added, or brought back by undo) has no
  // box until the form is measured: the canvas holds focus until then.
  const awaitsBox = React.useRef(false)
  React.useEffect(() => {
    if (focus.count === 0 || focus.surface !== "canvas") return
    const pane = paneRef.current
    const proxy = proxyOf(pane, store.getSnapshot().editor.selection)
    awaitsBox.current = proxy === null
    ;(proxy ?? pane)?.focus()
  }, [focus, store])
  React.useEffect(() => {
    if (!awaitsBox.current || layout === EMPTY_LAYOUT) return
    awaitsBox.current = false
    const pane = paneRef.current
    // Only if focus is still waiting here: never take it from somewhere else.
    if (document.activeElement === pane) {
      proxyOf(pane, store.getSnapshot().editor.selection)?.focus()
    }
  }, [layout, store])

  // The selection stays in view: after it changes, and after it moves.
  const selectedBox = selection === null ? undefined : layout.items.get(selection)
  React.useEffect(() => {
    if (selectedBox) {
      proxyOf(paneRef.current, selection)?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
    }
  }, [selection, selectedBox])

  const shown = outline.order.filter((node) => node.shown && layout.items.has(node.instance.id))
  const tabStop = shown.find((node) => node.instance.id === selection) ?? shown[0]

  return (
    // A scrolling region has to be reachable by keyboard, and with nothing on
    // it the canvas itself is where focus lands. Pressing its background
    // clears the selection, which Escape does from the keyboard.
    /* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
    <section
      ref={paneRef}
      aria-label="Canvas"
      data-testid="designer-canvas"
      data-mode="design"
      {...{ [SCROLL_AREA_ATTRIBUTE]: "" }}
      tabIndex={shown.length === 0 ? 0 : -1}
      className="relative min-h-0 flex-1 overflow-y-auto bg-muted/40 p-6 -outline-offset-2"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        if (!(event.target as Element).closest("[data-canvas-item]")) store.select(null)
      }}
      onFocus={() => store.noteSurface("canvas")}
    >
      {/* oxlint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div ref={originRef} className={cn(PAPER, "relative")}>
        <Card>
          <CardContent inert>
            <FormRenderer
              document={form}
              registry={store.schema.registry}
              mode="edit"
              design={SURFACE}
            />
          </CardContent>
        </Card>
        <div className="pointer-events-none absolute inset-0">
          <RegionEdges layout={layout} />
          {shown.map((node) => (
            <InstanceProxy
              key={node.instance.id}
              node={node}
              box={layout.items.get(node.instance.id)}
              isTabStop={node === tabStop}
              shown={shown}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

const proxyOf = (pane: HTMLElement | null, id: string | null) =>
  id === null ? null : (pane?.querySelector<HTMLElement>(`[data-canvas-item="${id}"]`) ?? null)

/** A box's place and size as CSS custom properties: layout data, like the columns template. */
type BoxStyle = React.CSSProperties & {
  "--box-left": string
  "--box-top": string
  "--box-width": string
  "--box-height": string
}

const boxStyle = (box: Box): BoxStyle => ({
  "--box-left": `${box.left}px`,
  "--box-top": `${box.top}px`,
  "--box-width": `${box.width}px`,
  "--box-height": `${box.height}px`,
})

const BOXED = "absolute top-(--box-top) left-(--box-left) h-(--box-height) w-(--box-width)"

/** How far outside a region its edge is drawn, so that it does not sit on its instances. */
const EDGE_OUTSET = 3

/** The edges of containers and columns, so it is plain where things will land (spec 3.3). */
function RegionEdges({ layout }: { layout: CanvasLayout }) {
  return [...layout.regions].map(([key, region]) => {
    // The form's own list needs no edge, and an empty region shows its drop target.
    if (key.startsWith("/") || region.empty) return null
    const { left, top, width, height } = region.box
    const outer = {
      left: left - EDGE_OUTSET,
      top: top - EDGE_OUTSET,
      width: width + 2 * EDGE_OUTSET,
      height: height + 2 * EDGE_OUTSET,
    }
    return (
      <div
        key={key}
        data-canvas-region={key}
        style={boxStyle(outer)}
        className={cn(BOXED, "rounded-md border border-dashed border-input")}
      />
    )
  })
}

/**
 * The box over one instance: what is hovered, selected, focused and dragged.
 * Boxes are drawn in document order, so a child's box lies over its
 * container's, and the innermost instance under the pointer is the one that
 * responds.
 */
function InstanceProxy({
  node,
  box,
  isTabStop,
  shown,
}: {
  node: OutlineNode
  box: Box | undefined
  isTabStop: boolean
  /** Every instance on the canvas, in document order: where the arrow keys go. */
  shown: readonly OutlineNode[]
}) {
  const { store, drag } = useDesignerContext()
  const { id, name, type } = node.instance
  const isSelected = useDesigner((snapshot) => snapshot.editor.selection === id)
  const isDragged = useDrag((state) => state?.source.kind === "existing" && state.source.id === id)
  if (!box) return null

  const go = (to: OutlineNode | undefined) => {
    if (!to) return
    store.select(to.instance.id)
    store.focusSelection("canvas")
  }

  return (
    // A button that selects the instance it lies over. To the keyboard and to
    // assistive technology it is the instance: the form underneath is inert.
    <button
      type="button"
      aria-label={`${name}, ${node.definition?.displayName ?? `unknown component ${type}`}`}
      aria-pressed={isSelected}
      data-testid={`canvas-${name}`}
      data-canvas-item={id}
      data-selected={isSelected ? "true" : undefined}
      tabIndex={isTabStop ? 0 : -1}
      style={boxStyle(box)}
      className={cn(
        BOXED,
        "pointer-events-auto cursor-default rounded-sm ring-primary/50 hover:ring-1",
        isSelected && "ring-2 ring-primary hover:ring-2",
        isDragged && "bg-background/70",
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        store.select(id)
        drag.press({ kind: "existing", id }, event)
      }}
      onFocus={() => store.select(id)}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
        const index = shown.indexOf(node)
        const target =
          event.key === "ArrowDown" || event.key === "ArrowRight"
            ? shown[index + 1]
            : event.key === "ArrowUp" || event.key === "ArrowLeft"
              ? shown[index - 1]
              : event.key === "Home"
                ? shown[0]
                : event.key === "End"
                  ? shown.at(-1)
                  : null
        if (target === null) return
        // The arrow keys move the selection here; they do not scroll.
        event.preventDefault()
        go(target)
      }}
    >
      {isSelected ? (
        <span
          aria-hidden="true"
          // A tab on the top edge, at the end where a label never is: it
          // names the selection without covering what is above or inside it.
          className="absolute top-0 right-2 max-w-full -translate-y-1/2 truncate rounded-sm bg-primary px-1.5 font-mono text-xs leading-snug text-primary-foreground"
        >
          {name}
        </span>
      ) : null}
    </button>
  )
}
