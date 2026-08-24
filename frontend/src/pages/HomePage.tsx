import { Bus } from 'lucide-react'

/**
 * Temporary placeholder route for the scaffold. Feature tickets replace this
 * with the real Gateway (Screen 1) / Passenger View (Screen 3) / Admin (Screen 4).
 */
export function HomePage() {
  return (
    <main className="min-h-dvh bg-n-50 px-4 py-12 md:px-12">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-n-100 bg-n-0 p-6 text-center shadow-sm">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <Bus aria-hidden="true" className="size-6" />
        </span>
        <h1 className="text-h1 text-primary-900">הילה טיולים</h1>
        <p className="text-body text-n-500">
          שלד הפרויקט הוקם בהצלחה. המסכים יתווספו בכרטיסים הבאים.
        </p>
      </div>
    </main>
  )
}
