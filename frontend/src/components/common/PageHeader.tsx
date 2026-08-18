import { cn } from '../../lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  className?: string
}

/** Consistent page titling. The title is always the page's single <h1>. */
export function PageHeader({ title, subtitle, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-2 text-start', className)}>
      <h1 className="text-2xl font-bold tracking-tight text-neutral-900 md:text-3xl">{title}</h1>

      {subtitle && (
        <p className="max-w-prose text-base text-neutral-900/70 md:text-lg">{subtitle}</p>
      )}
    </div>
  )
}
