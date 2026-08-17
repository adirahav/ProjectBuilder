import { CalendarCheck } from 'lucide-react'
import { cn } from '../lib/utils'

export default function HomePage() {
  return (
    <main
      className={cn(
        'min-h-screen bg-background text-foreground',
        'flex flex-col items-center justify-center gap-4 p-6',
      )}
    >
      <CalendarCheck className="size-10 text-primary" aria-hidden="true" />
      <h1 className="text-2xl font-semibold text-primary">BookMe</h1>
      <p className="text-muted">הפרויקט הוקם בהצלחה</p>
    </main>
  )
}
