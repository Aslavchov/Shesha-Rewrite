/** The product mark: a rounded tile in the brand colour. Decorative. */
export function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs"
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none">
        <path
          d="M11.5 4.75H6.75a2 2 0 0 0 0 4h2.5a2 2 0 0 1 0 4H4.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
