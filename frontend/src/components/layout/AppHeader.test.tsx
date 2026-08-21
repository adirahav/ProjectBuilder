import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AppHeader } from './AppHeader'
import { useStore } from '../../store/store'

const navigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderHeader() {
  return render(
    <MemoryRouter>
      <AppHeader />
    </MemoryRouter>,
  )
}

describe('AppHeader — auth affordance', () => {
  beforeEach(() => {
    navigate.mockClear()
    // English pins the copy the assertions below match on, independently of
    // whichever locale the app defaults to.
    useStore.setState({ locale: 'en', token: null, admin: null, isHydratingAuth: false })
  })

  it('renders a Log in link to the Admin login route when nobody is signed in', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/admin/login')
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument()
  })

  it('renders a Log out button and the signed-in identity when a session exists', () => {
    useStore.setState({ token: 'jwt', admin: { id: 'a1', email: 'admin@studio.test' } })

    renderHeader()

    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
    expect(screen.getByText(/admin@studio\.test/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument()
  })

  it('falls back to a bare Log out button when the cached identity has no email', () => {
    useStore.setState({ token: 'jwt', admin: null })

    renderHeader()

    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
  })

  it('clears the session and redirects home when Log out is clicked', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    useStore.setState({ token: 'jwt', admin: { id: 'a1', email: 'admin@studio.test' }, logout })

    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: /log out/i }))

    expect(logout).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/', { replace: true })
  })

  it('shows neither affordance until the persisted session has been read', () => {
    // A flash of "Log in" during hydration would tell a signed-in Admin they
    // are signed out on every refresh.
    useStore.setState({ token: null, admin: null, isHydratingAuth: true })

    renderHeader()

    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument()
  })
})
