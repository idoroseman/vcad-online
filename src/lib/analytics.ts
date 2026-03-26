import type { Router } from 'vue-router'

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const measurementId = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined)?.trim()

let initialized = false

function loadAnalyticsScript(tagId: string): void {
  if (document.querySelector(`script[data-ga-id="${tagId}"]`)) {
    return
  }

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`
  script.dataset.gaId = tagId
  document.head.appendChild(script)
}

function setupGtag(tagId: string): void {
  window.dataLayer = window.dataLayer ?? []

  if (!window.gtag) {
    window.gtag = (...args: unknown[]) => {
      window.dataLayer.push(args)
    }
  }

  window.gtag('js', new Date())
  window.gtag('config', tagId, { send_page_view: false })
}

function trackPageView(path: string): void {
  if (!window.gtag) {
    return
  }

  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  })
}

export function initAnalytics(router: Router): void {
  if (!measurementId || initialized) {
    return
  }

  initialized = true

  loadAnalyticsScript(measurementId)
  setupGtag(measurementId)

  router.afterEach((to) => {
    trackPageView(to.fullPath)
  })

  router.isReady().then(() => {
    trackPageView(router.currentRoute.value.fullPath)
  })
}
