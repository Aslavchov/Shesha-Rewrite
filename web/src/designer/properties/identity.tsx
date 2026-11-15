import * as React from "react"

import { Input } from "@/components/ui/input"

import { useDesignerContext } from "../context"
import { pathsClash } from "../model/names"
import { nameProblem, pathProblem } from "../model/rules"
import type { Outline, OutlineNode } from "../model/schema"
import { useDraft, useEditRun } from "./edit-run"
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
  const run = useEditRun()
  const [draft, setDraft] = useDraft(name)
  const [error, setError] = React.useState<string | null>(null)
  const help = "How scripts and the data refer to this component. Letters, digits, _ and $."

  const change = (text: string) => {
    setDraft(text)
    const taken = outline.order.find(
      (other) => other.instance.id !== id && other.instance.name === text,
    )
    const problem =
      nameProblem(text) ?? (taken ? `“${text}” is already the name of another component.` : null)
    setError(problem)
    if (problem === null) store.run({ type: "rename", id, name: text, merge: run.current() })
  }

  return (
    <PropertyRow id="props-name-input" label="Name" help={help} error={error}>
      <Input
        id="props-name-input"
        data-testid="props-name"
        value={draft}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={error !== null || undefined}
        aria-describedby={describedBy("props-name-input", error, help)}
        onFocus={run.start}
        onBlur={run.end}
        onChange={(event) => change(event.target.value)}
        className="font-mono"
      />
    </PropertyRow>
  )
}

function PathField({ node, outline }: { node: OutlineNode; outline: Outline }) {
  const { store } = useDesignerContext()
  const { id, bind = "" } = node.instance
  const run = useEditRun()
  const [draft, setDraft] = useDraft(bind)
  const [error, setError] = React.useState<string | null>(null)
  const help = "Where the value is stored when the form is submitted: names joined by dots."

  const change = (text: string) => {
    setDraft(text)
    const clash = outline.order.find(
      (other) =>
        other.instance.id !== id &&
        typeof other.instance.bind === "string" &&
        pathsClash(text, other.instance.bind),
    )
    const problem =
      pathProblem(text) ??
      (clash
        ? clash.instance.bind === text
          ? `${clash.instance.name} already stores its value under ${text}.`
          : `This clashes with ${clash.instance.bind} (${clash.instance.name}): one would hold the other.`
        : null)
    setError(problem)
    if (problem === null) store.run({ type: "bind", id, path: text, merge: run.current() })
  }

  return (
    <PropertyRow id="props-bind-input" label="Data path" help={help} error={error}>
      <Input
        id="props-bind-input"
        data-testid="props-bind"
        value={draft}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={error !== null || undefined}
        aria-describedby={describedBy("props-bind-input", error, help)}
        onFocus={run.start}
        onBlur={run.end}
        onChange={(event) => change(event.target.value)}
        className="font-mono"
      />
    </PropertyRow>
  )
}
