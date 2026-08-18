const PLACEHOLDER_COUNT = 3

/**
 * Loading placeholder matching the real card grid, so the page does not jump
 * when data arrives. Hidden from assistive tech — the page announces loading
 * through its own live region instead.
 */
export function ServiceListSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6"
    >
      {Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => (
        <div
          key={index}
          className="flex h-full animate-pulse flex-col gap-5 rounded-2xl border border-neutral-900/10 bg-white p-5 md:p-6"
        >
          <div className="h-6 w-2/3 rounded-lg bg-neutral-900/10" />
          <div className="flex gap-6">
            <div className="h-4 w-20 rounded-lg bg-neutral-900/10" />
            <div className="h-4 w-16 rounded-lg bg-neutral-900/10" />
          </div>
          <div className="mt-auto h-12 w-full rounded-xl bg-neutral-900/10" />
        </div>
      ))}
    </div>
  )
}
