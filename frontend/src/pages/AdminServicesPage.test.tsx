import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AppRoutes } from '../App'
import { authService } from '../services/auth.service'
import { serviceService } from '../services/service.service'
import { utilService } from '../services/util.service'
import { useStore } from '../store/store'
import { buildService } from '../test/factories'

vi.mock('../services/service.service', async () => {
  // The real 404 predicate is kept: telling "that record is gone" apart from
  // "the gateway is down" is part of what is under test here.
  const actual =
    await vi.importActual<typeof import('../services/service.service')>(
      '../services/service.service',
    )

  return {
    ...actual,
    serviceService: {
      getList: vi.fn(),
      getAllList: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deactivate: vi.fn(),
    },
  }
})

vi.mock('../services/auth.service', () => ({
  authService: {
    login: vi.fn(),
    saveToken: vi.fn(),
    readToken: vi.fn(),
    clearToken: vi.fn(),
  },
}))

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

const mockedGetAllList = vi.mocked(serviceService.getAllList)
const mockedCreate = vi.mocked(serviceService.create)
const mockedUpdate = vi.mocked(serviceService.update)
const mockedDeactivate = vi.mocked(serviceService.deactivate)
const mockedToastError = vi.mocked(toast.error)
const mockedToastSuccess = vi.mocked(toast.success)

// The app defaults to Hebrew, so the labels a real Admin sees are Hebrew.
const HEADING = 'שירותים'
const ADD_LABEL = 'הוספת שירות'
const NAME_LABEL = 'שם הטיפול'
const DURATION_LABEL = 'משך הטיפול \\(דקות\\)'
const PRICE_LABEL = 'מחיר'
const CREATE_SUBMIT_LABEL = 'הוספת השירות'
const SAVE_CHANGES_LABEL = 'שמירת השינויים'
const CONFIRM_LABEL = 'הפסקת ההצעה'

function buildErrorWithStatus(status: number): AxiosError {
  const error = new AxiosError(`Request failed with status code ${status}`)
  error.response = {
    status,
    statusText: 'Error',
    data: { error: 'Service not found' },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
  return error
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/admin/services']}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

/** Waits for the guard to finish and the list to arrive. */
async function renderLoadedPage() {
  renderPage()
  await screen.findByRole('heading', { level: 1, name: HEADING })
  await waitFor(() => expect(mockedGetAllList).toHaveBeenCalled())
}

async function openCreateForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: ADD_LABEL }))
  return screen.findByRole('dialog')
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ adminServices: [], services: [], isSavingService: false })

  vi.mocked(authService.readToken).mockResolvedValue('stored-token')
  vi.mocked(authService.clearToken).mockResolvedValue(undefined)
  vi.mocked(utilService.getFromStorage).mockResolvedValue(null)
  mockedGetAllList.mockResolvedValue([])
})

