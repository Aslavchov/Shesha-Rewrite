import * as React from "react"
import { cn } from "cn"
import { FileTextIcon, HomeIcon, MoonIcon, PencilRulerIcon, SunIcon } from "lucide-react"

import { BrandMark } from "@/app/layout/brand-mark"
import { type SegmentedOption, SegmentedSwitch } from "@/components/segmented-switch"
import { Button } from "@/components/ui/button"
import { slotLabel } from "@/designer/appearance/colours"
import { placeTag, sameSize, type Size } from "@/designer/canvas-geometry"
import { inkOf } from "@/designer/canvas-measure"
import { FormRenderer, SLOT_ATTRIBUTE } from "@/forms/runtime"
import { APP_NAME } from "@/generated"

import { ThemeScope } from "../scope"
import type { Mode } from "../variables"
import { useThemeEditor, useThemeEditorContext } from "./context"
import { sampleForm, sampleInstanceName } from "./sample"

const MODE_OPTIONS: readonly SegmentedOption<Mode>[] = [
  { value: "light", label: "Light", icon: SunIcon, testId: "theme-preview-mode-light" },
  { value: "dark", label: "Dark", icon: MoonIcon, testId: "theme-preview-mode-dark" },
]

type Box = { left: number; top: number; width: number; height: number }

/** A box's place, as custom properties: data for display, as on the designer's canvas. */
type BoxStyle = React.CSSProperties & Record<`--box-${keyof Box}`, string>

const boxStyle = (box: Box): BoxStyle => ({
  "--box-left": `${box.left}px`,
  "--box-top": `${box.top}px`,
  "--box-width": `${box.width}px`,
  "--box-height": `${box.height}px`,
})

/** The part pointed at, as it is drawn in the preview's page, and what is around it. */
type Pointed = {
  /** One box per element that is the part. */
  readonly boxes: readonly Box[]
  /** The sample's other parts: what the part's name tag must not cover. */
  readonly others: readonly Box[]
  /** All of the page, scrolled or not: where there is room for the tag. */
  readonly page: Box
}

const NOTHING_POINTED: Pointed = {
  boxes: [],
  others: [],
  page: { left: 0, top: 0, width: 0, height: 0 },
}

const sameBoxes = (a: readonly Box[], b: readonly Box[]) =>
  a.length === b.length &&
  a.every(
    (box, index) =>
      box.left === b[index].left &&
      box.top === b[index].top &&
      box.width === b[index].width &&
      box.height === b[index].height,
  )

/**
 * The live preview (spec 4): the draft, and only here. A miniature of the
 * shell and one of every registered component, rendered by the real renderer
 * inside a theme scope, in light or dark whatever the page uses. It cannot
 * be used: it is there to be looked at.
 */
