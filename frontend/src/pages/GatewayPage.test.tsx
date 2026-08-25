import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GatewayPage } from './GatewayPage'
import { authService } from '../services/auth.service'
import { ApiError, NetworkError } from '../services/http.service'
import { useStore } from '../store/store'
import type { LoginResponse } from '../types/auth.types'

/**
 * Screen 1 behaviour tests: the two entry paths, and the login modal's failure
 * contract (stays open, stays editable, one generic message, no navigation).
 *
 * `authService` is mocked — no test reaches `http.service.ts` or a real API
 * (.rule/testing-rules.md).
 */

vi.mock('../services/auth.service', () => ({
  authService: { login: vi.fn(), logout: vi.fn(), signup: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const loginMock = vi.mocked(authService.login)

const ADMIN_LOGIN_RESPONSE: LoginResponse = {
  token: 'test.jwt.token',
  user: {
    id: 'u1',
    fullName: 'הילה כהן',
    email: 'hila@example.com',
    roles: ['admin'],
  },
}

/** Renders the gateway with real routing so navigation is observable. */
function renderGateway() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<GatewayPage />} />
        <Route path="/tours" element={<h1>מסך הנוסע</h1>} />
        <Route path="/admin" element={<h1>אזור הניהול</h1>} />
        <Route path="/signup" element={<h1>יצירת חשבון</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function openLoginModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /כניסת מנהל/ }))
  return screen.getByRole('dialog')
}

beforeEach(() => {
  useStore.getState().clearSession()
})

