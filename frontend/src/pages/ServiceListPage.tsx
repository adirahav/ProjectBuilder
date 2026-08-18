import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, PawPrint } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '../components/common/PageHeader'
import { StateMessage } from '../components/common/StateMessage'
import { ServiceList } from '../components/service/ServiceList'
import { ServiceListSkeleton } from '../components/service/ServiceListSkeleton'
import { useI18n } from '../hooks/useI18n'
import { useStore } from '../store/store'
import { translate } from '../i18n/strings'

/**
 * Screen 1 — the public Service List (PRD F1). Unauthenticated by design: no
 * logged-in check belongs on this page.
 */
export function ServiceListPage() {
  const { t } = useI18n()
  const navigate = useNavigate()

  const services = useStore((state) => state.services)
  const isLoading = useStore((state) => state.isLoadingServices)
  const hasError = useStore((state) => state.hasServicesError)
  const loadServices = useStore((state) => state.loadServices)

  const handleLoad = useCallback(async () => {
    try {
      await loadServices()
    } catch {
      // The locale is read at failure time rather than closed over, so this
      // callback stays stable and switching language never refires the fetch.
      toast.error(translate(useStore.getState().locale, 'serviceList.error.toast'))
    }
  }, [loadServices])

  useEffect(() => {
    void handleLoad()
  }, [handleLoad])

  const handleBook = (serviceId: string) => {
    navigate(`/book/${serviceId}`)
  }

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title={t('serviceList.title')}
        subtitle={t('serviceList.subtitle')}
        className="mb-6 md:mb-8"
      />

      {/* One live region wraps every outcome, so a screen reader hears the
          list arriving, the empty message, or the failure without re-navigating. */}
      <section aria-live="polite" aria-busy={isLoading}>
        {isLoading ? (
          <>
            <span className="sr-only">{t('serviceList.loading')}</span>
            <ServiceListSkeleton />
          </>
        ) : hasError ? (
          <StateMessage
            icon={AlertTriangle}
            tone="danger"
            title={t('serviceList.error.title')}
            body={t('serviceList.error.body')}
            actionLabel={t('common.retry')}
            onAction={() => void handleLoad()}
          />
        ) : services.length === 0 ? (
          <StateMessage
            icon={PawPrint}
            title={t('serviceList.empty.title')}
            body={t('serviceList.empty.body')}
          />
        ) : (
          <ServiceList
            services={services}
            label={t('serviceList.regionLabel')}
            onBook={handleBook}
          />
        )}
      </section>
    </main>
  )
}
