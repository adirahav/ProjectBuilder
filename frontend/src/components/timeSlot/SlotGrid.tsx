import { AnimatePresence } from 'framer-motion'

import { SlotButton } from './SlotButton'
import type { TimeSlot } from '../../types/timeSlot.types'

interface SlotGridProps {
  slots: TimeSlot[]
  label: string
  holdingSlotId: string | null
  onHold: (slot: TimeSlot) => void
}

/**
 * The day's open times as a responsive grid. A real <ul> so a screen reader
 * announces how many times are available before the Customer starts moving
 * through them.
 *
 * AnimatePresence lets a slot claimed by someone else fade out on the next
 * refresh instead of vanishing between frames (.rule/ui-rules.md).
 */
export function SlotGrid({ slots, label, holdingSlotId, onHold }: SlotGridProps) {
  const isAnyHolding = holdingSlotId !== null

  return (
    <ul
      aria-label={label}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
    >
      <AnimatePresence initial={false}>
        {slots.map((slot) => (
          <li key={slot.id}>
            <SlotButton
              slot={slot}
              isHolding={holdingSlotId === slot.id}
              isAnyHolding={isAnyHolding}
              onHold={onHold}
            />
          </li>
        ))}
      </AnimatePresence>
    </ul>
  )
}