describe('GatewayPage entry choices', () => {
  it('offers both entry paths', () => {
    renderGateway()

    expect(screen.getByRole('button', { name: /המשך כנוסע/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /כניסת מנהל/ })).toBeInTheDocument()
  })

  it('sends a passenger straight through with no auth step and no modal', async () => {
    const user = userEvent.setup()
    renderGateway()

    await user.click(screen.getByRole('button', { name: /המשך כנוסע/ }))

    expect(screen.getByRole('heading', { name: 'מסך הנוסע' })).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('links to signup for admins without an account', async () => {
    const user = userEvent.setup()
    renderGateway()

    await user.click(screen.getByRole('link', { name: 'הרשמה' }))

    expect(screen.getByRole('heading', { name: 'יצירת חשבון' })).toBeInTheDocument()
  })

  it('does not open the login modal until the admin entry is chosen', () => {
    renderGateway()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('AdminLoginModal', () => {
  it('opens a labelled dialog and focuses the first field', async () => {
    const user = userEvent.setup()
    renderGateway()

    const dialog = await openLoginModal(user)

    expect(dialog).toHaveAccessibleName('כניסת מנהל')
    await waitFor(() => expect(screen.getByLabelText('אימייל')).toHaveFocus())
  })

  it('traps Tab inside the dialog so focus never reaches the page behind it', async () => {
    const user = userEvent.setup()
    renderGateway()
    const dialog = await openLoginModal(user)

    // Walk forward past the last control — focus must wrap back into the dialog.
    for (let i = 0; i < 8; i += 1) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }

    // And backwards from the first control.
    await user.tab({ shift: true })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('closes on Escape without logging in', async () => {
    const user = userEvent.setup()
    renderGateway()
    await openLoginModal(user)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('closes on the cancel button', async () => {
    const user = userEvent.setup()
    renderGateway()
    await openLoginModal(user)

    await user.click(screen.getByRole('button', { name: 'ביטול' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows inline validation errors without calling the API', async () => {
    const user = userEvent.setup()
    renderGateway()
    await openLoginModal(user)

    await user.click(screen.getByRole('button', { name: 'התחברות' }))

    expect(await screen.findByText('יש להזין כתובת אימייל')).toBeInTheDocument()
    expect(screen.getByText('יש להזין סיסמה')).toBeInTheDocument()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('submits the entered credentials to the auth service', async () => {
    const user = userEvent.setup()
    loginMock.mockResolvedValue(ADMIN_LOGIN_RESPONSE)
    renderGateway()
    await openLoginModal(user)

    await user.type(screen.getByLabelText('אימייל'), 'hila@example.com')
    await user.type(screen.getByLabelText('סיסמה'), 'Aegean2026')
    await user.click(screen.getByRole('button', { name: 'התחברות' }))

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        email: 'hila@example.com',
        password: 'Aegean2026',
      }),
    )
  })

  it('closes the modal and redirects to the admin area on success', async () => {
    const user = userEvent.setup()
    loginMock.mockResolvedValue(ADMIN_LOGIN_RESPONSE)
    renderGateway()
    await openLoginModal(user)

    await user.type(screen.getByLabelText('אימייל'), 'hila@example.com')
    await user.type(screen.getByLabelText('סיסמה'), 'Aegean2026')
    await user.click(screen.getByRole('button', { name: 'התחברות' }))

    expect(await screen.findByRole('heading', { name: 'אזור הניהול' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the modal open and editable with one generic error on invalid credentials', async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue(new ApiError(401, 'Invalid credentials', 'INVALID_CREDENTIALS'))
    renderGateway()
    await openLoginModal(user)

    await user.type(screen.getByLabelText('אימייל'), 'hila@example.com')
    await user.type(screen.getByLabelText('סיסמה'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'התחברות' }))

    expect(await screen.findByText('כתובת האימייל או הסיסמה שגויים')).toBeInTheDocument()
    // No navigation, no close, and the fields keep what the user typed.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'אזור הניהול' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('אימייל')).toHaveValue('hila@example.com')
    expect(screen.getByLabelText('סיסמה')).toBeEnabled()
  })

  it('does not reveal whether the failure was a bad password or a non-admin account', async () => {
    const user = userEvent.setup()
    // The server answers every credential failure mode with the same 401, and
    // the UI must render the same copy for all of them.
    loginMock.mockRejectedValue(new ApiError(401, 'User is not an admin', 'INVALID_CREDENTIALS'))
    renderGateway()
    await openLoginModal(user)

    await user.type(screen.getByLabelText('אימייל'), 'passenger@example.com')
    await user.type(screen.getByLabelText('סיסמה'), 'Aegean2026')
    await user.click(screen.getByRole('button', { name: 'התחברות' }))

    expect(await screen.findByText('כתובת האימייל או הסיסמה שגויים')).toBeInTheDocument()
    expect(screen.queryByText(/admin/i)).not.toBeInTheDocument()
  })

  it('clears the previous rejection as soon as the user edits a field', async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue(new ApiError(401, 'Invalid credentials'))
    renderGateway()
    await openLoginModal(user)

    await user.type(screen.getByLabelText('אימייל'), 'hila@example.com')
    await user.type(screen.getByLabelText('סיסמה'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'התחברות' }))
    expect(await screen.findByText('כתובת האימייל או הסיסמה שגויים')).toBeInTheDocument()

    await user.type(screen.getByLabelText('סיסמה'), 'x')

    expect(screen.queryByText('כתובת האימייל או הסיסמה שגויים')).not.toBeInTheDocument()
  })

  it('reports a network failure distinctly from bad credentials', async () => {
    const user = userEvent.setup()
    loginMock.mockRejectedValue(new NetworkError('Network request failed'))
    renderGateway()
    await openLoginModal(user)

    await user.type(screen.getByLabelText('אימייל'), 'hila@example.com')
    await user.type(screen.getByLabelText('סיסמה'), 'Aegean2026')
    await user.click(screen.getByRole('button', { name: 'התחברות' }))

    expect(await screen.findByText('אין חיבור לשרת. נסו שוב בעוד רגע')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('disables the submit button and shows a loading state while submitting', async () => {
    const user = userEvent.setup()
    let resolveLogin: (value: LoginResponse) => void = () => {}
    loginMock.mockReturnValue(
      new Promise<LoginResponse>((resolve) => {
        resolveLogin = resolve
      }),
    )
    renderGateway()
    await openLoginModal(user)

    await user.type(screen.getByLabelText('אימייל'), 'hila@example.com')
    await user.type(screen.getByLabelText('סיסמה'), 'Aegean2026')
    await user.click(screen.getByRole('button', { name: 'התחברות' }))

    const submitButton = await screen.findByRole('button', { name: /מתחבר/ })
    expect(submitButton).toBeDisabled()

    resolveLogin(ADMIN_LOGIN_RESPONSE)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('toggles password visibility without losing the typed value', async () => {
    const user = userEvent.setup()
    renderGateway()
    await openLoginModal(user)

    await user.type(screen.getByLabelText('סיסמה'), 'Aegean2026')
    expect(screen.getByLabelText('סיסמה')).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'הצגת הסיסמה' }))

    expect(screen.getByLabelText('סיסמה')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('סיסמה')).toHaveValue('Aegean2026')
  })

  it('discards typed credentials when the modal is dismissed and reopened', async () => {
    const user = userEvent.setup()
    renderGateway()
    await openLoginModal(user)

    await user.type(screen.getByLabelText('סיסמה'), 'Aegean2026')
    await user.keyboard('{Escape}')
    await openLoginModal(user)

    expect(screen.getByLabelText('סיסמה')).toHaveValue('')
  })
})
