import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignupPage } from './SignupPage'
import { useStore } from '../store/store'
import { getAuthToken } from '../services/util.service'

/**
 * End-to-end flow coverage for the signup screen: the real page, the real
 * validation utils, the real service and store — only the network boundary
 * (`fetch`) is stubbed (.rule/testing-rules.md).
 */

const USER_BASE_URL = 'http://localhost:4002'

const VALID = {
  fullName: 'הילה כהן',
  email: 'hila@example.com',
  password: 'Aegean2026',
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

function renderPage() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  )
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('שם מלא'), VALID.fullName)
  await user.type(screen.getByLabelText('אימייל'), VALID.email)
  await user.type(screen.getByLabelText('סיסמה'), VALID.password)
}

beforeEach(() => {
  vi.stubEnv('VITE_USER_SERVICE_BASE_URL', USER_BASE_URL)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('location', { pathname: '/signup', assign: vi.fn() })
  useStore.getState().clearSession()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('SignupPage — form accessibility', () => {
  it('renders every field with a real associated label', () => {
    renderPage()

    expect(screen.getByLabelText('שם מלא')).toBeInTheDocument()
    expect(screen.getByLabelText('אימייל')).toBeInTheDocument()
    expect(screen.getByLabelText('סיסמה')).toBeInTheDocument()
  })

  it('states up front that signup never grants admin permissions', () => {
    renderPage()

    expect(screen.getByText(/הרשאות\s*ניהול מוענקות על ידי מנהל קיים/)).toBeInTheDocument()
  })
})

describe('SignupPage — password visibility toggle', () => {
  it('masks the password by default', () => {
    renderPage()

    expect(screen.getByLabelText('סיסמה')).toHaveAttribute('type', 'password')
  })

  it('reveals the password and flips its accessible label when toggled', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'הצגת הסיסמה' }))

    expect(screen.getByLabelText('סיסמה')).toHaveAttribute('type', 'text')
    const toggle = screen.getByRole('button', { name: 'הסתרת הסיסמה' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('masks the password again on a second toggle', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'הצגת הסיסמה' }))
    await user.click(screen.getByRole('button', { name: 'הסתרת הסיסמה' }))

    expect(screen.getByLabelText('סיסמה')).toHaveAttribute('type', 'password')
  })
})

describe('SignupPage — client-side validation', () => {
  it('blocks submission and shows inline errors for an empty form', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'הרשמה' }))

    expect(await screen.findByText('יש להזין שם מלא')).toBeInTheDocument()
    expect(screen.getByText('יש להזין כתובת אימייל')).toBeInTheDocument()
    expect(screen.getByText('יש להזין סיסמה')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('marks an invalid field with aria-invalid and links its error message', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('אימייל'), 'nope')
    await user.click(screen.getByRole('button', { name: 'הרשמה' }))

    const emailInput = await screen.findByLabelText('אימייל')
    expect(emailInput).toHaveAttribute('aria-invalid', 'true')
    expect(emailInput.getAttribute('aria-describedby')).toContain('email-error')
  })

  it('rejects a weak password before reaching the network', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('שם מלא'), VALID.fullName)
    await user.type(screen.getByLabelText('אימייל'), VALID.email)
    await user.type(screen.getByLabelText('סיסמה'), 'short')
    await user.click(screen.getByRole('button', { name: 'הרשמה' }))

    expect(await screen.findByText('הסיסמה חייבת להכיל לפחות 8 תווים')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clears a field error as soon as the user corrects it', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'הרשמה' }))
    expect(await screen.findByText('יש להזין שם מלא')).toBeInTheDocument()

    await user.type(screen.getByLabelText('שם מלא'), VALID.fullName)

    await waitFor(() => expect(screen.queryByText('יש להזין שם מלא')).not.toBeInTheDocument())
  })
})

describe('SignupPage — successful signup flow', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        token: 'test.jwt.token',
        user: { id: 'u1', ...VALID, password: undefined, roles: ['user'] },
      }),
    )
  })

  it('posts the form to the signup endpoint of user-management-service', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'הרשמה' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe(`${USER_BASE_URL}/api/auth/signup`)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual(VALID)
  })

  it('shows a neutral success state with no admin-implying language', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'הרשמה' }))

    const success = await screen.findByRole('status')
    expect(success).toHaveTextContent('החשבון נוצר בהצלחה')
    expect(success).toHaveTextContent('פנו למנהל קיים')
    expect(success.textContent).not.toMatch(/הרשאות ניהול הוענקו|מסך הניהול|לוח הבקרה/)
  })

  it('establishes a plain user session, never an admin one', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'הרשמה' }))

    await screen.findByRole('status')
    await waitFor(async () => expect(await getAuthToken()).toBe('test.jwt.token'))
    expect(useStore.getState().currentUser?.roles).toEqual(['user'])
  })
})

describe('SignupPage — failure flows', () => {
  it('shows a duplicate-email conflict inline on the field, staying on the page', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { message: 'Email already registered', code: 'EMAIL_TAKEN' }),
    )
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'הרשמה' }))

    expect(await screen.findByText('כתובת האימייל כבר רשומה במערכת')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'הרשמה' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the form usable after a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'הרשמה' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'הרשמה' })).not.toBeDisabled(),
    )
    expect(screen.getByLabelText('אימייל')).toHaveValue(VALID.email)
    expect(useStore.getState().isAuthenticated).toBe(false)
  })

  it('does not sign the user in when the server rejects the payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { message: 'Invalid payload' }))
    const user = userEvent.setup()
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'הרשמה' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(useStore.getState().isAuthenticated).toBe(false)
    await expect(getAuthToken()).resolves.toBeNull()
  })
})
