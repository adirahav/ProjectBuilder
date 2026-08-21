import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AppRoutes } from '../App'
import { appointmentService } from '../services/appointment.service'
import { authService } from '../services/auth.service'
import { utilService } from '../services/util.service'
import { useStore } from '../store/store'
import { buildAdminAppointment } from '../test/factories'

vi.mock('../services/appointment.service', async () => {
  // The real 409/404 predicates are kept: telling "that booking already moved
  // on" apart from "the gateway is down" is part of what is under test here.
  const actual =
    await vi.importActual<typeof import('../services/appointment.service')>(
      '../services/appointment.service',
    )

  return {
    ...actual,
    appointmentService: {
      create: vi.fn(),
      getReceipt: vi.fn(),
      getAdminList: vi.fn(),
      confirm: vi.fn(),
      cancel: vi.fn(),
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

const mockedGetAdminList = vi.mocked(appointmentService.getAdminList)
const mockedConfirm = vi.mocked(appointmentService.confirm)
const mockedCancel = vi.mocked(appointmentService.cancel)
const mockedToastError = vi.mocked(toast.error)
const mockedToastSuccess = vi.mocked(toast.success)

// The app defaults to Hebrew, so these are the labels a real Admin sees.
const HEADING = 'תורים'
const CONFIRM_LABEL = 'אישור'
const CANCEL_LABEL = 'ביטול'
const CANCEL_SUBMIT_LABEL = 'ביטול התור'
const KEEP_LABEL = 'להשאיר את התור'
const STATUS_FILTER_LABEL = 'סטטוס'
const DATE_FILTER_LABEL = 'תאריך'
const CLEAR_FILTER_LABEL = 'ניקוי הסינון'
const FILTER_LEGEND = 'סינון הרשימה'

function buildErrorWithStatus(status: number): AxiosError {
  const error = new AxiosError(`Request failed with status code ${status}`)
  error.response = {
    status,
    statusText: 'Error',
    data: { error: 'Error' },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
  return error
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/admin/appointments']}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

/** Waits for the guard to finish and the first load to land. */
async function renderLoadedPage() {
  renderPage()
  await screen.findByRole('heading', { level: 1, name: HEADING })
  await waitFor(() => expect(mockedGetAdminList).toHaveBeenCalled())
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({
    adminAppointments: [],
    isLoadingAdminAppointments: false,
    hasAdminAppointmentsError: false,
    appointmentFilter: {},
    isSavingAppointment: false,
  })

  vi.mocked(authService.readToken).mockResolvedValue('stored-token')
  vi.mocked(authService.clearToken).mockResolvedValue(undefined)
  vi.mocked(utilService.getFromStorage).mockResolvedValue(null)
  mockedGetAdminList.mockResolvedValue([])
})

describe('the Admin Appointments list', () => {
  it('turns an unauthenticated visitor away', async () => {
    vi.mocked(authService.readToken).mockResolvedValue(null)

    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'כניסת מנהל' }),
    ).toBeInTheDocument()
    expect(mockedGetAdminList).not.toHaveBeenCalled()
  })

  it('shows each booking with its treatment, customer and status', async () => {
    mockedGetAdminList.mockResolvedValue([
      buildAdminAppointment({
        customerName: 'Dana Levi',
        customerPhone: '050-123-4567',
        service: { name: 'Full groom', durationMinutes: 90, price: 220 },
      }),
    ])

    await renderLoadedPage()

    const row = await screen.findByRole('row', { name: /Dana Levi/ })
    expect(within(row).getByText('Full groom')).toBeInTheDocument()
    expect(within(row).getByText('050-123-4567')).toBeInTheDocument()
    expect(within(row).getByText('ממתין לאישור')).toBeInTheDocument()
  })

  it('states the status in words, never by colour alone', async () => {
    mockedGetAdminList.mockResolvedValue([
      buildAdminAppointment({ customerName: 'Dana Levi', status: 'cancelled' }),
    ])

    await renderLoadedPage()

    // A cancelled and a confirmed booking are opposite instructions to a person
    // about to groom a dog; greyscale has to be enough to tell them apart.
    // Scoped to the row, since the filter's <option>s name the statuses too.
    const row = await screen.findByRole('row', { name: /Dana Levi/ })
    expect(within(row).getByText('בוטל')).toBeInTheDocument()
  })

  it('keeps the wall-clock time range reading left-to-right in the Hebrew table', async () => {
    mockedGetAdminList.mockResolvedValue([buildAdminAppointment({ customerName: 'Dana Levi' })])

    await renderLoadedPage()

    const row = await screen.findByRole('row', { name: /Dana Levi/ })
    // Without the isolation the bidi algorithm swaps the two sides in an RTL
    // row, turning 09:00–10:30 into an appointment that ends before it starts.
    // Matched loosely around the dash: the query normalizes the thin spaces
    // formatTimeRange puts either side of it down to ordinary whitespace.
    expect(within(row).getByText(/09:00\s*–\s*10:30/)).toHaveAttribute('dir', 'ltr')
  })

  it('offers a way to call the customer', async () => {
    mockedGetAdminList.mockResolvedValue([
      buildAdminAppointment({ customerName: 'Dana Levi', customerPhone: '050-123-4567' }),
    ])

    await renderLoadedPage()

    const link = await screen.findByRole('link', { name: /050-123-4567/ })
    expect(link).toHaveAttribute('href', 'tel:050-123-4567')
  })

  it('still renders a booking whose treatment is no longer on record', async () => {
    mockedGetAdminList.mockResolvedValue([
      buildAdminAppointment({ customerName: 'Dana Levi', service: undefined }),
    ])

    await renderLoadedPage()

    // Omitting a fact is honest where inventing one would not be.
    expect(await screen.findByText('הטיפול כבר אינו רשום')).toBeInTheDocument()
  })

  it('explains an empty diary rather than showing a bare table', async () => {
    mockedGetAdminList.mockResolvedValue([])

    await renderLoadedPage()

    expect(await screen.findByText('אין עדיין תורים')).toBeInTheDocument()
  })

  it('explains a load failure and offers a retry that works', async () => {
    mockedGetAdminList.mockRejectedValueOnce(buildErrorWithStatus(500))

    await renderLoadedPage()

    expect(await screen.findByText('לא הצלחנו לטעון את התורים')).toBeInTheDocument()
    expect(mockedToastError).toHaveBeenCalled()

    mockedGetAdminList.mockResolvedValue([buildAdminAppointment({ customerName: 'Dana Levi' })])
    await userEvent.setup().click(screen.getByRole('button', { name: 'נסו שוב' }))

    expect(await screen.findByRole('row', { name: /Dana Levi/ })).toBeInTheDocument()
  })
})

describe('filtering the Admin Appointments list', () => {
  it('asks the server again when the status filter changes', async () => {
    await renderLoadedPage()

    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText(STATUS_FILTER_LABEL), 'confirmed')

    await waitFor(() =>
      expect(mockedGetAdminList).toHaveBeenLastCalledWith({ status: 'confirmed' }),
    )
  })

  it('asks the server again when the date filter changes', async () => {
    await renderLoadedPage()

    const dateField = screen.getByLabelText(DATE_FILTER_LABEL)
    await userEvent.setup().type(dateField, '2026-08-18')

    await waitFor(() =>
      expect(mockedGetAdminList).toHaveBeenLastCalledWith({ date: '2026-08-18' }),
    )
  })

  it('narrows the two filters independently, so neither clears the other', async () => {
    await renderLoadedPage()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(DATE_FILTER_LABEL), '2026-08-18')
    await user.selectOptions(screen.getByLabelText(STATUS_FILTER_LABEL), 'pending')

    await waitFor(() =>
      expect(mockedGetAdminList).toHaveBeenLastCalledWith({
        date: '2026-08-18',
        status: 'pending',
      }),
    )
  })

  it('says a filter matched nothing differently from an empty diary', async () => {
    await renderLoadedPage()

    mockedGetAdminList.mockResolvedValue([])
    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText(STATUS_FILTER_LABEL), 'cancelled')

    expect(await screen.findByText('אין תורים שמתאימים לסינון הזה')).toBeInTheDocument()
  })

  it('lets the Admin clear the filter and see everything again', async () => {
    await renderLoadedPage()
    const user = userEvent.setup()

    await user.selectOptions(screen.getByLabelText(STATUS_FILTER_LABEL), 'cancelled')

    // Scoped to the filter fieldset: the "no matches" empty state offers a
    // clear-filters action with the very same label.
    const filters = screen.getByRole('group', { name: FILTER_LEGEND })
    await user.click(await within(filters).findByRole('button', { name: CLEAR_FILTER_LABEL }))

    await waitFor(() => expect(mockedGetAdminList).toHaveBeenLastCalledWith({}))
  })
})

