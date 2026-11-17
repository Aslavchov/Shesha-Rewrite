import { alert } from "./components/alert"
import { button } from "./components/button"
import { card } from "./components/card"
import { checkbox } from "./components/checkbox"
import { columns } from "./components/columns"
import { container } from "./components/container"
import { dataTable } from "./components/data-table"
import { datePicker } from "./components/date-picker"
import { entityPicker } from "./components/entity-picker"
import { numberField } from "./components/number-field"
import { radioGroup } from "./components/radio-group"
import { referenceListSelect } from "./components/reference-list-select"
import { select } from "./components/select"
import { statusTag } from "./components/status-tag"
import { switchField } from "./components/switch"
import { tabs } from "./components/tabs"
import { text } from "./components/text"
import { textArea } from "./components/text-area"
import { textField } from "./components/text-field"
import { createRegistry } from "./runtime"

/**
 * Every component type the app can render. Registering a component is one
 * line here (ADR 0004); nothing else in the app names a component type.
 */
export const registry = createRegistry([
  textField,
  textArea,
  numberField,
  select,
  checkbox,
  switchField,
  datePicker,
  radioGroup,
  referenceListSelect,
  entityPicker,
  dataTable,
  button,
  container,
  columns,
  card,
  tabs,
  text,
  alert,
  statusTag,
])