describe('the Admin Services list', () => {
  it('turns an unauthenticated visitor away', async () => {
    vi.mocked(authService.readToken).mockResolvedValue(null)

    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'כניסת מנהל' }),
    ).toBeInTheDocument()
    expect(mockedGetAllList).not.toHaveBeenCalled()
  })

  it('loads every service, deactivated ones included', async () => {
    mockedGetAllList.mockResolvedValue([
      buildService({ name: 'Full groom', isActive: true }),
      buildService({ name: 'Retired trim', isActive: false }),
    ])

    await renderLoadedPage()

    expect(await screen.findByRole('rowheader', { name: 'Full groom' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Retired trim' })).toBeInTheDocument()
  })

  it('shows the duration and price of each treatment', async () => {
    mockedGetAllList.mockResolvedValue([
      buildService({ name: 'Full groom', durationMinutes: 90, price: 220 }),
    ])

    await renderLoadedPage()

    const row = await screen.findByRole('row', { name: /Full groom/ })
    expect(within(row).getByText(/90|1 שע/)).toBeInTheDocument()
    expect(within(row).getByText(/220/)).toBeInTheDocument()
  })

  it('says "not offered" in words, not by colour alone', async () => {
    mockedGetAllList.mockResolvedValue([buildService({ name: 'Retired trim', isActive: false })])

    await renderLoadedPage()

    const row = await screen.findByRole('row', { name: /Retired trim/ })
    expect(within(row).getByText('אינו מוצע')).toBeInTheDocument()
  })

  it('offers no deactivate action on a service that is already not offered', async () => {
    mockedGetAllList.mockResolvedValue([buildService({ name: 'Retired trim', isActive: false })])

    await renderLoadedPage()

    const row = await screen.findByRole('row', { name: /Retired trim/ })
    expect(within(row).queryByRole('button', { name: /הפסקת ההצעה/ })).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /עריכת/ })).toBeInTheDocument()
  })

  it('explains an empty clinic instead of showing a bare table', async () => {
    mockedGetAllList.mockResolvedValue([])

    await renderLoadedPage()

    expect(await screen.findByText('אין עדיין שירותים רשומים')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('offers a retry and a toast when the list cannot be loaded', async () => {
    mockedGetAllList.mockRejectedValue(new Error('Network Error'))

    await renderLoadedPage()

    expect(await screen.findByText('לא הצלחנו לטעון את השירותים')).toBeInTheDocument()
    await waitFor(() => expect(mockedToastError).toHaveBeenCalledTimes(1))

    const user = userEvent.setup()
    mockedGetAllList.mockResolvedValue([buildService({ name: 'Full groom' })])
    await user.click(screen.getByRole('button', { name: 'נסו שוב' }))

    expect(await screen.findByRole('rowheader', { name: 'Full groom' })).toBeInTheDocument()
  })
})

describe('creating a service', () => {
  it('sends exactly what was typed', async () => {
    const user = userEvent.setup()
    mockedCreate.mockResolvedValue(buildService({ name: 'Bath' }))
    await renderLoadedPage()

    await openCreateForm(user)
    await user.type(screen.getByLabelText(new RegExp(NAME_LABEL)), 'Bath')
    await user.type(screen.getByLabelText(new RegExp(DURATION_LABEL)), '45')
    await user.type(screen.getByLabelText(new RegExp(PRICE_LABEL)), '120')
    await user.click(screen.getByRole('button', { name: CREATE_SUBMIT_LABEL }))

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith({ name: 'Bath', durationMinutes: 45, price: 120 }),
    )
  })

  it('shows the new service in the list and confirms with a toast', async () => {
    const user = userEvent.setup()
    mockedCreate.mockResolvedValue(buildService({ name: 'Bath', isActive: true }))
    await renderLoadedPage()

    await openCreateForm(user)
    await user.type(screen.getByLabelText(new RegExp(NAME_LABEL)), 'Bath')
    await user.type(screen.getByLabelText(new RegExp(DURATION_LABEL)), '45')
    await user.type(screen.getByLabelText(new RegExp(PRICE_LABEL)), '120')
    await user.click(screen.getByRole('button', { name: CREATE_SUBMIT_LABEL }))

    expect(await screen.findByRole('rowheader', { name: 'Bath' })).toBeInTheDocument()
    expect(mockedToastSuccess).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('never offers to create an already-hidden service', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await openCreateForm(user)

    expect(screen.queryByLabelText(/מוצע ללקוחות/)).not.toBeInTheDocument()
  })

  it('rejects an empty form inline, without calling the API', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await openCreateForm(user)
    await user.click(screen.getByRole('button', { name: CREATE_SUBMIT_LABEL }))

    expect(await screen.findByText(/אנא הזינו שם לטיפול/)).toBeInTheDocument()
    expect(screen.getByText(/אנא הזינו משך בדקות/)).toBeInTheDocument()
    expect(mockedCreate).not.toHaveBeenCalled()
    // A problem the client caught itself is never a toast.
    expect(mockedToastError).not.toHaveBeenCalled()
  })

  it('rejects a duration that is not a whole number of minutes', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await openCreateForm(user)
    await user.type(screen.getByLabelText(new RegExp(NAME_LABEL)), 'Bath')
    await user.type(screen.getByLabelText(new RegExp(DURATION_LABEL)), '45.5')
    await user.type(screen.getByLabelText(new RegExp(PRICE_LABEL)), '120')
    await user.click(screen.getByRole('button', { name: CREATE_SUBMIT_LABEL }))

    expect(await screen.findByText(/אנא הזינו מספר שלם של דקות/)).toBeInTheDocument()
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('ties each message to the field it belongs to', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await openCreateForm(user)
    await user.click(screen.getByRole('button', { name: CREATE_SUBMIT_LABEL }))

    const nameInput = await screen.findByLabelText(new RegExp(NAME_LABEL))
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput).toHaveAccessibleDescription(/אנא הזינו שם לטיפול/)
  })

  it('keeps the form open with the typed values when the write fails', async () => {
    const user = userEvent.setup()
    mockedCreate.mockRejectedValue(new Error('Network Error'))
    await renderLoadedPage()

    await openCreateForm(user)
    await user.type(screen.getByLabelText(new RegExp(NAME_LABEL)), 'Bath')
    await user.type(screen.getByLabelText(new RegExp(DURATION_LABEL)), '45')
    await user.type(screen.getByLabelText(new RegExp(PRICE_LABEL)), '120')
    await user.click(screen.getByRole('button', { name: CREATE_SUBMIT_LABEL }))

    await waitFor(() => expect(mockedToastError).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(new RegExp(NAME_LABEL))).toHaveValue('Bath')
  })

  it('blocks a second submit while the first is still in flight', async () => {
    const user = userEvent.setup()
    mockedCreate.mockImplementation(() => new Promise(() => {}))
    await renderLoadedPage()

    await openCreateForm(user)
    await user.type(screen.getByLabelText(new RegExp(NAME_LABEL)), 'Bath')
    await user.type(screen.getByLabelText(new RegExp(DURATION_LABEL)), '45')
    await user.type(screen.getByLabelText(new RegExp(PRICE_LABEL)), '120')
    await user.click(screen.getByRole('button', { name: CREATE_SUBMIT_LABEL }))

    const saving = await screen.findByRole('button', { name: 'שומרים…' })
    expect(saving).toBeDisabled()
    expect(mockedCreate).toHaveBeenCalledTimes(1)
  })
})

