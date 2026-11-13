import * as React from "react"
import { CircleHelpIcon, TriangleAlertIcon } from "lucide-react"

import type { ComponentInstance } from "@/generated"

/**
 * What stands in for an instance that cannot be rendered. The rest of the
 * form keeps working around it (spec section 3, "Resilience").
 */

function Placeholder({
  testId,
  instance,
  icon,
  title,
  children,
}: {
  testId: string
  instance: ComponentInstance
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      data-testid={testId}
      data-component-name={instance.name}
      data-component-type={instance.type}
      className="flex items-start gap-2.5 rounded-lg border border-dashed border-input bg-muted/50 px-3 py-2.5 text-sm"
    >
      <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-medium text-foreground">{title}</p>
        <p className="wrap-break-word text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

/** For a component type this build does not have. */
export function UnknownComponent({ instance }: { instance: ComponentInstance }) {
  return (
    <Placeholder
      testId="component-unknown"
      instance={instance}
      icon={<CircleHelpIcon aria-hidden="true" />}
      title={`Unknown component “${instance.type}”`}
    >
      “{instance.name}” cannot be shown because this version has no component of that type.
    </Placeholder>
  )
}

/** For an instance that is misconfigured, or whose component failed while rendering. */
export function ComponentError({
  instance,
  children,
}: {
  instance: ComponentInstance
  children: React.ReactNode
}) {
  return (
    <Placeholder
      testId="component-error"
      instance={instance}
      icon={<TriangleAlertIcon aria-hidden="true" />}
      title={`“${instance.name}” cannot be shown`}
    >
      {children}
    </Placeholder>
  )
}

type BoundaryProps = { instance: ComponentInstance; children: React.ReactNode }

/**
 * Catches an error thrown while rendering one instance and shows
 * `ComponentError` in its place. React reports the error to the console;
 * nothing else in the form is affected.
 */
export class ComponentBoundary extends React.Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override render() {
    if (this.state.failed) {
      return (
        <ComponentError instance={this.props.instance}>
          This component hit an error. The rest of the form still works.
        </ComponentError>
      )
    }
    return this.props.children
  }
}
