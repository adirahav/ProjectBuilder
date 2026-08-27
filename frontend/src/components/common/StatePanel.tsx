import { AlertTriangle, ArrowRight, Loader2, RefreshCw } from 'lucide-react'

/**
 * The three panels every data-backed view in this app owes the user: loading,
 * empty, and error (.rule/error-handling-rules.md).
 *
 * Extracted from `ToursPage` when the admin tabs (plan 009) needed the same
 * three states, so the empty/error affordances stay identical between the
 * passenger view and the admin dashboard instead of drifting apart.
 *
 * `LoadingPanel` and `EmptyPanel` are `role="status"`/plain text; `ErrorPanel` is
 * `role="alert"` and always carries a retry, so a failed load is never a dead
 * end the user can only escape by reloading the page.
 */

export function LoadingPanel({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 rounded-xl border border-n-100 bg-n-0 p-6 text-label text-n-500 shadow-sm"
    >
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      {message}
    </p>
  )
}

export function EmptyPanel({ message }: { message: string }) {
  return (
    <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-n-200 bg-n-0 p-6 text-label text-n-500">
      <ArrowRight aria-hidden="true" className="size-4 text-n-400" />
      {message}
    </p>
  )
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-n-100 bg-n-0 p-6 text-center shadow-sm"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-danger-50 text-danger-600">
        <AlertTriangle aria-hidden="true" className="size-5" />
      </span>
      <p className="text-label text-n-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex h-10 items-center gap-2 rounded-lg border border-n-200 bg-n-0 px-4 text-label font-medium text-n-700 transition hover:bg-n-50"
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        נסו שוב
      </button>
    </div>
  )
}