describe('confirming an appointment', () => {
  it('offers Confirm only on a booking that is still pending', async () => {
    mockedGetAdminList.mockResolvedValue([
      buildAdminAppointment({ customerName: 'Confirmed Person', status: 'confirmed' }),
      buildAdminAppointment({ customerName: 'Cancelled Person', status: 'cancelled' }),
    ])

    await renderLoadedPage()

    const confirmedRow = await screen.findByRole('row', { name: /Confirmed Person/ })
    const cancelledRow = screen.getByRole('row', { name: /Cancelled Person/ })

    // Absent, not disabled: a control that could never do anything is noise in
    // the tab order.
    expect(within(confirmedRow).queryByRole('button', { name: /אישור/ })).not.toBeInTheDocument()
    expect(within(cancelledRow).queryByRole('button', { name: /אישור/ })).not.toBeInTheDocument()
    expect(within(cancelledRow).queryByRole('button', { name: /ביטול/ })).not.toBeInTheDocument()
  })

  it('confirms without a second prompt and shows the new status', async () => {
    const pending = buildAdminAppointment({ customerName: 'Dana Levi', status: 'pending' })
    mockedGetAdminList.mockResolvedValue([pending])
    mockedConfirm.mockResolvedValue({ ...pending, status: 'confirmed' })

    await renderLoadedPage()
    const row = await screen.findByRole('row', { name: /Dana Levi/ })

    await userEvent.setup().click(within(row).getByRole('button', { name: /אישור/ }))

    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith(pending.id))
    await waitFor(() =>
      expect(
        within(screen.getByRole('row', { name: /Dana Levi/ })).getByText('מאושר'),
      ).toBeInTheDocument(),
    )
    expect(mockedToastSuccess).toHaveBeenCalled()
  })

  it('reloads the list and says so when the booking had already moved on', async () => {
    const pending = buildAdminAppointment({ customerName: 'Dana Levi', status: 'pending' })
    mockedGetAdminList.mockResolvedValue([pending])
    mockedConfirm.mockRejectedValue(buildErrorWithStatus(409))

    await renderLoadedPage()
    const row = await screen.findByRole('row', { name: /Dana Levi/ })
    mockedGetAdminList.mockClear()

    await userEvent.setup().click(within(row).getByRole('button', { name: /אישור/ }))

    // A 409 means the list went stale, not that the Admin should retry
    // something that could never succeed.
    await waitFor(() => expect(mockedGetAdminList).toHaveBeenCalled())
    expect(mockedToastError).toHaveBeenCalledWith('התור הזה כבר השתנה. הרשימה רועננה.')
  })

  it('reports a plain failure without pretending the status changed', async () => {
    const pending = buildAdminAppointment({ customerName: 'Dana Levi', status: 'pending' })
    mockedGetAdminList.mockResolvedValue([pending])
    mockedConfirm.mockRejectedValue(buildErrorWithStatus(500))

    await renderLoadedPage()
    const row = await screen.findByRole('row', { name: /Dana Levi/ })

    await userEvent.setup().click(within(row).getByRole('button', { name: /אישור/ }))

    await waitFor(() => expect(mockedToastError).toHaveBeenCalled())
    expect(within(row).getByText('ממתין לאישור')).toBeInTheDocument()
  })
})

