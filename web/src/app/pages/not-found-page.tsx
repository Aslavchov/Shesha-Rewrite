import { CompassIcon } from "lucide-react"
import { Link } from "react-router"

import { buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

import { Page } from "../layout/page"
import { HOME_PAGE, NOT_FOUND_TITLE } from "../pages"

export function NotFoundPage() {
  return (
    <Page title={NOT_FOUND_TITLE}>
      <Empty data-testid="not-found" className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CompassIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>There is no page at this address</EmptyTitle>
          <EmptyDescription>
            The link may be out of date, or the address may have been mistyped.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            to={HOME_PAGE.path}
            data-testid="not-found-home-link"
            className={buttonVariants({ variant: "outline" })}
          >
            Back to Home
          </Link>
        </EmptyContent>
      </Empty>
    </Page>
  )
}
