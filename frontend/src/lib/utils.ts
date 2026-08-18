import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Single class-merging helper for the whole app. Never build a className with
// string concatenation or a ternary — twMerge is what makes later utilities
// correctly win over earlier conflicting ones.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
