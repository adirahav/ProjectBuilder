import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { toast } from 'sonner'

import { useStore } from '../store/store'
import { translate } from '../i18n/strings'
import { decideBackButtonAction, EXIT_PROMPT_WINDOW_MS } from './backButtonLogic'

/**
 * Wires the Android hardware/gesture back button (and its iOS equivalent) to
 * the decision table in backButtonLogic, for the Capacitor build only.
 *
 * Mount this exactly once, at the app root. Two things are deliberate:
 *
 * 1. **The listener is registered once, on mount, and reads state through refs
 *    and `useStore.getState()` when the event actually fires.** Re-subscribing
 *    on every route change would mean tearing down and rebuilding a native
 *    bridge listener on each navigation, and worse, a press landing in that gap
 *    would fall through to Capacitor's default handler — which pops the WebView
 *    history or exits the app outright, bypassing every rule here.
 * 2. **Nothing runs on web.** `Capacitor.isNativePlatform()` gates the whole
 *    effect, so a browser build never registers a bridge listener, never shows
 *    the exit toast, and behaves exactly as it did before this hook existed.
 */
export function useNativeBackButton() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Refs, not effect dependencies — see note 1 above.
  const navigateRef = useRef(navigate)
  const pathnameRef = useRef(pathname)

  /** When the "press again" offer was made, or null when no offer is open. */
  const exitPromptAtRef = useRef<number | null>(null)

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  useEffect(() => {
    pathnameRef.current = pathname
    // Leaving the screen withdraws any pending exit offer: a press on the root
    // after navigating elsewhere and back must warn again, never exit silently.
    exitPromptAtRef.current = null
  }, [pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const handleBackButton = () => {
      const { token, locale, closeTopModal, openModals } = useStore.getState()

      const action = decideBackButtonAction({
        pathname: pathnameRef.current,
        isAuthenticated: Boolean(token),
        isModalOpen: openModals.length > 0,
        lastExitPromptAt: exitPromptAtRef.current,
        now: Date.now(),
      })

      // Any press that is not itself the exit offer closes the offer.
      if (action.type !== 'promptExit') exitPromptAtRef.current = null

      switch (action.type) {
        case 'closeModal': {
          const outcome = closeTopModal()
          // A dialog mid-write refuses to close. Saying so is required: a
          // consumed press with no response reads as a frozen app.
          if (outcome === 'blocked') {
            toast.message(translate(locale, 'nativeBack.modalBusy'))
          }
          console.log(`[NATIVE] back button closed the top modal (${outcome})`)
          return
        }

        case 'promptExit': {
          exitPromptAtRef.current = Date.now()
          toast.message(translate(locale, 'nativeBack.pressAgainToExit'), {
            duration: EXIT_PROMPT_WINDOW_MS,
          })
          return
        }

        case 'exitApp': {
          console.log('[NATIVE] back button sent the app to the background')
          // Background, not exit: the user is leaving the screen, not asking to
          // have their in-progress booking torn down.
          void CapacitorApp.minimizeApp().catch(() => {
            console.log('[NATIVE] could not send the app to the background')
          })
          return
        }

        case 'navigateTo': {
          // `replace` so the screen we are leaving does not stay in history for
          // the next back press to fall into.
          navigateRef.current(action.path, { replace: true })
          return
        }

        case 'navigateBack': {
          navigateRef.current(-1)
          return
        }
      }
    }

    let detach: (() => void) | null = null
    let isCancelled = false

    void CapacitorApp.addListener('backButton', handleBackButton)
      .then((handle) => {
        // The subscription resolves asynchronously across the bridge; if the
        // app root unmounted first, drop it immediately rather than leaking it.
        if (isCancelled) {
          void handle.remove()
          return
        }
        detach = () => void handle.remove()
      })
      .catch(() => {
        console.log('[NATIVE] could not register the back-button listener')
      })

    return () => {
      isCancelled = true
      detach?.()
    }
  }, [])
}
