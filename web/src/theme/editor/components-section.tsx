import * as React from "react"
import { cn } from "cn"
import { CircleHelpIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AppearanceEditor } from "@/designer/appearance/appearance-editor"
import { slotLabel } from "@/designer/appearance/colours"

import { useEndRun, useThemeEditor, useThemeEditorContext } from "./context"
import { EditorSection } from "./section"

/**
 * A default look for each component (spec 3.2 and 4): pick a registered
 * component and style its parts with the Appearance editor, the same one,
 * with the same slots and properties, as an instance's panel in the designer.
 * Nothing here names a component type: the list is the registry.
 */
export function ComponentsSection() {
  const { store, registry } = useThemeEditorContext()
  const components = useThemeEditor((snapshot) => snapshot.editor.document.components)
  const selected = useThemeEditor((snapshot) => snapshot.component)
  const definitions = [...registry.values()]
  // What the theme holds for types this build does not know: kept, and flagged.
  const unknown = Object.keys(components ?? {}).filter((type) => !registry.has(type))

  return (
    <EditorSection
      testId="theme-components"
      title="Component defaults"
      description="How each kind of component looks unless a form's author overrides it on one instance."
    >
      <ul aria-label="Components" className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {definitions.map((definition) => {
          const count = Object.keys(components?.[definition.type] ?? {}).length
          const isSelected = selected === definition.type
          return (
            <li key={definition.type} className="min-w-0">
              <button
                type="button"
                data-testid={`theme-component-${definition.type}`}
                aria-pressed={isSelected}
                className={cn(
                  "flex h-8 w-full min-w-0 items-center gap-2 rounded-md border border-transparent px-2 text-left text-sm hover:bg-muted",
                  "aria-pressed:border-primary/30 aria-pressed:bg-primary/10 aria-pressed:font-medium",
                )}
                onClick={() => store.selectComponent(isSelected ? null : definition.type)}
              >
                <definition.icon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate">{definition.displayName}</span>
                {count > 0 ? (
                  <span className="shrink-0 rounded-sm bg-primary/10 px-1.5 text-xs text-primary">
                    {count}
                    <span className="sr-only"> {count === 1 ? "part" : "parts"} styled</span>
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>

      {unknown.length > 0 ? (
        <ul aria-label="Unknown components" className="flex flex-col gap-1">
          {unknown.map((type) => (
            <li
              key={type}
              data-testid={`theme-component-${type}`}
              data-unknown="true"
              className="flex items-center gap-2 rounded-md border border-dashed border-input bg-muted/50 px-2 py-1.5"
            >
              <CircleHelpIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                <span className="font-mono font-medium text-foreground">{type}</span> is not a
                component this version of the app knows. Its styles are kept, and nothing uses them.
              </p>
              <Button
                variant="ghost"
                size="sm"
                data-testid={`theme-component-${type}-remove`}
                onClick={() => store.run({ type: "reset-component", component: type, name: type })}
              >
                <Trash2Icon aria-hidden="true" data-icon="inline-start" />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected !== null && registry.has(selected) ? (
        <ComponentDefaults key={selected} type={selected} />
      ) : (
        <p className="text-xs text-muted-foreground">
          Choose a component to style its parts. The preview shows it as you go.
        </p>
      )}
    </EditorSection>
  )
}

function ComponentDefaults({ type }: { type: string }) {
  const { store, registry } = useThemeEditorContext()
  const styles = useThemeEditor((snapshot) => snapshot.editor.document.components?.[type])
  const epoch = useThemeEditor((snapshot) => snapshot.epoch)
  const endRun = useEndRun()
  const definition = registry.get(type)

  // The part pointed at belongs to this component: let it go with it.
  React.useEffect(() => () => store.setHighlight(null), [store])
  if (!definition) return null

  // Styles for parts the component does not have (a slot renamed since): kept until removed.
  const strays = Object.keys(styles ?? {}).filter((slot) => !definition.slots.includes(slot))

  return (
    <div data-testid="theme-component-defaults" className="flex flex-col gap-2 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">{definition.displayName}</h3>
        {styles ? (
          <Button
            variant="ghost"
            size="sm"
            data-testid="theme-component-reset"
            onClick={() =>
              store.run({ type: "reset-component", component: type, name: definition.displayName })
            }
          >
            Reset all
          </Button>
        ) : null}
      </div>
      {strays.map((slot) => (
        <p
          key={slot}
          data-testid={`theme-stray-slot-${slot}`}
          className="flex items-center gap-2 rounded-md border border-dashed border-input bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground"
        >
          <span className="min-w-0 flex-1">
            {definition.displayName} has no part called “{slotLabel(slot).toLowerCase()}”. Its
            styles are kept, and nothing uses them.
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => store.run({ type: "reset-slot", component: type, slot })}
          >
            Remove
          </Button>
        </p>
      ))}
      <AppearanceEditor
        slots={definition.slots}
        styles={styles}
        defaults={{ label: "Component default", setLabel: "Set in the theme" }}
        onChange={(slot, property, value, run) =>
          store.run({
            type: "set-style",
            component: type,
            slot,
            property,
            value,
            ...(run ? { merge: run } : {}),
          })
        }
        onResetSlot={(slot) => store.run({ type: "reset-slot", component: type, slot })}
        onRunEnd={endRun}
        resetKey={epoch}
        onPoint={(slot) => store.setHighlight(slot)}
        testIdPrefix="theme"
      />
    </div>
  )
}
