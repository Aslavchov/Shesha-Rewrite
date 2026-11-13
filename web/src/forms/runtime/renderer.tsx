import * as React from "react"
import { cn } from "cn"
import { FileWarningIcon } from "lucide-react"

import { FORM_FORMAT_VERSION, type FormDocument } from "@/generated"

import { controlId, FormContext, type FormContextValue } from "./context"
import type { FormMode, Registry } from "./definition"
import { GAP_CLASS } from "./layout"
import { buildModel, type FormNode } from "./model"
import { ComponentBoundary, ComponentError, UnknownComponent } from "./placeholders"
import { FormStore } from "./store"
import type { NestedValues } from "./values"

export type FormRendererProps = {
  document: FormDocument
  /** The component types that may appear in the document. */
  registry: Registry
  mode: FormMode
  /** Called with the values, nested by data path, when a submit is valid. */
  onSubmit?: (values: NestedValues) => void
  /** Called after the form was reset to its defaults. */
  onReset?: () => void
}

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

function KnownForm({ document: form, registry, mode, onSubmit, onReset }: FormRendererProps) {
  const uid = React.useId()
  const model = React.useMemo(() => buildModel(form, registry), [form, registry])
  const store = React.useMemo(() => new FormStore(model.fields), [model])

  // The handlers are read through a ref so that the context value, and with
  // it every field, does not change when the host passes new functions.
  const handlers = React.useRef({ onSubmit, onReset })
  React.useEffect(() => {
    handlers.current = { onSubmit, onReset }
  })

  const context = React.useMemo<FormContextValue>(() => {
    const submit = () => {
      const result = store.submit()
      if (result.valid) {
        handlers.current.onSubmit?.(result.values)
      } else {
        window.document.getElementById(controlId(uid, result.firstInvalid))?.focus()
      }
    }
    const reset = () => {
      store.reset()
      handlers.current.onReset?.()
    }
    return { store, uid, actions: { submit, reset } }
  }, [store, uid])

  const className = cn("flex flex-col", GAP_CLASS[model.gap])
  const content = <NodeList nodes={model.nodes} mode={mode} />

  return (
    <FormContext value={context}>
      {mode === "edit" ? (
        <form
          // The form validates itself; the browser's own bubbles stay away.
          noValidate
          data-testid="form"
          data-mode={mode}
          className={className}
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

function NodeList({ nodes, mode }: { nodes: readonly FormNode[]; mode: FormMode }) {
  return nodes.map((node) => <NodeView key={node.instance.id} node={node} mode={mode} />)
}

const NodeView = React.memo(function NodeView({ node, mode }: { node: FormNode; mode: FormMode }) {
  if (node.kind === "unknown") return <UnknownComponent instance={node.instance} />
  if (node.kind === "broken") {
    return <ComponentError instance={node.instance}>{node.message}</ComponentError>
  }
  return (
    <ComponentBoundary instance={node.instance}>
      {node.prepared.render(mode, (name) => (
        <NodeList nodes={node.regions.get(name) ?? []} mode={mode} />
      ))}
    </ComponentBoundary>
  )
})

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
