import { TableIcon } from "lucide-react"

import { defineStatic } from "../../runtime"
import { DataTable } from "./data-table"
import { settings, slots } from "./settings"

export const dataTable = defineStatic({
  type: "data-table",
  displayName: "Data table",
  description: "The rows of an entity, with search, filters and paging.",
  category: "data",
  icon: TableIcon,
  settings,
  slots,
  // A table lists rows the same way whether the form around it is being
  // filled in or read.
  Edit: DataTable,
  ReadOnly: DataTable,
})
