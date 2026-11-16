import * as React from "react"
import { CircleHelpIcon } from "lucide-react"

import { resolveSettings, ThemeStylesContext } from "@/forms/runtime"

import { AppearanceEditor } from "../appearance/appearance-editor"
import { useDesigner, useDesignerContext } from "../context"
import { countInside, type Outline, type OutlineNode } from "../model/schema"
import { ownerOf } from "../model/settings"
import { useBoundEntity } from "../binding"
import { bindingProblemsOf } from "../model/binding"
import { problemsOf } from "../model/problems"
import { PanelTitle } from "../panel-title"
import type { EditorContext } from "./editors"
import { FormProperties } from "./form-properties"
import { IdentitySection } from "./identity"
import { ProblemsList } from "./problems-list"
import { useEpoch } from "./panel-run"
import { PanelSection } from "./property-row"
import { SettingsEditor } from "./settings-editor"

/**
 * The properties panel (spec section 3): everything about the selection,
 * generated from its component's definition. With nothing selected, the
 * form's own properties.
 */
export function PropertiesPanel() {
  const { store } = useDesignerContext()
  const document = useDesigner((snapshot) => snapshot.editor.document)
  const selection = useDesigner((snapshot) => snapshot.editor.selection)
  const outline = store.schema.outline(document)
  const node = selection === null ? undefined : outline.byId.get(selection)

  return (
    <section
      aria-labelledby="designer-properties-title"
      data-testid="designer-properties"
      className="flex min-h-0 flex-1 flex-col border-t"
    >
      <PanelTitle id="designer-properties-title">Properties</PanelTitle>
      <div
        // A new element for another selection: it starts at the top, where its problems are.
        key={selection ?? "form"}
        data-testid="designer-properties-body"
        // Positioned, so that what is hidden for the eye inside it scrolls with it.
        className="relative min-h-0 flex-1 overflow-y-auto pb-4 -outline-offset-2"
      >
        {node ? (
          // Keyed by instance: another selection starts with fresh drafts and no errors.
          <InstanceProperties key={node.instance.id} node={node} outline={outline} />
        ) : (
          <>
            <p
              data-testid="designer-properties-empty"
              className="px-4 pb-3 text-xs text-muted-foreground"
            >
              Nothing is selected. Select a component on the canvas or in the outline to edit it.
              Below are the form&rsquo;s own properties.
            </p>
            <FormProperties document={document} />
          </>
        )}
      </div>
    </section>
  )
}

/** How many components an instance holds in regions it does not show. */
function hiddenInside(node: OutlineNode): number {
  let count = 0
  for (const region of node.regions) {
    if (node.shown && !region.shown) {
      for (const child of region.children) count += 1 + countInside(child)
    }
  }
  return count
}

function InstanceProperties({ node, outline }: { node: OutlineNode; outline: Outline }) {
  const { store } = useDesignerContext()
  const { instance, definition } = node
  const Icon = definition?.icon ?? CircleHelpIcon
  const bound = useBoundEntity()
  const problems = React.useMemo(
    () => [...problemsOf(node), ...bindingProblemsOf(node, bound, store.schema)],
    [node, bound, store],
  )
  const epoch = useEpoch()
  // What the theme sets for this kind of component: what an unset style inherits (spec 3.4).
  const themeStyles = React.useContext(ThemeStylesContext)[instance.type]

  // The part pointed at belongs to this selection: let it go with it.
  React.useEffect(() => () => store.setHighlight(null), [store])

  const context = React.useMemo<EditorContext>(
    () => ({
      resolved: definition ? resolveSettings(definition.settings, instance.settings).settings : {},
      rules: definition?.rules ?? [],
      storedRegions: Object.keys(instance.regions ?? {}),
      showRegion: (region) => store.showRegion(instance.id, region),
    }),
    [definition, instance, store],
  )

  return (
    <>
      <div className="flex items-center gap-2.5 px-4 pb-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <dl className="flex min-w-0 flex-col">
          <dt className="sr-only">Name</dt>
          <dd
            data-testid="designer-properties-name"
            className="truncate font-mono font-medium text-foreground"
          >
            {instance.name}
          </dd>
          <dt className="sr-only">Type</dt>
          <dd data-testid="designer-properties-type" className="text-xs text-muted-foreground">
            {definition?.displayName ?? `Unknown component “${instance.type}”`}
          </dd>
        </dl>
      </div>
      {node.shown ? null : (
        <p
          data-testid="designer-properties-hidden"
          className="px-4 pb-3 text-xs text-muted-foreground"
        >
          The form does not show this component: it is stored in a region its container does not
          show now. Drag it back into the form, or delete it.
        </p>
      )}
      <ProblemsList problems={problems} />
      <IdentitySection node={node} outline={outline} />
      {definition ? (
        <>
          <SettingsEditor
            target={instance.id}
            owner={ownerOf(definition)}
            stored={instance.settings}
            context={context}
            hidden={hiddenInside(node)}
          />
          <PanelSection title="Appearance" testId="props-appearance">
            <AppearanceEditor
              slots={definition.slots}
              styles={instance.styles}
              defaults={{
                label: "From the theme",
                styles: themeStyles,
                fallbackLabel: "Default",
                setLabel: "Set here",
              }}
              onChange={(slot, property, value, run) =>
                store.run({
                  type: "set-style",
                  id: instance.id,
                  slot,
                  property,
                  value,
                  ...(run ? { merge: run } : {}),
                })
              }
              onResetSlot={(slot) => store.run({ type: "reset-slot", id: instance.id, slot })}
              onRunEnd={(run, keep) =>
                store.run(
                  keep ? { type: "end-run", merge: run } : { type: "revert-run", merge: run },
                )
              }
              resetKey={epoch}
              onPoint={(slot) =>
                store.setHighlight(slot === null ? null : { id: instance.id, slot })
              }
            />
          </PanelSection>
        </>
      ) : null}
    </>
  )
}
