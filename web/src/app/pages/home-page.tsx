import { Page } from "../layout/page"
import { HOME_PAGE } from "../pages"
import { AppInfoCard } from "./home/app-info-card"
import { TokenPreviewCard } from "./home/token-preview-card"

export function HomePage() {
  return (
    <Page
      title={HOME_PAGE.title}
      description="The running app and a live sample of its design tokens."
    >
      <AppInfoCard />
      <TokenPreviewCard />
    </Page>
  )
}
