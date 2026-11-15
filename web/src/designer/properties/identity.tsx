import { Input } from "@/components/ui/input"

import { useDesignerContext } from "../context"
import { pathsClash } from "../model/names"
import { nameProblem, pathProblem } from "../model/rules"
import type { Outline, OutlineNode } from "../model/schema"
import { useCheckedText } from "./panel-run"
import { describedBy } from "./described-by"
import { PanelSection, PropertyRow } from "./property-row"

/**
 * An instance's name and data path (spec 3.2), checked as they are typed
 * with the server's own rules. A value that cannot be stored says why and is
 * not applied. The id never changes and is not shown.
 */
export function IdentitySection({ node, outline }: { node: OutlineNode; outline: Outline }) {
  const isBound = node.instance.bind !== undefined || node.definition?.kind === "input"
  return (
    <PanelSection title="Identity" testId="props-identity">
      <NameField node={node} outline={outline} />
      {isBound ? <PathField node={node} outline={outline} /> : null}
    </PanelSection>
  )
}

function NameField({ node, outline }: { node: OutlineNode; outline: Outline }) {
  const { store } = useDesignerContext()
  const { id, name } = node.instance
  const help = "How scripts and the data refer to this component. Letters, digits, _ and $."
  const field = useCheckedText(
    name,
    (text) => {
      const taken = outline.order.find(
        (other) => other.instance.id !== id && other.instance.name === text,
      )
      return (
        nameProblem(text) ?? (taken ? `“${text}” is already the name of another component.` : null)
      )
    },
    (text, run) => store.run({ type: "rename", id, name: text, merge: run }),
  )

  return (
    <PropertyRow id="props-name-input" label="Name" help={help} error={field.error}>
      <Input
        id="props-name-input"
        data-testid="props-name"
        value={field.draft}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={field.error !== null || undefined}
        aria-describedby={describedBy("props-name-input", field.error, help)}
        onFocus={field.onFocus}
        onBlur={field.onBlur}
        onChange={(event) => field.onChange(event.target.value)}
        className="font-mono"
      />
    </PropertyRow>
  )
}

function PathField({ node, outline }: { node: OutlineNode; outline: Outline }) {
  const { store } = useDesignerContext()
  const { id, bind = "" } = node.instance
  const help = "Where the value is stored when the form is submitted: names joined by dots."
  const field = useCheckedText(
    bind,
    (text) => {
      const clash = outline.order.find(
        (other) =>
          other.instance.id !== id &&
          typeof other.instance.bind === "string" &&
          pathsClash(text, other.instance.bind),
      )
      return (
        pathProblem(text) ??
        (clash
          ? clash.instance.bind === text
            ? `${clash.instance.name} already stores its value under ${text}.`
            : `This clashes with ${clash.instance.bind} (${clash.instance.name}): one would hold the other.`
          : null)
      )
    },
    (text, run) => store.run({ type: "bind", id, path: text, merge: run }),
  )

  return (
    <PropertyRow id="props-bind-input" label="Data path" help={help} error={field.error}>
      <Input
        id="props-bind-input"
        data-testid="props-bind"
        value={field.draft}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={field.error !== null || undefined}
        aria-describedby={describedBy("props-bind-input", field.error, help)}
        onFocus={field.onFocus}
        onBlur={field.onBlur}
        onChange={(event) => field.onChange(event.target.value)}
        className="font-mono"
      />
    </PropertyRow>
  )
}