export function ThemePreview() {
  const { store, registry } = useThemeEditorContext()
  const theme = useThemeEditor((snapshot) => snapshot.editor.document)
  const mode = useThemeEditor((snapshot) => snapshot.previewMode)
  const component = useThemeEditor((snapshot) => snapshot.component)
  const slot = useThemeEditor((snapshot) => snapshot.highlight)
  const form = React.useMemo(() => sampleForm(registry), [registry])
  const frameRef = React.useRef<HTMLDivElement>(null)
  const [pointed, setPointed] = React.useState(NOTHING_POINTED)
  const tagRef = React.useRef<HTMLSpanElement>(null)
  const [tagSize, setTagSize] = React.useState<Size | null>(null)

  /** The sample of the component being styled, if it is on the page. */
  const sampleOf = React.useCallback((type: string | null) => {
    if (type === null) return null
    return (
      frameRef.current?.querySelector(`[data-testid="field-${sampleInstanceName(type)}"]`) ?? null
    )
  }, [])

  // The component being styled is brought into view, inside the preview only.
  React.useEffect(() => {
    const frame = frameRef.current
    const sample = sampleOf(component)
    if (!frame || !sample) return
    const from = frame.getBoundingClientRect()
    const box = sample.getBoundingClientRect()
    if (box.top >= from.top && box.bottom <= from.bottom) return
    const margin = Number.parseFloat(getComputedStyle(frame).scrollPaddingTop) || 0
    frame.scrollTop += box.top - from.top - margin
  }, [component, sampleOf])

  // The part the Appearance editor points at is outlined where it is drawn,
  // measured after every change that could move it.
  React.useLayoutEffect(() => {
    const frame = frameRef.current
    const sample = sampleOf(component)
    let next = NOTHING_POINTED
    if (frame && sample && slot !== null) {
      const from = frame.getBoundingClientRect()
      const boxOf = (part: Element): Box | null => {
        const box = part.getBoundingClientRect()
        if (box.width === 0 && box.height === 0) return null
        return {
          left: box.left - from.left + frame.scrollLeft,
          top: box.top - from.top + frame.scrollTop,
          width: box.width,
          height: box.height,
        }
      }
      // The sample's own parts, not those of a component held inside it: the
      // nearest component root around a part is this sample's.
      const own = [sample, ...sample.querySelectorAll(`[${SLOT_ATTRIBUTE}]`)].filter(
        (part) =>
          part === sample || part.parentElement?.closest(`[${SLOT_ATTRIBUTE}="root"]`) === sample,
      )
      const parts = own.filter(
        (part) => part.getAttribute(SLOT_ATTRIBUTE) === slot && boxOf(part) !== null,
      )
      // The tag belongs to the first. What is around it, or inside it, is not in its way.
      const tagged = parts.at(0)
      const others = own.filter(
        (part) =>
          part.hasAttribute(SLOT_ATTRIBUTE) &&
          part !== tagged &&
          !(tagged && (part.contains(tagged) || tagged.contains(part))),
      )
      const drawn = (boxes: readonly (Box | null)[]) =>
        boxes.filter((box): box is Box => box !== null)
      // Another part is in the way only as far as it is drawn: beside a short label is free.
      const inkIn = (part: Element): Box | null => {
        const ink = inkOf(part)
        return (
          ink && {
            ...ink,
            left: ink.left - from.left + frame.scrollLeft,
            top: ink.top - from.top + frame.scrollTop,
          }
        )
      }
      next = {
        boxes: drawn(parts.map(boxOf)),
        others: drawn(others.map(inkIn)),
        page: { left: 0, top: 0, width: frame.scrollWidth, height: frame.scrollHeight },
      }
    }
    // Measuring the page is reading something outside React; the result is state.
    // oxlint-disable-next-line react/set-state-in-effect
    setPointed((current) =>
      sameBoxes(current.boxes, next.boxes) &&
      sameBoxes(current.others, next.others) &&
      sameBoxes([current.page], [next.page])
        ? current
        : next,
    )
    // `theme` and `mode` are not read here, but either can move every part.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [component, slot, theme, mode, sampleOf])

  // The tag is placed by its size, which is only known once it is drawn.
  React.useLayoutEffect(() => {
    const box = tagRef.current?.getBoundingClientRect()
    const next = box ? { width: box.width, height: box.height } : null
    // oxlint-disable-next-line react/set-state-in-effect
    setTagSize((current) => (sameSize(current, next) ? current : next))
    // None is read here: each is something that draws the tag, or changes its size.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [slot, theme, mode, pointed])

  const { boxes } = pointed
  // Outside the part, and clear of the sample's other parts (Phase 5, section 8).
  const tagPlace =
    boxes.length > 0 && tagSize
      ? placeTag(boxes[0], tagSize, { keepClear: pointed.others, within: pointed.page })
      : null

  return (
    <section
      aria-label="Preview"
      // Beside the controls it stays in view, below the header and the action bar.
      // No taller than what is left of the window, so that all of it can be reached.
      className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[calc(var(--sys-size-header)+var(--page-sticky-height,0px)+var(--sys-space-md))] lg:max-h-[calc(100dvh-var(--sys-size-header)-var(--page-sticky-height,0px)-2*var(--sys-space-md))]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-heading text-base font-medium text-foreground">Preview</h2>
          <p className="text-xs text-muted-foreground">
            The draft, shown only here. The rest of the app keeps the published theme.
          </p>
        </div>
        <SegmentedSwitch
          label="Preview mode"
          options={MODE_OPTIONS}
          value={mode}
          onChange={(next) => store.setPreviewMode(next)}
        />
      </div>
      <ThemeScope
        theme={theme}
        mode={mode}
        data-testid="theme-preview"
        data-mode={mode}
        // To look at, not to use: nothing in it takes focus or a click.
        inert
        aria-label={`The draft theme in ${mode} mode`}
        className="relative flex min-h-0 flex-col overflow-hidden rounded-xl border shadow-sm"
      >
        <div className="flex min-h-0 min-w-0 flex-1">
          <div
            data-testid="theme-preview-sidebar"
            className="hidden w-36 shrink-0 flex-col gap-3 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground sm:flex"
          >
            <div className="flex items-center gap-2">
              <BrandMark />
              <span className="truncate font-heading font-semibold tracking-tight text-foreground">
                {APP_NAME}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {[
                { label: "Home", icon: HomeIcon, isCurrent: false },
                { label: "Forms", icon: FileTextIcon, isCurrent: true },
                { label: "Designer", icon: PencilRulerIcon, isCurrent: false },
              ].map((item) => (
                <span
                  key={item.label}
                  data-testid={item.isCurrent ? "theme-preview-nav-current" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md px-2",
                    item.isCurrent &&
                      "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon aria-hidden="true" className="size-4 shrink-0" />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
          <div
            ref={frameRef}
            data-testid="theme-preview-page"
            className="relative flex max-h-144 min-w-0 flex-1 scroll-pt-4 flex-col gap-5 overflow-y-auto p-5"
          >
            <div className="flex flex-col gap-1">
              <p className="font-heading text-2xl font-semibold tracking-tight">Page title</p>
              <p className="text-muted-foreground">
                Ordinary text, muted text and{" "}
                <span
                  data-testid="theme-preview-link"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  a link
                </span>
                .
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button data-testid="theme-preview-primary">Primary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="destructive" data-testid="theme-preview-destructive">
                Delete
              </Button>
              <span
                data-testid="theme-preview-focus"
                className="flex h-8 items-center rounded-lg border border-input px-2.5 outline-2 outline-offset-2 outline-ring"
              >
                Focused
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium">
              <span className="text-success">Success</span>
              <span className="text-warning">Warning</span>
              <span className="text-info">Information</span>
              <span className="text-destructive">Destructive</span>
            </div>
            <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-xs">
              <FormRenderer document={form} registry={registry} mode="edit" />
            </div>
            {boxes.map((box, index) => (
              <div
                // The boxes of one part have no identity but their order.
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                data-testid="theme-slot-highlight"
                style={boxStyle(box)}
                className="pointer-events-none absolute top-(--box-top) left-(--box-left) h-(--box-height) w-(--box-width) rounded-xs outline-2 outline-offset-2 outline-primary outline-dashed"
              />
            ))}
            {slot !== null && boxes.length > 0 ? (
              <span
                ref={tagRef}
                data-testid="theme-slot-tag"
                style={boxStyle(tagPlace ?? { left: 0, top: 0, width: 0, height: 0 })}
                className={cn(
                  "pointer-events-none absolute top-(--box-top) left-(--box-left) rounded-sm bg-primary px-1.5 text-xs leading-snug whitespace-nowrap text-primary-foreground",
                  // Drawn unseen until its size is known and it can be placed.
                  !tagPlace && "invisible",
                )}
              >
                {slotLabel(slot)}
              </span>
            ) : null}
          </div>
        </div>
      </ThemeScope>
    </section>
  )
}
