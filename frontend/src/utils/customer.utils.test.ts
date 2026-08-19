import { describe, expect, it } from 'vitest'

import {
  normalizeCustomerDetails,
  validateCustomerDetails,
  validateCustomerField,
} from './customer.utils'
import type { CustomerDetails } from '../types/appointment.types'

const validDetails: CustomerDetails = {
  customerName: 'Dana Levi',
  customerPhone: '050-123-4567',
  customerEmail: 'dana@example.com',
}

const withDetails = (overrides: Partial<CustomerDetails>): CustomerDetails => ({
  ...validDetails,
  ...overrides,
})

describe('validateCustomerDetails', () => {
  it('accepts a fully filled, well-formed form', () => {
    expect(validateCustomerDetails(validDetails)).toEqual({})
  })

  it('accepts a form with no email, since email is optional', () => {
    expect(validateCustomerDetails(withDetails({ customerEmail: '' }))).toEqual({})
  })

  it('reports every problem at once rather than one at a time', () => {
    const errors = validateCustomerDetails({
      customerName: '',
      customerPhone: '',
      customerEmail: 'not-an-address',
    })

    expect(errors).toEqual({
      customerName: 'details.form.name.required',
      customerPhone: 'details.form.phone.required',
      customerEmail: 'details.form.email.invalid',
    })
  })
})

describe('name validation', () => {
  it('requires a name', () => {
    expect(validateCustomerField('customerName', withDetails({ customerName: '' }))).toBe(
      'details.form.name.required',
    )
  })

  it('treats a name of only spaces as missing, not as valid', () => {
    expect(validateCustomerField('customerName', withDetails({ customerName: '   ' }))).toBe(
      'details.form.name.required',
    )
  })

  it('rejects a single character as too short to be a name', () => {
    expect(validateCustomerField('customerName', withDetails({ customerName: 'D' }))).toBe(
      'details.form.name.tooShort',
    )
  })

  it('rejects a name beyond the maximum length', () => {
    expect(
      validateCustomerField('customerName', withDetails({ customerName: 'a'.repeat(61) })),
    ).toBe('details.form.name.tooLong')
  })

  it('accepts a Hebrew name, since the clinic is Hebrew-first', () => {
    expect(
      validateCustomerField('customerName', withDetails({ customerName: 'דנה לוי' })),
    ).toBeUndefined()
  })
})

describe('phone validation', () => {
  it('requires a phone number', () => {
    expect(validateCustomerField('customerPhone', withDetails({ customerPhone: '' }))).toBe(
      'details.form.phone.required',
    )
  })

  it.each(['0501234567', '050-123-4567', '+972 50 123 4567', '(03) 123-4567'])(
    'accepts the real-world format %s',
    (customerPhone) => {
      expect(validateCustomerField('customerPhone', withDetails({ customerPhone }))).toBeUndefined()
    },
  )

  it('rejects a number with too few digits to dial', () => {
    expect(validateCustomerField('customerPhone', withDetails({ customerPhone: '12345' }))).toBe(
      'details.form.phone.invalid',
    )
  })

  it('rejects a number with more digits than any real one has', () => {
    expect(
      validateCustomerField('customerPhone', withDetails({ customerPhone: '1'.repeat(16) })),
    ).toBe('details.form.phone.invalid')
  })

  it('rejects letters in a phone number', () => {
    expect(
      validateCustomerField('customerPhone', withDetails({ customerPhone: 'call me maybe' })),
    ).toBe('details.form.phone.invalid')
  })
})

describe('email validation', () => {
  it('accepts an empty email, since it is optional', () => {
    expect(validateCustomerField('customerEmail', withDetails({ customerEmail: '' }))).toBeUndefined()
  })

  it('accepts a plus-tagged address rather than treating it as malformed', () => {
    expect(
      validateCustomerField('customerEmail', withDetails({ customerEmail: 'dana+dog@example.co.il' })),
    ).toBeUndefined()
  })

  it.each(['dana', 'dana@', '@example.com', 'dana@example', 'dana @example.com'])(
    'rejects the malformed address %s',
    (customerEmail) => {
      expect(validateCustomerField('customerEmail', withDetails({ customerEmail }))).toBe(
        'details.form.email.invalid',
      )
    },
  )
})

describe('normalizeCustomerDetails', () => {
  it('trims the padding a Customer did not mean to type', () => {
    expect(
      normalizeCustomerDetails({
        customerName: '  Dana Levi  ',
        customerPhone: ' 050-123-4567 ',
        customerEmail: ' dana@example.com ',
      }),
    ).toEqual(validDetails)
  })
})
