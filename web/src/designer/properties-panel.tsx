import { CircleHelpIcon } from "lucide-react"

import { useDesigner, useDesignerContext } from "./context"
import { PanelTitle } from "./panel-title"

/**
 * The properties area (spec 3.2). In this phase it says what is selected: its
 * type and its name. Settings and styles are edited here from Phase 3.
 */
export function PropertiesPanel() {
  const { store } = useDesignerContext()
  const document = useDesigner((snapshot) => snapshot.editor.document)
  const selection = useDesigner((snapshot) => snapshot.editor.selection)
  const node = selection === null ? undefined : store.schema.outline(document).byId.get(selection)
  const Icon = node?.definition?.icon ?? CircleHelpIcon

  return (
    <section
      aria-labelledby="designer-properties-title"
      data-testid="designer-properties"
      className="shrink-0 border-t pb-4"
    >
      <PanelTitle id="designer-properties-title">Properties</PanelTitle>
      <div className="flex flex-col gap-3 px-4">
        {node ? (
          <>
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <dl className="flex min-w-0 flex-col">
                <dt className="sr-only">Name</dt>
                <dd
                  data-testid="designer-properties-name"
                  className="truncate font-mono font-medium text-foreground"
                >
                  {node.instance.name}
                </dd>
                <dt className="sr-only">Type</dt>
                <dd
                  data-testid="designer-properties-type"
                  className="text-xs text-muted-foreground"
                >
                  {node.definition?.displayName ?? `Unknown component “${node.instance.type}”`}
                </dd>
              </dl>
            </div>
            {node.shown ? null : (
              <p data-testid="designer-properties-hidden" className="text-xs text-muted-foreground">
                The form does not show this component: it is stored in a region its container no
                longer has. Drag it back into the form, or delete it.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Settings and styles arrive in Phase 3. Until then a component keeps its defaults.
            </p>
          </>
        ) : (
          <p data-testid="designer-properties-empty" className="text-xs text-muted-foreground">
            Nothing is selected. Select a component on the canvas or in the outline to see its type
            and name. Settings arrive in Phase 3.
          </p>
        )}
      </div>
    </section>
  )
}
