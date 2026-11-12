import "./styles/index.css"

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "./app/app"
import { initTheme } from "./app/theme/theme"

initTheme()

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
