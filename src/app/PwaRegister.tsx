'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker (PWA instalable). El SW vive en /public/sw.js
 * y se sirve con Cache-Control no-cache desde next.config.ts.
 */
export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Sin SW la app sigue funcionando; solo pierde instalabilidad/offline.
      })
    }
  }, [])

  return null
}
