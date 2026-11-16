import * as React from "react"
import { cn } from "cn"
import { FileWarningIcon } from "lucide-react"

import { FORM_FORMAT_VERSION, type FormDocument } from "@/generated"

import { controlId, FormContext, type FormContextValue, revealAndFocus } from "./context"
import type { FormMode, Registry } from "./definition"
import type { DesignSurface } from "./design"
import { GAP_CLASS } from "./layout"
import { buildModel, type FormModel, type FormNode } from "./model"
import { ComponentBoundary, ComponentError, UnknownComponent } from "./placeholders"
import { FormStore, type PathProblem } from "./store"
import type { NestedValues } from "./values"

export type FormRendererProps = {
  document: FormDocument
  /** The component types that may appear in the document. */
  registry: Registry
  mode: FormMode
  /** Called with the values, nested by data path, when a submit is valid. */
  onSubmit?: (values: NestedValues) => void
  /**
   * Like `onSubmit`, for a host that stores the values: it is also handed
   * the way to show what the server made of them (Phase 5, ADR 0011).
   */
  onSave?: (values: NestedValues, form: SubmittedForm) => void
  /** Called after the form was reset to its defaults. */
  onReset?: () => void
  /**
   * Given by the designer: the form is being designed, not filled in. The
   * components render as in edit mode, each instance and region wrapped by
   * the surface, and the form cannot be submitted (ADR 0008).
   */
  design?: DesignSurface
  /**
   * The values the form opens with, nested by data path: a loaded row
   * (Phase 5, ADR 0011). A field without one starts from its default. When
   * another object is given, the form starts again from it.
   */
  values?: NestedValues
  /**
   * Data paths whose inputs are shown read-only whatever the mode: the
   * read-only properties of a bound form's entity.
   */
  readOnlyPaths?: ReadonlySet<string>
}

/** What a host can do with a form after a valid submit. */
export type SubmittedForm = {
  /**
   * Shows problems found with the submitted values on the fields bound to
   * their paths, and moves focus to the first. Returns the problems no field
   * on screen could take, for the host to show itself.
   */
  readonly showProblems: (problems: readonly PathProblem[]) => readonly PathProblem[]
}

/** The name the form's own top-level list goes by where a region needs one. */
const ROOT_REGION = "components"

/**
 * Renders a form document in edit or read-only mode (spec section 6).
 * Values live in a store that belongs to this component, so they survive a
 * switch between the two modes.
 */
export function FormRenderer(props: FormRendererProps) {
  // A document in another format need not have this format's shape, so
  // nothing else about it is read (ADR 0003).
  if (props.document.formatVersion !== FORM_FORMAT_VERSION) {
    return <UnsupportedVersion version={props.document.formatVersion} />
  }
  return <KnownForm {...props} />
}

/** A document made ready to render, with the store that holds its values. */
type Prepared = {
  readonly form: FormDocument
  readonly registry: Registry
  readonly model: FormModel
  readonly store: FormStore
}

function prepare(form: FormDocument, registry: Registry, values?: NestedValues): Prepared {
  const model = buildModel(form, registry)
  return { form, registry, model, store: new FormStore(model.fields, values) }
}

