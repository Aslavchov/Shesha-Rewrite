import { Page } from "../../layout/page"
import { FORMS_PAGE } from "../../pages"
import { FormsBrowser } from "./forms-browser"
import { NewForm } from "./new-form"

/** Every form in the app. Each opens at /forms/<id>, or in the designer. */
export function FormsPage() {
  return (
    <Page
      title={FORMS_PAGE.title}
      description="Every form in this app. Open one to fill it in, or open it in the designer to change it."
      actions={<NewForm />}
    >
      <FormsBrowser opens="form" />
    </Page>
  )
}
