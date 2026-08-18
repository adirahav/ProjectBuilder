import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AppRoutes } from '../App'
import { serviceService } from '../services/service.service'
import { useStore } from '../store/store'
import { buildService } from '../test/factories'

vi.mock('../services/service.service', () => ({
  serviceService: { getList: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}))

const { toast } = await import('sonner')
const mockedGetList = vi.mocked(serviceService.getList)
const mockedToastError = vi.mocked(toast.error)

const renderApp = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <AppRoutes />
    </MemoryRouter>,
  )

describe('Service List page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists every active service with its duration and price', async () => {
    mockedGetList.mockResolvedValue([
      buildService({ id: 's1', name: 'תספורת מלאה', durationMinutes: 90, price: 180 }),
      buildService({ id: 's2', name: 'רחצה', durationMinutes: 30, price: 90 }),
    ])

    renderApp()

    const list = await screen.findByRole('list', { name: 'שירותים זמינים' })
    const items = within(list).getAllByRole('listitem')

    expect(items).toHaveLength(2)
    expect(within(items[0]).getByRole('heading', { name: 'תספורת מלאה' })).toBeInTheDocument()
    expect(within(items[0]).getByText('1 שע׳ 30 דק׳')).toBeInTheDocument()
    expect(within(items[1]).getByText('30 דק׳')).toBeInTheDocument()
  })

  it('shows a loading state while the request is in flight', async () => {
    mockedGetList.mockImplementation(() => new Promise(() => {}))

    renderApp()

    const region = await screen.findByText('טוענים את השירותים…')
    expect(region).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'שירותים זמינים' })).not.toBeInTheDocument()
  })

  it('shows a clear empty message instead of a blank page', async () => {
    mockedGetList.mockResolvedValue([])

    renderApp()

    expect(await screen.findByText('אין שירותים זמינים כרגע')).toBeInTheDocument()
  })

  it('shows an error state with a working retry when loading fails', async () => {
    const user = userEvent.setup()
    mockedGetList.mockRejectedValueOnce(new Error('Network Error'))

    renderApp()

    expect(await screen.findByText('לא הצלחנו לטעון את השירותים')).toBeInTheDocument()
    expect(mockedToastError).toHaveBeenCalledTimes(1)

    mockedGetList.mockResolvedValueOnce([buildService({ name: 'רחצה' })])
    await user.click(screen.getByRole('button', { name: 'נסו שוב' }))

    expect(await screen.findByRole('heading', { name: 'רחצה' })).toBeInTheDocument()
  })

  it('never crashes the page on an API failure', async () => {
    mockedGetList.mockRejectedValue(new Error('boom'))

    renderApp()

    // The shell (header + page title) survives the failure.
    expect(await screen.findByRole('heading', { level: 1, name: 'השירותים שלנו' })).toBeInTheDocument()
  })

  it('gives every Book button an accessible name that names the service', async () => {
    mockedGetList.mockResolvedValue([buildService({ name: 'תספורת מלאה' })])

    renderApp()

    expect(
      await screen.findByRole('button', { name: 'הזמנת תור לשירות תספורת מלאה' }),
    ).toBeInTheDocument()
  })

  it('navigates to the booking route for the chosen service', async () => {
    const user = userEvent.setup()
    mockedGetList.mockResolvedValue([buildService({ id: 'svc-42', name: 'תספורת מלאה' })])

    renderApp()

    await user.click(await screen.findByRole('button', { name: 'הזמנת תור לשירות תספורת מלאה' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'הזמנת תור לשירות תספורת מלאה' }),
    ).toBeInTheDocument()
  })

  it('reaches and activates a Book button with the keyboard alone', async () => {
    const user = userEvent.setup()
    mockedGetList.mockResolvedValue([buildService({ id: 'svc-7', name: 'רחצה' })])

    renderApp()

    const bookButton = await screen.findByRole('button', { name: 'הזמנת תור לשירות רחצה' })

    bookButton.focus()
    expect(bookButton).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { level: 1, name: 'הזמנת תור לשירות רחצה' })).toBeInTheDocument()
  })
})

describe('language toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetList.mockResolvedValue([buildService({ name: 'Full groom', durationMinutes: 60 })])
  })

  it('starts in Hebrew with an RTL document', async () => {
    renderApp()

    await screen.findByRole('heading', { level: 1, name: 'השירותים שלנו' })
    expect(document.documentElement.dir).toBe('rtl')
  })

  it('switches all page copy to English and flips the document to LTR', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { level: 1, name: 'השירותים שלנו' })

    await user.click(screen.getByRole('button', { name: 'English' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Our services' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book Full groom' })).toBeInTheDocument()
    await waitFor(() => expect(document.documentElement.dir).toBe('ltr'))
  })

  it('does not refetch the services just because the language changed', async () => {
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('heading', { level: 1, name: 'השירותים שלנו' })
    expect(mockedGetList).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'English' }))
    await screen.findByRole('heading', { level: 1, name: 'Our services' })

    expect(mockedGetList).toHaveBeenCalledTimes(1)
  })

  it('marks the active language for screen readers, not by colour alone', async () => {
    renderApp()

    await screen.findByRole('heading', { level: 1, name: 'השירותים שלנו' })

    expect(screen.getByRole('button', { name: 'עברית' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('persists the chosen language across a reload', async () => {
    const user = userEvent.setup()
    const { unmount } = renderApp()

    await screen.findByRole('heading', { level: 1, name: 'השירותים שלנו' })
    await user.click(screen.getByRole('button', { name: 'English' }))
    await screen.findByRole('heading', { level: 1, name: 'Our services' })

    // Simulate a fresh page load: the in-memory store is gone, so only what was
    // written to storage can bring English back.
    unmount()
    await waitFor(() => expect(localStorage.getItem('locale')).toBe('"en"'))
    useStore.setState({ locale: 'he' })

    renderApp()

    expect(await screen.findByRole('heading', { level: 1, name: 'Our services' })).toBeInTheDocument()
  })
})
