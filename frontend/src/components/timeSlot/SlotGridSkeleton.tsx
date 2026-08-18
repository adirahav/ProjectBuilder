const PLACEHOLDER_COUNT = 10

/**
 * Loading placeholder shaped like the real slot grid, so the layout does not
 * jump when the day's times arrive. Hidden from assistive tech — the page
 * announces loading through its own live region instead.
 */
export function SlotGridSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
    >
      {Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => (
        <div
          key={index}
          className="h-[86px] animate-pulse rounded-xl border border-neutral-900/10 bg-neutral-900/5"
        />
      ))}
    </div>
  )
}
