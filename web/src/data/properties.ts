import {
  BinaryIcon,
  CalendarIcon,
  HashIcon,
  Link2Icon,
  ListIcon,
  type LucideIcon,
  TypeIcon,
} from "lucide-react"

import type { ValueType } from "@/forms/runtime/values"
import type { PropertyDefinition, PropertyType } from "@/generated"

/** What each property type is called and drawn as, wherever properties are listed. */
export const PROPERTY_TYPES: Record<
  PropertyType,
  { readonly label: string; readonly icon: LucideIcon; readonly valueType: ValueType }
> = {
  text: { label: "Text", icon: TypeIcon, valueType: "text" },
  number: { label: "Number", icon: HashIcon, valueType: "number" },
  boolean: { label: "Yes/no", icon: BinaryIcon, valueType: "boolean" },
  date: { label: "Date", icon: CalendarIcon, valueType: "date" },
  referenceList: { label: "Reference list", icon: ListIcon, valueType: "option" },
  reference: { label: "Reference", icon: Link2Icon, valueType: "reference" },
}

/** The types in the order they are offered. */
export const PROPERTY_TYPE_ORDER: readonly PropertyType[] = [
  "text",
  "number",
  "boolean",
  "date",
  "referenceList",
  "reference",
]

/** The value type (ADR 0005, with `reference` from ADR 0011) a property holds. */
export const valueTypeOf = (property: PropertyDefinition): ValueType =>
  PROPERTY_TYPES[property.type].valueType

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" })

/** A "YYYY-MM-DD" date for reading: "14 Mar 1990". The day is the same in every time zone. */
export function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date)
}
