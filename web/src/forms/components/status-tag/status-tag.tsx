import { ItemTag } from "../../parts/reference-list"
import { useReferenceList } from "../../parts/use-reference-list"
import type { InputEditProps, Slots } from "../../runtime"
import type { settings, Slot } from "./settings"

/**
 * Shows a reference list value as its item's label, in its colour. It is
 * bound like an input, by data path, because that is how a component gets a
 * value (ADR 0011), but it never changes it: both modes show the same tag.
 */
function Tag({
  name,
  label,
  referenceList,
  value,
  slots: slot,
}: {
  name: string
  label: string | null
  referenceList: string | null
  value: string | null
  slots: Slots<Slot>
}) {
  const list = useReferenceList(referenceList)
  return (
    <div className="flex min-w-0 flex-col items-start gap-1" {...slot.root}>
      {label === null ? null : (
        <span className="text-sm leading-snug font-medium" {...slot.label}>
          {label}
        </span>
      )}
      {value === null ? (
        <span
          data-testid={`field-${name}-value`}
          data-empty="true"
          className="text-sm text-muted-foreground"
        >
          <span aria-hidden="true">—</span>
          <span className="sr-only">No value</span>
        </span>
      ) : (
        <ItemTag
          items={list.items}
          value={value}
          data-testid={`field-${name}-value`}
          {...slot.tag}
        />
      )}
    </div>
  )
}

export function StatusTagEdit({
  instance,
  settings: { label, referenceList },
  slots,
  field,
}: InputEditProps<"option", typeof settings, Slot>) {
  return (
    <Tag
      name={instance.name}
      label={label}
      referenceList={referenceList}
      value={field.value}
      slots={slots}
    />
  )
}

export function StatusTagReadOnly({
  instance,
  settings: { label, referenceList },
  slots,
  value,
}: {
  instance: { name: string }
  settings: { label: string | null; referenceList: string | null }
  slots: Slots<Slot>
  value: string | null
}) {
  return (
    <Tag
      name={instance.name}
      label={label}
      referenceList={referenceList}
      value={value}
      slots={slots}
    />
  )
}
