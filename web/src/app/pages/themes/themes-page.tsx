import { Skeleton } from "@/components/ui/skeleton"
import { registry } from "@/forms/registry"
import { ThemeEditor } from "@/theme/editor/theme-editor"
import { useSetPublishedTheme } from "@/theme/use-published-theme"
import { isReadable } from "@/theme/variables"

import {
  discardThemeDraft,
  fetchThemeState,
  publishTheme,
  saveThemeDraft,
  useThemeToEdit,
} from "../../api/use-theme"
import { Page } from "../../layout/page"
import { THEMES_PAGE } from "../../pages"
import { getTheme } from "../../theme/theme"
import { RequestError } from "../forms/request-error"

const API = {
  save: saveThemeDraft,
  publish: publishTheme,
  discard: discardThemeDraft,
  load: () => fetchThemeState(),
}

/** The Themes page (Phase 4): the editor for the app's one theme. */
export function ThemesPage() {
  const theme = useThemeToEdit()
  const setPublished = useSetPublishedTheme()

  return (
    <Page
      wide
      title={THEMES_PAGE.title}
      description="Restyle the whole app: its colours, shape, text and spacing, and how each component looks by default."
    >
      {theme.isPending ? (
        <Skeleton data-testid="theme-loading" className="h-96 w-full" />
      ) : theme.isError ? (
        <RequestError
          testId="theme-error"
          title="The theme could not be loaded"
          isRetrying={theme.isFetching}
          onRetry={() => void theme.refetch()}
        />
      ) : !isReadable(theme.data.draft.document) || !isReadable(theme.data.published.document) ? (
        <p
          role="alert"
          data-testid="theme-unsupported-version"
          className="rounded-xl border border-dashed border-input bg-muted/50 p-4 text-muted-foreground"
        >
          The theme is saved in a format this version of the app cannot read, so the app shows its
          built-in look. Update the app to edit it.
        </p>
      ) : (
        <ThemeEditor
          state={theme.data}
          registry={registry}
          api={API}
          initialMode={getTheme()}
          onPublished={setPublished}
        />
      )}
    </Page>
  )
}
