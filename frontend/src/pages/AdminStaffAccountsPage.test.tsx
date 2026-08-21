import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AppRoutes } from '../App'
import { useStore } from '../store/store'
import { authService } from '../services/auth.service'
import { utilService } from '../services/util.service'
import { buildRegisterResponse } from '../test/factories'

vi.mock('../services/auth.service', async () => {
  // The real 409/401 predicates are preserved: telling "that address is taken"
  // apart from "your own session expired" is exactly the behaviour under test.
  const actual =
    await vi.importActual<typeof import('../services/auth.service')>('../services/auth.service')

  return {
    ...actual,
    authService: {
      login: vi.fn(),
      registerAdmin: vi.fn(),
      saveToken: vi.fn(),
      readToken: vi.fn(),
      clearToken: vi.fn(),
    },
  }
})

vi.mock('../services/util.service', () => ({
  utilService: {
    saveToStorage: vi.fn(),
    getFromStorage: vi.fn(),
    removeFromStorage: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}))

const { toast } = await import('sonner')
const mockedRegister = vi.mocked(authService.registerAdmin)
const mockedReadToken = vi.mocked(authService.readToken)
const mockedToastError = vi.mocked(toast.error)
const mockedToastSuccess = vi.mocked(toast.success)

// The app defaults to Hebrew, so the accessible names under test are Hebrew.
const NAME_LABEL = 'שם מלא'
const EMAIL_LABEL = 'דוא״ל'
const PASSWORD_LABEL = 'סיסמה'
const SUBMIT_LABEL = 'יצירת החשבון'
const STAFF_HEADING = 'חשבונות צוות'
const LOGIN_HEADING = 'כניסת מנהל'
const DASHBOARD_HEADING = 'ממשק הניהול'

function buildErrorWithStatus(status: number): AxiosError {
  const error = new AxiosError(`Request failed with status code ${status}`)
  error.response = {
    status,
    statusText: 'Error',
    data: { error: 'nope' },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
  return error
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<{ name: string; email: string; password: string }> = {},
) {
  await user.type(screen.getByLabelText(new RegExp(NAME_LABEL)), overrides.name ?? 'דנה לוי')
  await user.type(
    screen.getByLabelText(new RegExp(EMAIL_LABEL)),
    overrides.email ?? 'dana@example.com',
  )
  await user.type(
    screen.getByLabelText(new RegExp(PASSWORD_LABEL)),
    overrides.password ?? 'a-good-password',
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(authService.saveToken).mockResolvedValue(undefined)
  vi.mocked(authService.clearToken).mockResolvedValue(undefined)
  vi.mocked(utilService.saveToStorage).mockResolvedValue(undefined)
  vi.mocked(utilService.getFromStorage).mockResolvedValue(null)
  // The store is a module-level singleton, so a session left behind by the
  // previous test would quietly authenticate the next one — which would make
  // the "no public sign-up" test pass for the wrong reason.
  useStore.setState({
    token: null,
    admin: null,
    isHydratingAuth: true,
    createdStaffAccount: null,
    isCreatingStaffAccount: false,
  })
  // Signed in by default: every test below is about what an authenticated
  // Admin can do on this screen.
  mockedReadToken.mockResolvedValue('stored-token')
})

describe('reaching the Staff Accounts screen', () => {
  it('opens for a signed-in Admin', async () => {
    renderAt('/admin/staff')

    expect(
      await screen.findByRole('heading', { level: 1, name: STAFF_HEADING }),
    ).toBeInTheDocument()
  })

  it('turns an unauthenticated visitor away — there is no public sign-up', async () => {
    // This is the regression the PRD names outright: account creation must never
    // be reachable without a session. The client guard is not the real boundary
    // (api-gateway is), but it must not be the hole either.
    mockedReadToken.mockResolvedValue(null)

    renderAt('/admin/staff')

    expect(
      await screen.findByRole('heading', { level: 1, name: LOGIN_HEADING }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: STAFF_HEADING })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SUBMIT_LABEL })).not.toBeInTheDocument()
  })

  it('is linked from the Admin dashboard, so it is not a route only its author knows', async () => {
    const user = userEvent.setup()
    renderAt('/admin')

    await screen.findByRole('heading', { level: 1, name: DASHBOARD_HEADING })
    await user.click(screen.getByRole('link', { name: /חשבונות צוות/ }))

    expect(
      await screen.findByRole('heading', { level: 1, name: STAFF_HEADING }),
    ).toBeInTheDocument()
  })

  it('says plainly that the new account is a full Admin', async () => {
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    // v1 has no permission tiers; a UI that let an Admin assume otherwise would
    // be handing over the whole clinic without saying so.
    expect(screen.getByText(/כל מי שתוסיפו כאן הוא מנהל מלא/)).toBeInTheDocument()
  })
})

