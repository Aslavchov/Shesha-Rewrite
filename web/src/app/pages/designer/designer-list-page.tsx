import { Page } from "../../layout/page"
import { DESIGNER_PAGE } from "../../pages"
import { FormsBrowser } from "../forms/forms-browser"
import { NewForm } from "../forms/new-form"

/** Where the designer starts (spec 3.1): pick a form to open, or make a new one. */
export function DesignerListPage() {
  return (
    <Page
      title={DESIGNER_PAGE.title}
      description="Open a form to design it: add components, arrange them and nest them."
      actions={<NewForm />}
    >
      <FormsBrowser opens="designer" />
    </Page>
  )
}
