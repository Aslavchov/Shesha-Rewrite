import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

import { Page } from "../layout/page"
import { type AppPage, arrivalText } from "../pages"

/** A page that is not built yet: its title plus one line on what is coming and when. */
export function UpcomingPage({ page }: { page: AppPage }) {
  return (
    <Page title={page.title}>
      <Empty data-testid="empty-state" className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <page.icon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Nothing here yet</EmptyTitle>
          {page.upcoming ? (
            <EmptyDescription data-testid="empty-state-description">
              {page.upcoming.summary} {arrivalText(page.upcoming.arrives)}
            </EmptyDescription>
          ) : null}
        </EmptyHeader>
      </Empty>
    </Page>
  )
}