describe('Staff Accounts validation', () => {
  it('refuses to submit an empty form, and says so inline', async () => {
    const user = userEvent.setup()
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(await screen.findByText(/אנא הזינו את שמו/)).toBeInTheDocument()
    expect(screen.getByText(/אנא הזינו כתובת דוא״ל/)).toBeInTheDocument()
    expect(screen.getByText(/אנא הזינו סיסמה/)).toBeInTheDocument()
    expect(mockedRegister).not.toHaveBeenCalled()
  })

  it('never uses a toast for a problem it caught itself', async () => {
    const user = userEvent.setup()
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await screen.findByText(/אנא הזינו סיסמה/)
    expect(mockedToastError).not.toHaveBeenCalled()
  })

  it('rejects a malformed email before asking the server', async () => {
    const user = userEvent.setup()
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user, { email: 'dana' })
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(await screen.findByText(/אנא הזינו כתובת דוא״ל תקינה/)).toBeInTheDocument()
    expect(mockedRegister).not.toHaveBeenCalled()
  })

  it('rejects a password below the minimum length', async () => {
    const user = userEvent.setup()
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user, { password: 'short' })
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(await screen.findByText(/אנא השתמשו בלפחות 8 תווים/)).toBeInTheDocument()
    expect(mockedRegister).not.toHaveBeenCalled()
  })

  it('ties each message to the field it belongs to', async () => {
    const user = userEvent.setup()
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    const emailInput = await screen.findByLabelText(new RegExp(EMAIL_LABEL))
    expect(emailInput).toHaveAttribute('aria-invalid', 'true')
    expect(emailInput).toHaveAccessibleDescription(/אנא הזינו כתובת דוא״ל/)
  })

  it('clears an error as soon as the Admin starts fixing it', async () => {
    const user = userEvent.setup()
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))
    await screen.findByText(/אנא הזינו את שמו/)

    await user.type(screen.getByLabelText(new RegExp(NAME_LABEL)), 'דנה')

    await waitFor(() => expect(screen.queryByText(/אנא הזינו את שמו/)).not.toBeInTheDocument())
  })
})

