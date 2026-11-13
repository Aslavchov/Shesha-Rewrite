import { numberField } from "./components/number-field"
import { textArea } from "./components/text-area"
import { textField } from "./components/text-field"
import { createRegistry } from "./runtime"

/**
 * Every component type the app can render. Registering a component is one
 * line here (ADR 0004); nothing else in the app names a component type.
 */
export const registry = createRegistry([textField, textArea, numberField])
