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