function KnownForm({
  document: form,
  registry,
  mode,
  onSubmit,
  onReset,
  onSave,
  design,
  values,
  readOnlyPaths,
}: FormRendererProps) {
  const uid = React.useId()

  // State, not a memo: the store holds what a person has typed, so it must
  // live exactly as long as the document it was built for.
  const [prepared, setPrepared] = React.useState(() => prepare(form, registry, values))
  let current = prepared
  if (prepared.form !== form || prepared.registry !== registry) {
    current = prepare(form, registry, values)
    setPrepared(current)
  }
  const { model, store } = current

  // Other loaded values (the row as saved, or reloaded): the same store
  // starts again from them, so focus and the page stay where they are.
  const loaded = React.useRef(values)
  React.useEffect(() => {
    if (loaded.current === values) return
    loaded.current = values
    store.load(values)
  }, [store, values])

  // The handlers are read through a ref so that the context value, and with
  // it every field, does not change when the host passes new functions.
  const handlers = React.useRef({ onSubmit, onReset, onSave })
  React.useEffect(() => {
    handlers.current = { onSubmit, onReset, onSave }
  })

  const context = React.useMemo<FormContextValue>(() => {
    const submit = () => {
      const result = store.submit()
      if (result.valid) {
        handlers.current.onSubmit?.(result.values)
        handlers.current.onSave?.(result.values, {
          showProblems(problems) {
            const { first, unplaced } = store.showProblems(problems)
            if (first !== null) {
              revealAndFocus(window.document.getElementById(controlId(uid, first)))
            }
            return unplaced
          },
        })
      } else {
        revealAndFocus(window.document.getElementById(controlId(uid, result.firstInvalid)))
      }
    }
    const reset = () => {
      store.reset()
      handlers.current.onReset?.()
    }
    return { store, uid, actions: { submit, reset } }
  }, [store, uid])

  // While a pointer is pressed inside the form, leaving a field is not judged
  // until the press is over (see `FormStore.hold`). The release waits a tick,
  // so the click that ends the press has been handled first.
  React.useEffect(() => {
    let timer: number | undefined
    const release = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => store.release())
    }
    window.addEventListener("pointerup", release, true)
    window.addEventListener("pointercancel", release, true)
    return () => {
      window.removeEventListener("pointerup", release, true)
      window.removeEventListener("pointercancel", release, true)
      window.clearTimeout(timer)
      store.release()
    }
  }, [store])

  const className = cn("flex flex-col", GAP_CLASS[model.gap])

  if (design) {
    // Not a <form>: a form being designed has nothing to submit.
    return (
      <FormContext value={context}>
        <div data-testid="form" data-mode="design" className={className}>
          <design.Region parent={null} name={ROOT_REGION} isEmpty={model.nodes.length === 0}>
            <NodeList nodes={model.nodes} mode="edit" design={design} />
          </design.Region>
        </div>
      </FormContext>
    )
  }

  const content = <NodeList nodes={model.nodes} mode={mode} readOnlyPaths={readOnlyPaths} />

  return (
    <FormContext value={context}>
      {mode === "edit" ? (
        <form
          // The form validates itself; the browser's own bubbles stay away.
          noValidate
          data-testid="form"
          data-mode={mode}
          className={className}
          onPointerDownCapture={() => store.hold()}
          onSubmit={(event) => {
            event.preventDefault()
            context.actions.submit()
          }}
        >
          {content}
        </form>
      ) : (
        <div data-testid="form" data-mode={mode} className={className}>
          {content}
        </div>
      )}
    </FormContext>
  )
}

type NodeProps = { mode: FormMode; design?: DesignSurface; readOnlyPaths?: ReadonlySet<string> }

function NodeList({
  nodes,
  mode,
  design,
  readOnlyPaths,
}: NodeProps & { nodes: readonly FormNode[] }) {
  return nodes.map((node) => (
    <NodeView
      key={node.instance.id}
      node={node}
      mode={mode}
      design={design}
      readOnlyPaths={readOnlyPaths}
    />
  ))
}

const NodeView = React.memo(function NodeView({
  node,
  mode,
  design,
  readOnlyPaths,
}: NodeProps & { node: FormNode }) {
  const rendered = renderNode(node, mode, design, readOnlyPaths)
  if (!design) return rendered
  return (
    <design.Instance
      instance={node.instance}
      definition={node.kind === "unknown" ? null : node.definition}
    >
      {rendered}
    </design.Instance>
  )
})

function renderNode(
  node: FormNode,
  mode: FormMode,
  design: DesignSurface | undefined,
  readOnlyPaths: ReadonlySet<string> | undefined,
) {
  if (node.kind === "unknown") return <UnknownComponent instance={node.instance} />
  if (node.kind === "broken") {
    return <ComponentError instance={node.instance}>{node.message}</ComponentError>
  }
  return (
    <ComponentBoundary instance={node.instance}>
      {node.prepared.render(
        // An input bound to a read-only property shows its value and no control.
        node.instance.bind !== undefined && readOnlyPaths?.has(node.instance.bind)
          ? "read-only"
          : mode,
        (name) => {
          const children = node.regions.get(name) ?? []
          const list = (
            <NodeList nodes={children} mode={mode} design={design} readOnlyPaths={readOnlyPaths} />
          )
          if (!design) return list
          return (
            <design.Region parent={node.instance} name={name} isEmpty={children.length === 0}>
              {list}
            </design.Region>
          )
        },
        design ? { shownRegion: design.shownRegion?.(node.instance.id) ?? null } : undefined,
      )}
    </ComponentBoundary>
  )
}

function UnsupportedVersion({ version }: { version: unknown }) {
  return (
    <div
      role="alert"
      data-testid="form-unsupported-version"
      className="flex items-start gap-3 rounded-lg border border-dashed border-input bg-muted/50 p-4 text-sm"
    >
      <FileWarningIcon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <div className="flex flex-col gap-0.5">
        <p className="font-medium text-foreground">This form cannot be shown</p>
        <p className="text-muted-foreground">
          It is saved in format version {String(version)}. This version of the app reads format
          version {FORM_FORMAT_VERSION}. Update the app to open it.
        </p>
      </div>
    </div>
  )
}
