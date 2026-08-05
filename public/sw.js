const CACHE = 'club-saas-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

// Red primero, cache de respaldo: las páginas son dinámicas (RLS por club) y
// no se pueden precachear a ciegas. El cache solo cubre assets estáticos
// mismos-origen y deja un fallback offline básico.
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request)
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          const cache = await caches.open(CACHE)
          cache.put(request, response.clone())
        }
        return response
      } catch {
        const cached = await caches.match(request)
        if (cached) return cached
        return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      }
    })(),
  )
})

// Push del portal (M6): el payload viene JSON del servidor
// ({ type, title, body, data, clubId }). Un click en la notificación abre el
// portal (o la página de pagos si es de cobranza).
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // noop
  }
  const { title = 'Club', body = '', data = null } = payload
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon.svg',
      badge: '/icons/maskable.svg',
      data,
      tag: data?.type ?? undefined,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { data = null } = event.notification
  const clubId = data?.clubId
  const route = data?.type === 'pago.acreditado' || data?.type === 'cobranza.plan_de_pago'
    ? '/portal/pagos'
    : '/portal'
  const url = `${self.location.origin}/${clubId ?? ''}${route}`
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => new URL(c.url).pathname === new URL(url).pathname)
      if (existing) {
        existing.focus()
        return
      }
      return self.clients.openWindow(url)
    }),
  )
})