describe('cancelling an appointment', () => {
  async function openCancelDialog(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
    const row = await screen.findByRole('row', { name })
    await user.click(within(row).getByRole('button', { name: /ביטול/ }))
    return screen.findByRole('dialog')
  }

  it('asks before cancelling, since the customer loses their booking', async () => {
    mockedGetAdminList.mockResolvedValue([
      buildAdminAppointment({ customerName: 'Dana Levi', status: 'confirmed' }),
    ])

    await renderLoadedPage()
    await openCancelDialog(userEvent.setup(), /Dana Levi/)

    expect(mockedCancel).not.toHaveBeenCalled()
  })

  it('does not cancel when the Admin backs out of the question', async () => {
    mockedGetAdminList.mockResolvedValue([
      buildAdminAppointment({ customerName: 'Dana Levi', status: 'confirmed' }),
    ])

    await renderLoadedPage()
    const user = userEvent.setup()
    const dialog = await openCancelDialog(user, /Dana Levi/)

    await user.click(within(dialog).getByRole('button', { name: KEEP_LABEL }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockedCancel).not.toHaveBeenCalled()
  })

  it('cancels once confirmed and shows the released booking as cancelled', async () => {
    const confirmed = buildAdminAppointment({ customerName: 'Dana Levi', status: 'confirmed' })
    mockedGetAdminList.mockResolvedValue([confirmed])
    mockedCancel.mockResolvedValue({ ...confirmed, status: 'cancelled' })

    await renderLoadedPage()
    const user = userEvent.setup()
    const dialog = await openCancelDialog(user, /Dana Levi/)

    await user.click(within(dialog).getByRole('button', { name: CANCEL_SUBMIT_LABEL }))

    await waitFor(() => expect(mockedCancel).toHaveBeenCalledWith(confirmed.id))
    await waitFor(() =>
      expect(
        within(screen.getByRole('row', { name: /Dana Levi/ })).getByText('בוטל'),
      ).toBeInTheDocument(),
    )
    expect(mockedToastSuccess).toHaveBeenCalledWith('התור בוטל, והשעה חזרה להיות פנויה.')
  })

  it('offers Cancel on a pending booking too, not only a confirmed one', async () => {
    const pending = buildAdminAppointment({ customerName: 'Dana Levi', status: 'pending' })
    mockedGetAdminList.mockResolvedValue([pending])
    mockedCancel.mockResolvedValue({ ...pending, status: 'cancelled' })

    await renderLoadedPage()
    const user = userEvent.setup()
    const dialog = await openCancelDialog(user, /Dana Levi/)

    await user.click(within(dialog).getByRole('button', { name: CANCEL_SUBMIT_LABEL }))

    await waitFor(() => expect(mockedCancel).toHaveBeenCalledWith(pending.id))
  })

  it('closes the question and explains when the booking was already cancelled', async () => {
    mockedGetAdminList.mockResolvedValue([
      buildAdminAppointment({ customerName: 'Dana Levi', status: 'confirmed' }),
    ])
    mockedCancel.mockRejectedValue(buildErrorWithStatus(409))

    await renderLoadedPage()
    const user = userEvent.setup()
    const dialog = await openCancelDialog(user, /Dana Levi/)

    await user.click(within(dialog).getByRole('button', { name: CANCEL_SUBMIT_LABEL }))

    // The question has been answered either way; the toast carries what happened.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockedToastError).toHaveBeenCalledWith('התור הזה כבר השתנה. הרשימה רועננה.')
  })

  it('explains when the booking no longer exists at all', async () => {
    mockedGetAdminList.mockResolvedValue([
      buildAdminAppointment({ customerName: 'Dana Levi', status: 'confirmed' }),
    ])
    mockedCancel.mockRejectedValue(buildErrorWithStatus(404))

    await renderLoadedPage()
    const user = userEvent.setup()
    const dialog = await openCancelDialog(user, /Dana Levi/)

    await user.click(within(dialog).getByRole('button', { name: CANCEL_SUBMIT_LABEL }))

    await waitFor(() =>
      expect(mockedToastError).toHaveBeenCalledWith('התור הזה כבר לא קיים. הרשימה רועננה.'),
    )
  })

  it('sends exactly one cancel however fast the Admin double-clicks', async () => {
    const confirmed = buildAdminAppointment({ customerName: 'Dana Levi', status: 'confirmed' })
    mockedGetAdminList.mockResolvedValue([confirmed])
    mockedCancel.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ...confirmed, status: 'cancelled' }), 20),
        ),
    )

    await renderLoadedPage()
    const user = userEvent.setup()
    const dialog = await openCancelDialog(user, /Dana Levi/)

    const submit = within(dialog).getByRole('button', { name: CANCEL_SUBMIT_LABEL })
    await user.click(submit)
    await user.click(submit).catch(() => undefined)

    await waitFor(() => expect(mockedCancel).toHaveBeenCalledTimes(1))
  })
})

describe('reaching the Admin Appointments page', () => {
  it('is linked from the Admin dashboard', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    const link = await screen.findByRole('link', { name: /תורים/ })
    expect(link).toHaveAttribute('href', '/admin/appointments')
  })

  it('offers a way back to the dashboard', async () => {
    await renderLoadedPage()

    expect(screen.getByRole('link', { name: /חזרה לממשק הניהול/ })).toHaveAttribute(
      'href',
      '/admin',
    )
  })

  it('reaches every filter and row action by keyboard', async () => {
    mockedGetAdminList.mockResolvedValue([
      buildAdminAppointment({ customerName: 'Dana Levi', status: 'pending' }),
    ])

    await renderLoadedPage()
    await screen.findByRole('row', { name: /Dana Levi/ })

    for (const control of [
      screen.getByLabelText(DATE_FILTER_LABEL),
      screen.getByLabelText(STATUS_FILTER_LABEL),
      screen.getByRole('button', { name: new RegExp(CONFIRM_LABEL) }),
      screen.getByRole('button', { name: new RegExp(CANCEL_LABEL) }),
    ]) {
      control.focus()
      expect(control).toHaveFocus()
    }
  })
})
