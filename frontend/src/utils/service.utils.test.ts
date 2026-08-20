import { describe, expect, it } from 'vitest'

import {
  emptyServiceFormValues,
  isEmptyServicePatch,
  serviceToFormValues,
  sortServicesForAdmin,
  toServiceDraft,
  toServicePatch,
  validateServiceField,
  validateServiceForm,
} from './service.utils'
import { buildService } from '../test/factories'
import type { ServiceFormValues } from '../types/service.types'

function values(overrides: Partial<ServiceFormValues> = {}): ServiceFormValues {
  return { name: 'Full groom', durationMinutes: '90', price: '220', isActive: true, ...overrides }
}

describe('validateServiceForm', () => {
  it('accepts a fully filled, sensible form', () => {
    expect(validateServiceForm(values())).toEqual({})
  })

  it('rejects a missing name', () => {
    expect(validateServiceForm(values({ name: '   ' })).name).toBe(
      'adminServices.form.name.required',
    )
  })

  it('rejects a name longer than the column can meaningfully show', () => {
    expect(validateServiceForm(values({ name: 'a'.repeat(61) })).name).toBe(
      'adminServices.form.name.tooLong',
    )
  })

  it('rejects an empty duration rather than reading it as zero minutes', () => {
    expect(validateServiceForm(values({ durationMinutes: '' })).durationMinutes).toBe(
      'adminServices.form.duration.required',
    )
  })

  it('rejects a duration that is not a number at all', () => {
    expect(validateServiceForm(values({ durationMinutes: '90 minutes' })).durationMinutes).toBe(
      'adminServices.form.duration.required',
    )
  })

  it('rejects a fractional duration, which no time slot boundary could honour', () => {
    expect(validateServiceForm(values({ durationMinutes: '45.5' })).durationMinutes).toBe(
      'adminServices.form.duration.invalid',
    )
  })

  it('rejects a zero-minute treatment', () => {
    expect(validateServiceForm(values({ durationMinutes: '0' })).durationMinutes).toBe(
      'adminServices.form.duration.invalid',
    )
  })

  it('rejects a duration longer than a working day, the usual sign of a typo', () => {
    expect(validateServiceForm(values({ durationMinutes: '600' })).durationMinutes).toBe(
      'adminServices.form.duration.tooLong',
    )
  })

  it('rejects an empty price rather than turning it into a free treatment', () => {
    expect(validateServiceForm(values({ price: '' })).price).toBe(
      'adminServices.form.price.required',
    )
  })

  it('accepts a price of zero, since a complimentary treatment is legitimate', () => {
    expect(validateServiceForm(values({ price: '0' })).price).toBeUndefined()
  })

  it('accepts a fractional price', () => {
    expect(validateServiceForm(values({ price: '99.5' })).price).toBeUndefined()
  })

  it('rejects a negative price', () => {
    expect(validateServiceForm(values({ price: '-1' })).price).toBe(
      'adminServices.form.price.invalid',
    )
  })

  it('rejects an implausibly high price', () => {
    expect(validateServiceForm(values({ price: '100001' })).price).toBe(
      'adminServices.form.price.tooHigh',
    )
  })

  it('reports every offending field at once, not just the first', () => {
    expect(Object.keys(validateServiceForm(values({ name: '', durationMinutes: '', price: '' }))))
      .toHaveLength(3)
  })

  it('never flags the active toggle, which cannot be invalid', () => {
    expect(validateServiceField('isActive', values({ isActive: false }))).toBeUndefined()
  })
})

describe('toServiceDraft', () => {
  it('trims the name and converts the typed numbers', () => {
    expect(toServiceDraft(values({ name: '  Bath  ' }))).toEqual({
      name: 'Bath',
      durationMinutes: 90,
      price: 220,
    })
  })

  it('never carries an isActive flag — a new Service is always offered', () => {
    expect(toServiceDraft(values({ isActive: false }))).not.toHaveProperty('isActive')
  })
})

describe('toServicePatch', () => {
  const original = buildService({ name: 'Full groom', durationMinutes: 90, price: 220 })

  it('sends nothing when nothing changed', () => {
    expect(toServicePatch(serviceToFormValues(original), original)).toEqual({})
  })

  it('sends only the field that actually changed', () => {
    expect(toServicePatch(values({ name: 'Full groom', price: '250' }), original)).toEqual({
      price: 250,
    })
  })

  it('treats re-activating a deactivated Service as a normal patch', () => {
    const inactive = buildService({ ...original, isActive: false })

    expect(toServicePatch({ ...serviceToFormValues(inactive), isActive: true }, inactive)).toEqual({
      isActive: true,
    })
  })

  it('does not count re-typing the same name with padding as a change', () => {
    expect(toServicePatch(values({ name: '  Full groom  ' }), original)).toEqual({})
  })
})

describe('isEmptyServicePatch', () => {
  it('is true for a patch with nothing to send', () => {
    expect(isEmptyServicePatch({})).toBe(true)
  })

  it('is false as soon as one field is set', () => {
    expect(isEmptyServicePatch({ price: 0 })).toBe(false)
  })
})

describe('form value helpers', () => {
  it('starts a create form empty and offered', () => {
    expect(emptyServiceFormValues()).toEqual({
      name: '',
      durationMinutes: '',
      price: '',
      isActive: true,
    })
  })

  it('renders numbers as strings so a blank field stays distinguishable from zero', () => {
    const service = buildService({ durationMinutes: 45, price: 0 })

    expect(serviceToFormValues(service)).toMatchObject({ durationMinutes: '45', price: '0' })
  })
})

describe('sortServicesForAdmin', () => {
  it('keeps the offered treatments above the retired ones', () => {
    const retired = buildService({ name: 'Aardvark trim', isActive: false })
    const offered = buildService({ name: 'Zebra wash', isActive: true })

    expect(sortServicesForAdmin([retired, offered]).map((s) => s.name)).toEqual([
      'Zebra wash',
      'Aardvark trim',
    ])
  })

  it('sorts alphabetically within each group', () => {
    const b = buildService({ name: 'Bath', isActive: true })
    const a = buildService({ name: 'Adult groom', isActive: true })

    expect(sortServicesForAdmin([b, a]).map((s) => s.name)).toEqual(['Adult groom', 'Bath'])
  })

  it('does not mutate the array it was given', () => {
    const list = [buildService({ name: 'B' }), buildService({ name: 'A' })]
    const snapshot = [...list]

    sortServicesForAdmin(list)

    expect(list).toEqual(snapshot)
  })
})
