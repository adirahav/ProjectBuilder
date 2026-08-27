import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bus, ClipboardList, LayoutGrid, LogOut, type LucideIcon } from 'lucide-react'
import { PassengerManifestTab } from '../components/admin/PassengerManifestTab'
import { SeatManagementTab } from '../components/admin/SeatManagementTab'
import { ToursBusesTab } from '../components/admin/ToursBusesTab'
import { authService } from '../services/auth.service'
import { cn } from '../lib/utils'
import { useStore } from '../store/store'

/**
 * Screen 4 — Admin Dashboard shell (plan 009, Step 2).
 *
 * Three tabs: Seat Management (4a), Tours & Buses (4b), and Passenger Manifest
 * Report (4c). The shell owns nothing but which tab is active; each tab owns its
 * own data fetching, loading/error/empty states, and filters.
 *
 * The admin guard used to be inlined here; it now lives in
 * `components/routing/AdminRoute.tsx`, wrapping this page's route in `App.tsx`,
 * so a second admin-only page does not have to repeat it. That guard is UX only
 * — server-side JWT verification is the real boundary.
 *
 * Active-tab state is deliberately local rather than a Zustand slice: no other
 * component needs to read or change it, and .rule/coding-rules.md keeps state
 * local until it is genuinely shared. The tour/bus **selection**, which tabs 4a
 * and 4c do share, already lives in the `tour`/`bus` slices — so switching
 * between those two tabs keeps the admin on the same bus rather than resetting
 * the selector.
 *
 * Tabs are mounted one at a time. Unmounting a hidden tab drops the passenger
 * PII the manifest tab holds as soon as the admin navigates away from it, which
 * a permanently-mounted-but-hidden panel would keep in memory indefinitely.
 *
 * Accessibility: a real `tablist`/`tab`/`tabpanel` structure with roving focus
 * and arrow-key navigation. Arrow direction is mirrored for RTL — `ArrowLeft`
 * moves to the *next* tab, because in this layout the next tab is to the left.
 */

type AdminTabId = 'seats' | 'tours' | 'manifest'

const TABS = [
  { id: 'seats', label: 'ניהול מושבים', icon: LayoutGrid },
  { id: 'tours', label: 'טיולים ואוטובוסים', icon: Bus },
  { id: 'manifest', label: 'רשימת נוסעים', icon: ClipboardList },
] as const satisfies readonly { id: AdminTabId; label: string; icon: LucideIcon }[]

export function AdminPage() {
  const navigate = useNavigate()
  const currentUser = useStore((state) => state.currentUser)

  const [activeTab, setActiveTab] = useState<AdminTabId>('seats')
  const tabRefs = useRef<Partial<Record<AdminTabId, HTMLButtonElement | null>>>({})
  const baseId = useId()

  async function handleLogout() {
    await authService.logout()
    navigate('/', { replace: true })
  }

  function focusTab(tabId: AdminTabId) {
    setActiveTab(tabId)
    tabRefs.current[tabId]?.focus()
  }

  function handleTabKeyDown(ev: KeyboardEvent<HTMLButtonElement>, index: number) {
    // RTL: ArrowLeft advances, ArrowRight goes back — matching what the user
    // sees, not the physical key name.
    const delta = ev.key === 'ArrowLeft' ? 1 : ev.key === 'ArrowRight' ? -1 : 0

    if (delta !== 0) {
      ev.preventDefault()
      focusTab(TABS[(index + delta + TABS.length) % TABS.length].id)
      return
    }

    if (ev.key === 'Home') {
      ev.preventDefault()
      focusTab(TABS[0].id)
    } else if (ev.key === 'End') {
      ev.preventDefault()
      focusTab(TABS[TABS.length - 1].id)
    }
  }

  return (
    <div className="min-h-dvh pb-12">
      <header className="sticky top-0 z-30 bg-primary-900 text-n-0 shadow-md">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-lg bg-accent-500"
            >
              <Bus className="size-4" />
            </span>
            <span className="text-body font-bold">הילה טיולים</span>
            <span className="rounded-full bg-n-0/10 px-3 py-1 text-caption font-medium">
              אזור ניהול
            </span>
          </span>

          <span className="flex items-center gap-3">
            {currentUser?.fullName ? (
              <span className="text-caption text-n-0/80">{currentUser.fullName}</span>
            ) : null}
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-9 items-center gap-2 rounded-lg border border-n-0/25 px-3 text-caption font-medium text-n-0 transition hover:bg-n-0/10"
            >
              <LogOut aria-hidden="true" className="size-4" />
              התנתקות
            </button>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-4 py-6">
        <h1 className="text-h1 text-primary-900">לוח ניהול</h1>
        <p className="mt-2 text-label text-n-500">
          ניהול המושבים, הטיולים והאוטובוסים, והפקת רשימת הנוסעים.
        </p>

        <div
          role="tablist"
          aria-label="אזורי לוח הניהול"
          className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-n-100 bg-n-0 p-1 shadow-sm"
        >
          {TABS.map((tab, index) => {
            const isActive = tab.id === activeTab
            const Icon = tab.icon

            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[tab.id] = node
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`${baseId}-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(ev) => handleTabKeyDown(ev, index)}
                className={cn(
                  'flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap',
                  'rounded-lg px-4 text-label font-medium transition duration-200',
                  isActive
                    ? 'bg-primary-700 text-n-0 shadow-sm'
                    : 'text-n-700 hover:bg-n-50',
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {tab.label}
              </button>
            )
          })}
        </div>

        <div
          role="tabpanel"
          id={`${baseId}-panel-${activeTab}`}
          aria-labelledby={`${baseId}-tab-${activeTab}`}
          tabIndex={0}
          className="mt-6"
        >
          {activeTab === 'seats' ? <SeatManagementTab /> : null}
          {activeTab === 'tours' ? <ToursBusesTab /> : null}
          {activeTab === 'manifest' ? <PassengerManifestTab /> : null}
        </div>
      </main>
    </div>
  )
}