describe('editing a service', () => {
  const existing = buildService({
    name: 'Full groom',
    durationMinutes: 90,
    price: 220,
    isActive: true,
  })

  beforeEach(() => {
    mockedGetAllList.mockResolvedValue([existing])
  })

  it('opens pre-filled with the record being edited', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await user.click(await screen.findByRole('button', { name: /עריכת Full groom/ }))

    expect(await screen.findByLabelText(new RegExp(NAME_LABEL))).toHaveValue('Full groom')
    expect(screen.getByLabelText(new RegExp(DURATION_LABEL))).toHaveValue('90')
    expect(screen.getByLabelText(new RegExp(PRICE_LABEL))).toHaveValue('220')
  })

  it('sends only the field that changed', async () => {
    const user = userEvent.setup()
    mockedUpdate.mockResolvedValue({ ...existing, price: 250 })
    await renderLoadedPage()

    await user.click(await screen.findByRole('button', { name: /עריכת Full groom/ }))
    const price = await screen.findByLabelText(new RegExp(PRICE_LABEL))
    await user.clear(price)
    await user.type(price, '250')
    await user.click(screen.getByRole('button', { name: SAVE_CHANGES_LABEL }))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith(existing.id, { price: 250 }))
  })

  it('refuses to send a save that would change nothing', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await user.click(await screen.findByRole('button', { name: /עריכת Full groom/ }))
    await user.click(await screen.findByRole('button', { name: SAVE_CHANGES_LABEL }))

    expect(await screen.findByRole('alert')).toHaveTextContent('עדיין לא בוצע שינוי')
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('offers the active toggle so a retired treatment can be brought back', async () => {
    const user = userEvent.setup()
    const retired = buildService({ name: 'Retired trim', isActive: false })
    mockedGetAllList.mockResolvedValue([retired])
    mockedUpdate.mockResolvedValue({ ...retired, isActive: true })
    await renderLoadedPage()

    await user.click(await screen.findByRole('button', { name: /עריכת Retired trim/ }))
    await user.click(await screen.findByLabelText(/מוצע ללקוחות/))
    await user.click(screen.getByRole('button', { name: SAVE_CHANGES_LABEL }))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith(retired.id, { isActive: true }))
  })

  it('reflects the saved change in the list right away', async () => {
    const user = userEvent.setup()
    mockedUpdate.mockResolvedValue({ ...existing, name: 'Deluxe groom' })
    await renderLoadedPage()

    await user.click(await screen.findByRole('button', { name: /עריכת Full groom/ }))
    const name = await screen.findByLabelText(new RegExp(NAME_LABEL))
    await user.clear(name)
    await user.type(name, 'Deluxe groom')
    await user.click(screen.getByRole('button', { name: SAVE_CHANGES_LABEL }))

    expect(await screen.findByRole('rowheader', { name: 'Deluxe groom' })).toBeInTheDocument()
  })

  it('says the record is gone, and reloads, when the server answers 404', async () => {
    const user = userEvent.setup()
    mockedUpdate.mockRejectedValue(buildErrorWithStatus(404))
    await renderLoadedPage()

    await user.click(await screen.findByRole('button', { name: /עריכת Full groom/ }))
    const price = await screen.findByLabelText(new RegExp(PRICE_LABEL))
    await user.clear(price)
    await user.type(price, '250')
    await user.click(screen.getByRole('button', { name: SAVE_CHANGES_LABEL }))

    await waitFor(() =>
      expect(mockedToastError).toHaveBeenCalledWith('השירות הזה כבר לא קיים. הרשימה רועננה.'),
    )
    // A retry could never succeed, so the list is re-read instead.
    await waitFor(() => expect(mockedGetAllList).toHaveBeenCalledTimes(2))
  })
})