describe('creating a staff account', () => {
  it('sends exactly what was typed, normalised', async () => {
    const user = userEvent.setup()
    mockedRegister.mockResolvedValue(buildRegisterResponse())
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await waitFor(() =>
      expect(mockedRegister).toHaveBeenCalledWith({
        name: 'דנה לוי',
        email: 'dana@example.com',
        password: 'a-good-password',
      }),
    )
  })

  it('confirms the account and names who can now sign in', async () => {
    const user = userEvent.setup()
    mockedRegister.mockResolvedValue(buildRegisterResponse())
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(await screen.findByText(/החשבון מוכן/)).toBeInTheDocument()
    expect(screen.getByText(/dana@example\.com/)).toBeInTheDocument()
    expect(mockedToastSuccess).toHaveBeenCalledTimes(1)
  })

  it('replaces the form with the confirmation, so nobody wonders whether it saved', async () => {
    const user = userEvent.setup()
    mockedRegister.mockResolvedValue(buildRegisterResponse())
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await screen.findByText(/החשבון מוכן/)
    expect(screen.queryByRole('button', { name: SUBMIT_LABEL })).not.toBeInTheDocument()
  })

  it('offers a genuinely empty form for the next account', async () => {
    const user = userEvent.setup()
    mockedRegister.mockResolvedValue(buildRegisterResponse())
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await screen.findByText(/החשבון מוכן/)
    await user.click(screen.getByRole('button', { name: /הוספת חשבון נוסף/ }))

    // Above all the password field: leaving the previous colleague's credential
    // sitting in it would be a quiet way to hand it to the next one.
    expect(await screen.findByLabelText(new RegExp(PASSWORD_LABEL))).toHaveValue('')
    expect(screen.getByLabelText(new RegExp(EMAIL_LABEL))).toHaveValue('')
  })

  it('blocks a second submit while the first is still in flight', async () => {
    const user = userEvent.setup()
    mockedRegister.mockImplementation(() => new Promise(() => {}))
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    const button = await screen.findByRole('button', { name: 'יוצרים את החשבון…' })
    expect(button).toBeDisabled()
    expect(mockedRegister).toHaveBeenCalledTimes(1)
  })

  it('explains a duplicate email inline and keeps what was typed', async () => {
    const user = userEvent.setup()
    mockedRegister.mockRejectedValue(buildErrorWithStatus(409))
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(await screen.findByRole('alert')).toHaveTextContent('לכתובת הזו כבר יש חשבון')
    // Throwing away the form for a request that did not land would be its own
    // small cruelty.
    expect(screen.getByLabelText(new RegExp(NAME_LABEL))).toHaveValue('דנה לוי')
    expect(screen.getByRole('button', { name: SUBMIT_LABEL })).toBeEnabled()
  })

  it('does not say who owns the address that is already taken', async () => {
    const user = userEvent.setup()
    mockedRegister.mockRejectedValue(buildErrorWithStatus(409))
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('השתמשו בכתובת אחרת')
  })

  it('uses a toast, not the inline message, when the gateway itself fails', async () => {
    const user = userEvent.setup()
    mockedRegister.mockRejectedValue(new Error('Network Error'))
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await waitFor(() => expect(mockedToastError).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/לכתובת הזו כבר יש חשבון/)).not.toBeInTheDocument()
  })

  it('clears a previous duplicate warning once the next attempt succeeds', async () => {
    const user = userEvent.setup()
    mockedRegister.mockRejectedValue(buildErrorWithStatus(409))
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))
    await screen.findByRole('alert')

    mockedRegister.mockResolvedValue(buildRegisterResponse())
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(await screen.findByText(/החשבון מוכן/)).toBeInTheDocument()
    expect(screen.queryByText(/לכתובת הזו כבר יש חשבון/)).not.toBeInTheDocument()
  })

  it('does not carry the confirmation across a visit to another screen', async () => {
    const user = userEvent.setup()
    mockedRegister.mockResolvedValue(buildRegisterResponse())
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))
    await screen.findByText(/החשבון מוכן/)

    await user.click(screen.getByRole('link', { name: /חזרה לממשק הניהול/ }))
    await screen.findByRole('heading', { level: 1, name: DASHBOARD_HEADING })
    await user.click(screen.getByRole('link', { name: /חשבונות צוות/ }))

    expect(
      await screen.findByRole('heading', { level: 1, name: STAFF_HEADING }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/החשבון מוכן/)).not.toBeInTheDocument()
  })
})

describe('Staff Accounts accessibility', () => {
  it('marks every field required for assistive technology', async () => {
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })

    for (const label of [NAME_LABEL, EMAIL_LABEL, PASSWORD_LABEL]) {
      expect(screen.getByLabelText(new RegExp(label))).toHaveAttribute('aria-required', 'true')
    }
  })

  it('masks the password by default and lets the Admin reveal it', async () => {
    const user = userEvent.setup()
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    expect(screen.getByLabelText(new RegExp(PASSWORD_LABEL))).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'הצגת הסיסמה' }))

    expect(screen.getByLabelText(new RegExp(PASSWORD_LABEL))).toHaveAttribute('type', 'text')
  })

  it('announces a duplicate email rather than only tinting the box red', async () => {
    const user = userEvent.setup()
    mockedRegister.mockRejectedValue(buildErrorWithStatus(409))
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    // role="alert" is what makes a screen reader read it out at all.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('does not put the new account’s password anywhere it can be read back', async () => {
    const user = userEvent.setup()
    mockedRegister.mockResolvedValue(buildRegisterResponse())
    renderAt('/admin/staff')

    await screen.findByRole('heading', { level: 1, name: STAFF_HEADING })
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await screen.findByText(/החשבון מוכן/)
    // The confirmation names the account, never the credential.
    expect(document.body.textContent).not.toContain('a-good-password')
  })
})
