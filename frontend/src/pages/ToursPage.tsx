import { Link } from 'react-router-dom'
import { ArrowRight, Bus } from 'lucide-react'

/**
 * Screen 3 — Passenger View. Placeholder only.
 *
 * Exists so the Gateway's "Continue as passenger" CTA has a real destination
 * instead of 404-ing (plan 006, Open Question 2). The tour/bus selector and seat
 * map are built by Screen 3's own ticket, which replaces this file's body.
 *
 * No auth is involved here by design — passengers are never authenticated.
 */
export function ToursPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-4 rounded-xl border border-n-100 bg-n-0 p-6 text-center shadow-sm">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <Bus aria-hidden="true" className="size-6" />
        </span>
        <h1 className="text-h1 text-primary-900">בחירת טיול ואוטובוס</h1>
        <p className="text-body text-n-500">
          נכנסתם כנוסעים, ללא צורך בהרשמה. מפת המושבים תיפתח כאן בקרוב.
        </p>
        <Link
          to="/"
          className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-n-200 bg-n-0 text-label font-medium text-n-700 transition hover:bg-n-50"
        >
          <ArrowRight aria-hidden="true" className="size-4" />
          חזרה למסך הכניסה
        </Link>
      </div>
    </main>
  )
}