describe('deactivating a service', () => {
  const existing = buildService({ name: 'Full groom', isActive: true })

  beforeEach(() => {
    mockedGetAllList.mockResolvedValue([existing])
  })

  it('asks for confirmation before hiding a treatment from customers', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await user.click(await screen.findByRole('button', { name: /הפסקת ההצעה של Full groom/ }))

    expect(await screen.findByRole('dialog')).toHaveTextContent('להפסיק להציע את Full groom?')
    expect(mockedDeactivate).not.toHaveBeenCalled()
  })

  it('changes nothing when the confirmation is dismissed', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await user.click(await screen.findByRole('button', { name: /הפסקת ההצעה של Full groom/ }))
    await user.click(await screen.findByRole('button', { name: 'להמשיך להציע' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockedDeactivate).not.toHaveBeenCalled()
  })

  it('deactivates on confirmation and keeps the record in the Admin list', async () => {
    const user = userEvent.setup()
    mockedDeactivate.mockResolvedValue({ ...existing, isActive: false })
    await renderLoadedPage()

    await user.click(await screen.findByRole('button', { name: /הפסקת ההצעה של Full groom/ }))
    await user.click(await screen.findByRole('button', { name: CONFIRM_LABEL }))

    await waitFor(() => expect(mockedDeactivate).toHaveBeenCalledWith(existing.id))
    const row = await screen.findByRole('row', { name: /Full groom/ })
    expect(within(row).getByText('אינו מוצע')).toBeInTheDocument()
    expect(mockedToastSuccess).toHaveBeenCalledTimes(1)
  })

  it('reports a failed deactivation and leaves the service offered', async () => {
    const user = userEvent.setup()
    mockedDeactivate.mockRejectedValue(new Error('Network Error'))
    await renderLoadedPage()

    await user.click(await screen.findByRole('button', { name: /הפסקת ההצעה של Full groom/ }))
    await user.click(await screen.findByRole('button', { name: CONFIRM_LABEL }))

    await waitFor(() => expect(mockedToastError).toHaveBeenCalledTimes(1))
    const row = await screen.findByRole('row', { name: /Full groom/ })
    expect(within(row).getByText('מוצע ללקוחות')).toBeInTheDocument()
  })
})

describe('Admin Services accessibility', () => {
  it('marks the dialog as modal and names it', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    const dialog = await openCreateForm(user)

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('הוספת שירות')
  })

  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    await openCreateForm(user)

    await waitFor(() =>
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true),
    )
  })

  it('closes on Escape and returns focus to the control that opened it', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    const opener = screen.getByRole('button', { name: ADD_LABEL })
    await user.click(opener)
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.activeElement).toBe(opener)
  })

  it('keeps Tab inside the dialog rather than letting it wander behind', async () => {
    const user = userEvent.setup()
    await renderLoadedPage()

    const dialog = await openCreateForm(user)

    // Far more presses than the dialog has controls: focus must still be inside.
    for (let press = 0; press < 12; press += 1) {
      await user.tab()
    }

    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('creates a service with the keyboard alone', async () => {
    const user = userEvent.setup()
    mockedCreate.mockResolvedValue(buildService({ name: 'Bath' }))
    await renderLoadedPage()

    screen.getByRole('button', { name: ADD_LABEL }).focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('dialog')

    screen.getByLabelText(new RegExp(NAME_LABEL)).focus()
    await user.keyboard('Bath')
    await user.tab()
    await user.keyboard('45')
    await user.tab()
    await user.keyboard('120')
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith({ name: 'Bath', durationMinutes: 45, price: 120 }),
    )
  })

  it('announces the list while it is loading', async () => {
    mockedGetAllList.mockImplementation(() => new Promise(() => {}))

    renderPage()

    await screen.findByRole('heading', { level: 1, name: HEADING })
    expect(await screen.findByText('טוענים את השירותים…')).toBeInTheDocument()
  })
})

describe('Admin navigation', () => {
  it('reaches the Services screen from the dashboard', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 1, name: 'ממשק הניהול' })
    await user.click(screen.getByRole('link', { name: /ניהול השירותים/ }))

    expect(await screen.findByRole('heading', { level: 1, name: HEADING })).toBeInTheDocument()
  })
})
