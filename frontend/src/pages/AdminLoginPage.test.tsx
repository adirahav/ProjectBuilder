import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AppRoutes } from '../App'
import { authService } from '../services/auth.service'
import { utilService } from '../services/util.service'
import { buildLoginResponse } from '../test/factories'

vi.mock('../services/auth.service', async () => {
  // The real 401 predicate is preserved: telling "wrong password" apart from
  // "the gateway is down" is exactly the behaviour under test here.
  const actual =
    await vi.importActual<typeof import('../services/auth.service')>('../services/auth.service')

  return {
    ...actual,
    authService: {
      login: vi.fn(),
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
const mockedLogin = vi.mocked(authService.login)
const mockedReadToken = vi.mocked(authService.readToken)
const mockedToastError = vi.mocked(toast.error)
const mockedToastSuccess = vi.mocked(toast.success)

const IDENTIFIER_LABEL = 'דוא״ל או שם משתמש'
const PASSWORD_LABEL = 'סיסמה'
const SUBMIT_LABEL = 'כניסה'
const DASHBOARD_HEADING = 'ממשק הניהול'
const LOGIN_HEADING = 'כניסת מנהל'

function buildErrorWithStatus(status: number): AxiosError {
  const error = new AxiosError(`Request failed with status code ${status}`)
  error.response = {
    status,
    statusText: 'Error',
    data: { error: 'Invalid credentials' },
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

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(new RegExp(IDENTIFIER_LABEL)), 'admin@example.com')
  await user.type(screen.getByLabelText(new RegExp(PASSWORD_LABEL)), 'a-password')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(authService.saveToken).mockResolvedValue(undefined)
  vi.mocked(authService.clearToken).mockResolvedValue(undefined)
  vi.mocked(utilService.saveToStorage).mockResolvedValue(undefined)
  vi.mocked(utilService.getFromStorage).mockResolvedValue(null)
  mockedReadToken.mockResolvedValue(null)
})

describe('Admin Login page', () => {
  it('offers an identifier and a password field, each reachable by its label', () => {
    renderAt('/admin/login')

    expect(screen.getByLabelText(new RegExp(IDENTIFIER_LABEL))).toBeInTheDocument()
    expect(screen.getByLabelText(new RegExp(PASSWORD_LABEL))).toBeInTheDocument()
  })

  it('masks the password by default', () => {
    renderAt('/admin/login')

    expect(screen.getByLabelText(new RegExp(PASSWORD_LABEL))).toHaveAttribute('type', 'password')
  })

  it('lets the Admin reveal the password rather than retype it blind', async () => {
    const user = userEvent.setup()
    renderAt('/admin/login')

    await user.click(screen.getByRole('button', { name: 'הצגת הסיסמה' }))

    expect(screen.getByLabelText(new RegExp(PASSWORD_LABEL))).toHaveAttribute('type', 'text')
  })
})

describe('Admin Login validation', () => {
  it('refuses to sign in with an empty form, and says so inline', async () => {
    const user = userEvent.setup()
    renderAt('/admin/login')

    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(await screen.findByText(/אנא הזינו דוא״ל או שם משתמש/)).toBeInTheDocument()
    expect(screen.getByText(/אנא הזינו סיסמה/)).toBeInTheDocument()
    expect(mockedLogin).not.toHaveBeenCalled()
  })

  it('never uses a toast for a problem it caught itself', async () => {
    const user = userEvent.setup()
    renderAt('/admin/login')

    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await screen.findByText(/אנא הזינו סיסמה/)
    expect(mockedToastError).not.toHaveBeenCalled()
  })

  it('ties the message to the field it belongs to', async () => {
    const user = userEvent.setup()
    renderAt('/admin/login')

    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    const passwordInput = await screen.findByLabelText(new RegExp(PASSWORD_LABEL))
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true')
    expect(passwordInput).toHaveAccessibleDescription(/אנא הזינו סיסמה/)
  })

  it('clears an error as soon as the Admin starts fixing it', async () => {
    const user = userEvent.setup()
    renderAt('/admin/login')

    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))
    await screen.findByText(/אנא הזינו סיסמה/)

    await user.type(screen.getByLabelText(new RegExp(PASSWORD_LABEL)), 'x')

    await waitFor(() => expect(screen.queryByText(/אנא הזינו סיסמה/)).not.toBeInTheDocument())
  })
})

describe('signing in', () => {
  it('sends exactly what was typed', async () => {
    const user = userEvent.setup()
    mockedLogin.mockResolvedValue(buildLoginResponse())
    renderAt('/admin/login')

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await waitFor(() =>
      expect(mockedLogin).toHaveBeenCalledWith({
        identifier: 'admin@example.com',
        password: 'a-password',
      }),
    )
  })

  it('lands on the Admin dashboard once the token is issued', async () => {
    const user = userEvent.setup()
    mockedLogin.mockResolvedValue(buildLoginResponse())
    renderAt('/admin/login')

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(
      await screen.findByRole('heading', { level: 1, name: DASHBOARD_HEADING }),
    ).toBeInTheDocument()
    expect(mockedToastSuccess).toHaveBeenCalledTimes(1)
  })

  it('stores the issued token so the session survives a refresh', async () => {
    const user = userEvent.setup()
    mockedLogin.mockResolvedValue(buildLoginResponse({ token: 'issued-token' }))
    renderAt('/admin/login')

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await waitFor(() =>
      expect(vi.mocked(authService.saveToken)).toHaveBeenCalledWith('issued-token'),
    )
  })

  it('blocks a second submit while the first is still in flight', async () => {
    const user = userEvent.setup()
    mockedLogin.mockImplementation(() => new Promise(() => {}))
    renderAt('/admin/login')

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    const button = await screen.findByRole('button', { name: 'מתחברים…' })
    expect(button).toBeDisabled()
    expect(mockedLogin).toHaveBeenCalledTimes(1)
  })

  it('explains rejected credentials inline and stays on the form', async () => {
    const user = userEvent.setup()
    mockedLogin.mockRejectedValue(buildErrorWithStatus(401))
    renderAt('/admin/login')

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(await screen.findByRole('alert')).toHaveTextContent('פרטי הכניסה אינם מתאימים')
    expect(screen.getByRole('heading', { level: 1, name: LOGIN_HEADING })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: SUBMIT_LABEL })).toBeEnabled()
  })

  it('does not reveal which half of the credentials was wrong', async () => {
    const user = userEvent.setup()
    mockedLogin.mockRejectedValue(buildErrorWithStatus(401))
    renderAt('/admin/login')

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    const alert = await screen.findByRole('alert')
    // Naming the wrong field would turn this form into an account-existence
    // oracle, which is precisely what the generic server message avoids.
    expect(alert).not.toHaveTextContent(/דוא״ל או שם משתמש אינו קיים/)
    expect(alert).toHaveTextContent('בדקו את הדוא״ל או שם המשתמש ואת הסיסמה')
  })

  it('uses a toast, not the inline message, when the gateway itself fails', async () => {
    const user = userEvent.setup()
    mockedLogin.mockRejectedValue(new Error('Network Error'))
    renderAt('/admin/login')

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await waitFor(() => expect(mockedToastError).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('פרטי הכניסה אינם מתאימים')).not.toBeInTheDocument()
  })

  it('clears a previous rejection when the next attempt succeeds', async () => {
    const user = userEvent.setup()
    mockedLogin.mockRejectedValue(buildErrorWithStatus(401))
    renderAt('/admin/login')

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))
    await screen.findByRole('alert')

    mockedLogin.mockResolvedValue(buildLoginResponse())
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(
      await screen.findByRole('heading', { level: 1, name: DASHBOARD_HEADING }),
    ).toBeInTheDocument()
  })
})

