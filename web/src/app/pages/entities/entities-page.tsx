import * as React from "react"
import { BoxesIcon, ListIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCatalog } from "@/data/client"

import { Page } from "../../layout/page"
import { ENTITIES_PAGE } from "../../pages"
import { RequestError } from "../forms/request-error"
import { EntityEditor } from "./entity-editor"
import { ReferenceListEditor } from "./reference-list-editor"

type Kind = "entities" | "lists"

/** What is open beside the list: one definition by name, a new one, or the first there is. */
type Selection = { readonly name: string; readonly created?: boolean } | "new" | null

/**
 * The Entities page (Phase 5): the entities an administrator defines, their
 * properties, and the reference lists their choices come from. The list is
 * on one side and the definition open for editing on the other. Nothing here
 * saves by itself: a change is made when its Save is pressed, because a
 * change to a definition can be refused.
 */
export function EntitiesPage() {
  const catalog = useCatalog()
  const [kind, setKind] = React.useState<Kind>("entities")
  const [selection, setSelection] = React.useState<Record<Kind, Selection>>({
    entities: null,
    lists: null,
  })
  const select = (next: Selection) => setSelection((current) => ({ ...current, [kind]: next }))

  const items =
    kind === "entities"
      ? [...catalog.entities.values()].map((record) => ({
          name: record.name,
          label: record.definition.displayName,
          about: `${record.definition.properties.length} ${record.definition.properties.length === 1 ? "property" : "properties"}, ${record.rows} ${record.rows === 1 ? "row" : "rows"}`,
        }))
      : [...catalog.lists.values()].map((record) => ({
          name: record.name,
          label: record.definition.displayName,
          about: `${record.definition.items.length} ${record.definition.items.length === 1 ? "item" : "items"}`,
        }))
  items.sort((a, b) => a.label.localeCompare(b.label))

  const chosen = selection[kind]
  const openName =
    chosen === "new"
      ? null
      : chosen && items.some((item) => item.name === chosen.name)
        ? chosen.name
        : (items[0]?.name ?? null)
  const isNew = chosen === "new"
  const prefix = kind === "entities" ? "entity" : "reflist"

  return (
    <Page
      wide
      title={ENTITIES_PAGE.title}
      description="Define what the app stores: entities and their properties, and the reference lists that choices come from. Every entity has a data API as soon as it is saved."
    >
      <div data-testid="entities-page" className="flex min-w-0 flex-col gap-4">
        <Tabs
          value={kind}
          onValueChange={(value) => {
            if (value === "entities" || value === "lists") setKind(value)
          }}
        >
          <TabsList aria-label="What to define">
            <TabsTrigger value="entities" data-testid="entities-tab">
              <BoxesIcon aria-hidden="true" />
              Entities and properties
            </TabsTrigger>
            <TabsTrigger value="lists" data-testid="reflists-tab">
              <ListIcon aria-hidden="true" />
              Reference lists
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {catalog.status === "error" ? (
          <RequestError
            testId="entities-error"
            title="The definitions could not be loaded"
            isRetrying={false}
            onRetry={catalog.refetch}
          />
        ) : catalog.status === "loading" ? (
          <Skeleton data-testid="entities-loading" className="h-64 w-full" />
        ) : (
          <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <div className="flex flex-col gap-2">
              <ul
                aria-label={kind === "entities" ? "Entities" : "Reference lists"}
                data-testid={`${prefix}-list`}
                className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-xs empty:hidden"
              >
                {items.map((item) => (
                  <li key={item.name}>
                    <button
                      type="button"
                      data-testid={`${prefix}-${item.name}`}
                      aria-current={!isNew && item.name === openName ? "true" : undefined}
                      className="flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:-outline-offset-2 aria-current:bg-accent aria-current:text-accent-foreground"
                      onClick={() => select({ name: item.name })}
                    >
                      <span className="font-medium text-foreground">{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.about}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                variant={items.length === 0 ? "default" : "outline"}
                data-testid={kind === "entities" ? "entities-new" : "reflist-new"}
                onClick={() => select("new")}
              >
                <PlusIcon aria-hidden="true" data-icon="inline-start" />
                {kind === "entities" ? "New entity" : "New reference list"}
              </Button>
            </div>

            {!isNew && openName === null ? (
              <p
                data-testid="entities-empty"
                className="rounded-xl border border-dashed border-input bg-muted/50 p-6 text-muted-foreground"
              >
                {kind === "entities"
                  ? "No entities yet. Create one to start storing data; starting the app with --demo adds two."
                  : "No reference lists yet. Create one to give a property a fixed set of choices."}
              </p>
            ) : kind === "entities" ? (
              <EntityEditor
                // Another entity is another editor: its drafts start afresh.
                key={isNew ? "new" : openName}
                record={
                  isNew || openName === null ? null : (catalog.entities.get(openName) ?? null)
                }
                onCreated={(name) => select({ name, created: true })}
                justCreated={chosen !== null && chosen !== "new" && chosen.created === true}
                onDeleted={() => select(null)}
              />
            ) : (
              <ReferenceListEditor
                key={isNew ? "new" : openName}
                record={isNew || openName === null ? null : (catalog.lists.get(openName) ?? null)}
                onCreated={(name) => select({ name, created: true })}
                justCreated={chosen !== null && chosen !== "new" && chosen.created === true}
                onDeleted={() => select(null)}
              />
            )}
          </div>
        )}
      </div>
    </Page>
  )
}
