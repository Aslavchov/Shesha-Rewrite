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
import {
  EMPTY_ATTRIBUTE,
  ITEM_ATTRIBUTE,
  measureCanvas,
  measureSlot,
  measureSwitches,
  type RegionSwitch,
  sameBoxes,
  sameLayout,
  sameSwitches,
} from "./canvas-measure"
import { useDesigner, useDesignerContext, useDrag } from "./context"
import { SCROLL_AREA_ATTRIBUTE } from "./drag/controller"
import type { Outline, OutlineNode } from "./model/schema"
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

/** What the canvas draws over the form besides the instances: tabs to switch, and a part pointed at. */
type Extras = { readonly switches: readonly RegionSwitch[]; readonly highlight: readonly Box[] }

const NO_EXTRAS: Extras = { switches: [], highlight: [] }

// --- The canvas in design mode -----------------------------------------------------

function DesignCanvas({ document: form }: { document: FormDocument }) {
  const { store, drag } = useDesignerContext()
  const outline = store.schema.outline(form)
  const selection = useDesigner((snapshot) => snapshot.editor.selection)
  const focus = useDesigner((snapshot) => snapshot.focus)
  const shownRegions = useDesigner((snapshot) => snapshot.shownRegions)
  const highlight = useDesigner((snapshot) => snapshot.highlight)

  // A new surface only when the shown regions change: the renderer's
  // instances stay memoised in between.
  const surface = React.useMemo<DesignSurface>(
    () => ({
      Instance: InstanceMarker,
      Region: RegionSlot,
      shownRegion: (id) => shownRegions.get(id) ?? null,
    }),
    [shownRegions],
  )

  const paneRef = React.useRef<HTMLElement>(null)
  /** The element the form's boxes are measured from, and the overlay is placed in. */
  const originRef = React.useRef<HTMLDivElement>(null)
  /** The rendered form itself, without the overlay. */
  const formRef = React.useRef<HTMLDivElement>(null)
  const [layout, setLayout] = React.useState<CanvasLayout>(EMPTY_LAYOUT)
  const layoutRef = React.useRef(layout)
  const [extras, setExtras] = React.useState<Extras>(NO_EXTRAS)
  const extrasRef = React.useRef(extras)
  const highlightRef = React.useRef(highlight)

  const measure = React.useCallback(() => {
    const origin = originRef.current
    if (!origin) return
    const measured = measureCanvas(origin, origin)
    if (!sameLayout(layoutRef.current, measured)) {
      layoutRef.current = measured
      setLayout(measured)
    }
    const pointed = highlightRef.current
    const next: Extras = {
      switches: measureSwitches(origin, origin),
      highlight: pointed ? measureSlot(origin, origin, pointed.id, pointed.slot) : [],
    }
    const current = extrasRef.current
    if (
      sameSwitches(current.switches, next.switches) &&
      sameBoxes(current.highlight, next.highlight)
    ) {
      return
    }
    extrasRef.current = next
    setExtras(next)
  }, [])

  // After every render: nothing else can say when the form's layout changed,
  // and measuring it is cheap. The boxes are in place before the browser paints.
  React.useLayoutEffect(() => {
    highlightRef.current = highlight
  })
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

  // And when a component changes what it shows by itself, after the render
  // the canvas measured: a tab panel shown by its own effect has the same
  // size as the one it replaces, so nothing else would say so.
  React.useEffect(() => {
    const rendered = formRef.current
    if (!rendered || typeof MutationObserver === "undefined") return
    const observer = new MutationObserver(measure)
    observer.observe(rendered, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden", "class", "style"],
    })
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
        if (!(event.target as Element).closest("[data-canvas-item], [data-canvas-switch]")) {
          store.select(null)
        }
      }}
      onFocus={() => store.noteSurface("canvas")}
    >
      {/* oxlint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div ref={originRef} className={cn(PAPER, "relative")}>
        <Card>
          <CardContent ref={formRef} inert>
            <FormRenderer
              document={form}
              registry={store.schema.registry}
              mode="edit"
              design={surface}
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
          {extras.switches.map((region) => (
            <RegionSwitchProxy
              key={`${region.owner}/${region.region}`}
              region={region}
              outline={outline}
            />
          ))}
          {extras.highlight.map((box, index) => (
            <div
              // The boxes of one part have no identity but their order.
              // oxlint-disable-next-line react/no-array-index-key
              key={index}
              data-testid="canvas-slot-highlight"
              style={boxStyle(box)}
              className={cn(
                BOXED,
                "rounded-xs outline-2 outline-offset-2 outline-primary outline-dashed",
              )}
            >
              {index === 0 && highlight ? (
                // At the end, where a label never is.
                <span className="absolute right-0 bottom-full mb-1 rounded-sm bg-primary px-1.5 font-mono text-xs leading-snug text-primary-foreground">
                  {highlight.slot}
                </span>
              ) : null}
            </div>
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
const EDGE_OUTSET = 5

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
        "group/proxy pointer-events-auto cursor-default rounded-sm",
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
      {/* The outline, a little outside the instance, so its content never touches it. */}
      <span
        aria-hidden="true"
        data-slot="canvas-outline"
        className={cn(
          "pointer-events-none absolute -inset-1 rounded-md ring-primary/50 group-hover/proxy:ring-1",
          isSelected && "ring-2 ring-primary group-hover/proxy:ring-2",
        )}
      />
      {isSelected ? (
        <span
          aria-hidden="true"
          // A tab on the top edge, at the end where a label never is: it
          // names the selection without covering what is above or inside it.
          className="absolute -top-1 right-2 max-w-full -translate-y-1/2 truncate rounded-sm bg-primary px-1.5 font-mono text-xs leading-snug text-primary-foreground"
        >
          {name}
        </span>
      ) : null}
    </button>
  )
}

/**
 * A box over a tab of a container on the canvas. Pressing it selects the
 * container and shows that tab, whose region then takes drops (spec 4). The
 * keyboard reaches the same through the properties panel and the outline.
 */
function RegionSwitchProxy({ region, outline }: { region: RegionSwitch; outline: Outline }) {
  const { store } = useDesignerContext()
  const node = outline.byId.get(region.owner)
  const isShown = useDesigner(
    (snapshot) => snapshot.shownRegions.get(region.owner) === region.region,
  )
  if (!node) return null
  const label = node.regions.find((candidate) => candidate.name === region.region)?.label
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Show ${label ?? region.region} of ${node.instance.name}`}
      aria-pressed={isShown}
      data-testid={`canvas-switch-${node.instance.name}-${region.region}`}
      data-canvas-switch={region.region}
      style={boxStyle(region.box)}
      className={cn(BOXED, "pointer-events-auto cursor-pointer rounded-md hover:bg-primary/10")}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        // Not a drag: a press here only chooses the tab.
        event.preventDefault()
        store.select(region.owner)
        store.showRegion(region.owner, region.region)
      }}
    />
  )
}