describe('the ProtectedRoute guard', () => {
  it('turns an unauthenticated visitor away from the Admin dashboard', async () => {
    renderAt('/admin')

    expect(
      await screen.findByRole('heading', { level: 1, name: LOGIN_HEADING }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: DASHBOARD_HEADING })).not.toBeInTheDocument()
  })

  it('lets a persisted session straight through after a refresh', async () => {
    mockedReadToken.mockResolvedValue('stored-token')

    renderAt('/admin')

    expect(
      await screen.findByRole('heading', { level: 1, name: DASHBOARD_HEADING }),
    ).toBeInTheDocument()
  })

  it('waits for the stored session before deciding, instead of bouncing on first paint', async () => {
    mockedReadToken.mockResolvedValue('stored-token')

    renderAt('/admin')

    // The session is still being read: neither answer is correct yet.
    expect(screen.getByRole('status')).toHaveTextContent('בודקים את החיבור שלכם')
    await screen.findByRole('heading', { level: 1, name: DASHBOARD_HEADING })
  })

  it('returns the Admin to where they were headed after signing in', async () => {
    const user = userEvent.setup()
    mockedLogin.mockResolvedValue(buildLoginResponse())
    renderAt('/admin')

    await screen.findByRole('heading', { level: 1, name: LOGIN_HEADING })
    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(
      await screen.findByRole('heading', { level: 1, name: DASHBOARD_HEADING }),
    ).toBeInTheDocument()
  })

  it('keeps an already-signed-in Admin off the login form', async () => {
    mockedReadToken.mockResolvedValue('stored-token')

    renderAt('/admin/login')

    expect(
      await screen.findByRole('heading', { level: 1, name: DASHBOARD_HEADING }),
    ).toBeInTheDocument()
  })
})

describe('signing out', () => {
  it('drops the session and returns to the login form', async () => {
    const user = userEvent.setup()
    mockedReadToken.mockResolvedValue('stored-token')
    renderAt('/admin')

    await screen.findByRole('heading', { level: 1, name: DASHBOARD_HEADING })
    await user.click(screen.getByRole('button', { name: 'יציאה' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: LOGIN_HEADING }),
    ).toBeInTheDocument()
    expect(vi.mocked(authService.clearToken)).toHaveBeenCalledTimes(1)
  })
})

describe('Admin Login accessibility', () => {
  it('signs in with the keyboard alone', async () => {
    const user = userEvent.setup()
    mockedLogin.mockResolvedValue(buildLoginResponse())
    renderAt('/admin/login')

    screen.getByLabelText(new RegExp(IDENTIFIER_LABEL)).focus()
    await user.keyboard('admin@example.com')
    await user.tab()
    await user.keyboard('a-password')
    await user.keyboard('{Enter}')

    expect(
      await screen.findByRole('heading', { level: 1, name: DASHBOARD_HEADING }),
    ).toBeInTheDocument()
  })

  it('marks both fields required for assistive technology', () => {
    renderAt('/admin/login')

    expect(screen.getByLabelText(new RegExp(IDENTIFIER_LABEL))).toHaveAttribute(
      'aria-required',
      'true',
    )
    expect(screen.getByLabelText(new RegExp(PASSWORD_LABEL))).toHaveAttribute(
      'aria-required',
      'true',
    )
  })

  it('announces a rejected login rather than only tinting the box red', async () => {
    const user = userEvent.setup()
    mockedLogin.mockRejectedValue(buildErrorWithStatus(401))
    renderAt('/admin/login')

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    // role="alert" is what makes a screen reader read it out at all.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
