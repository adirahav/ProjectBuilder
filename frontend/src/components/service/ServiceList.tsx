import { motion, useReducedMotion } from 'framer-motion'

import { ServiceCard } from './ServiceCard'
import type { Service } from '../../types/service.types'

interface ServiceListProps {
  services: Service[]
  label: string
  onBook: (serviceId: string) => void
}

/**
 * Semantic list of Service cards. Cards fade in on load; when the user prefers
 * reduced motion the animation is dropped entirely — it is decoration only,
 * never the signal that content arrived.
 */
export function ServiceList({ services, label, onBook }: ServiceListProps) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <ul
      aria-label={label}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6"
    >
      {services.map((service, index) => (
        <motion.li
          key={service.id}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 0.25, delay: Math.min(index, 5) * 0.05 }
          }
        >
          <ServiceCard service={service} onBook={onBook} />
        </motion.li>
      ))}
    </ul>
  )
}
