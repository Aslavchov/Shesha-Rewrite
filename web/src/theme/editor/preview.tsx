import * as React from "react"
import { cn } from "cn"
import { FileTextIcon, HomeIcon, MoonIcon, PencilRulerIcon, SunIcon } from "lucide-react"

import { BrandMark } from "@/app/layout/brand-mark"
import { type SegmentedOption, SegmentedSwitch } from "@/components/segmented-switch"
import { Button } from "@/components/ui/button"
import { slotLabel } from "@/designer/appearance/colours"
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

/** The height a part's name tag needs above the part, in pixels. */
const TAG_ROOM = 24

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
  const [boxes, setBoxes] = React.useState<readonly Box[]>([])

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
    const next: Box[] = []
    if (frame && sample && slot !== null) {
      const from = frame.getBoundingClientRect()
      const parts =
        sample.getAttribute(SLOT_ATTRIBUTE) === slot
          ? [sample]
          : [...sample.querySelectorAll(`[${SLOT_ATTRIBUTE}="${slot}"]`)].filter(
              // Not the parts of a component held inside this one: the
              // nearest component root around a part is this sample's.
              (part) => part.parentElement?.closest(`[${SLOT_ATTRIBUTE}="root"]`) === sample,
            )
      for (const part of parts) {
        const box = part.getBoundingClientRect()
        if (box.width === 0 && box.height === 0) continue
        next.push({
          left: box.left - from.left + frame.scrollLeft,
          top: box.top - from.top + frame.scrollTop,
          width: box.width,
          height: box.height,
        })
      }
    }
    // Measuring the page is reading something outside React; the result is state.
    // oxlint-disable-next-line react/set-state-in-effect
    setBoxes((current) => (sameBoxes(current, next) ? current : next))
    // `theme` and `mode` are not read here, but either can move every part.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [component, slot, theme, mode, sampleOf])

  return (
    <section aria-label="Preview" className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-20">
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
        className="relative overflow-hidden rounded-xl border shadow-sm"
      >
        <div className="flex min-w-0">
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
              >
                {index === 0 && slot !== null ? (
                  <span
                    className={cn(
                      "absolute right-0 rounded-sm bg-primary px-1.5 text-xs leading-snug whitespace-nowrap text-primary-foreground",
                      // Below the part when there is no room above it inside the preview.
                      box.top < TAG_ROOM ? "top-full mt-1" : "bottom-full mb-1",
                    )}
                  >
                    {slotLabel(slot)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </ThemeScope>
    </section>
  )
}
