import { EyeIcon, PencilIcon } from "lucide-react"

import { SegmentedSwitch } from "@/components/segmented-switch"
import type { FormMode } from "@/forms/runtime"

const MODES = [
  { value: "edit", label: "Edit", icon: PencilIcon, testId: "form-mode-edit" },
  { value: "read-only", label: "Read-only", icon: EyeIcon, testId: "form-mode-read-only" },
] as const

/** Switches the form between edit and read-only. */
export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: FormMode
  onChange: (mode: FormMode) => void
}) {
  return <SegmentedSwitch label="Form mode" options={MODES} value={mode} onChange={onChange} />
}
