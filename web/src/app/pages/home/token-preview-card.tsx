import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

/**
 * A live sample of the seed design tokens: brand colour, type, radius, shadow
 * and focus ring. It exists so the tokens can be checked in the browser.
 */
export function TokenPreviewCard() {
  const inputId = React.useId()

  return (
    <Card data-testid="token-preview">
      <CardHeader>
        <CardTitle>Design tokens</CardTitle>
        <CardDescription>
          A live sample of the seed tokens: colour, type, radius, shadow and focus ring.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Sample label="Buttons">
            <div className="flex flex-wrap gap-2">
              <Button data-testid="token-preview-primary">Primary</Button>
              <Button variant="outline" data-testid="token-preview-default">
                Default
              </Button>
            </div>
          </Sample>
          <Sample label="Text input" htmlFor={inputId}>
            <Input id={inputId} data-testid="token-preview-input" placeholder="Type something" />
          </Sample>
        </div>
        <Sample label="Nested card">
          <Card size="sm" data-testid="token-preview-card" className="bg-muted/50 shadow-none">
            <CardHeader>
              <CardTitle>Card inside a card</CardTitle>
              <CardDescription>
                Surfaces, borders and corner radius all come from the same tokens.
              </CardDescription>
            </CardHeader>
          </Card>
        </Sample>
      </CardContent>
    </Card>
  )
}

function Sample({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  const Label = htmlFor ? "label" : "p"

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
