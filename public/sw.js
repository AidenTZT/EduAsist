// Service Worker oficial de EduAsist: Instalabilidad PWA (App Shell + Fetch) y Notificaciones Web Push en Tiempo Real

const CACHE_NAME = 'eduasist-pwa-v2';
const APP_SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/manifest.webmanifest?v=eduasist',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(APP_SHELL_ASSETS.map((asset) => cache.add(asset)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Estrategia Network-First segura para instalabilidad PWA en Android/Chrome sin interferir con /api/* ni HMR
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const fallbackRoot = await caches.match('/');
          if (fallbackRoot) return fallbackRoot;
        }
        return new Response('Sin conexión', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'EduAsist • Asistencia Escolar',
    body: 'Se ha registrado una nueva actualización de asistencia.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'eduasist-asistencia',
    renotify: true,
    requireInteraction: false,
    data: {
      url: '/#portal-representante',
    },
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = {
        ...payload,
        ...parsed,
        data: {
          ...payload.data,
          ...(parsed.data || {}),
        },
      };
    } catch {
      const text = event.data.text();
      if (text) {
        payload.body = text;
      }
    }
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon || '/pwa-192x192.png',
        badge: payload.badge || '/pwa-192x192.png',
        tag: payload.tag || 'eduasist-asistencia',
        renotify: Boolean(payload.renotify),
        requireInteraction: Boolean(payload.requireInteraction),
        data: payload.data,
      }),
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((windowClients) => {
          for (const client of windowClients) {
            client.postMessage({
              type: 'EDUASIST_PUSH_RECEIVED',
              data: payload.data || {},
            });
          }
        })
        .catch(() => {}),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl =
    (event.notification.data && event.notification.data.url) || '/#portal-representante';
  const fallbackUrl = new URL('/#portal-representante', self.location.origin).href;
  let targetUrl = fallbackUrl;
  try {
    const parsedTarget = new URL(String(rawUrl), self.location.origin);
    if (
      parsedTarget.origin === self.location.origin &&
      (parsedTarget.protocol === 'http:' || parsedTarget.protocol === 'https:')
    ) {
      targetUrl = parsedTarget.href;
    }
  } catch {
    targetUrl = fallbackUrl;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            return client.focus().then((focused) => {
              if (focused && 'navigate' in focused && typeof focused.navigate === 'function') {
                return focused.navigate(targetUrl).catch(() => focused);
              }
              return focused;
            });
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSub = event.oldSubscription;
        const oldJson = oldSub && typeof oldSub.toJSON === 'function' ? oldSub.toJSON() : null;

        let newSub = event.newSubscription;
        if (!newSub) {
          let applicationServerKey =
            oldSub && oldSub.options && oldSub.options.applicationServerKey
              ? oldSub.options.applicationServerKey
              : null;

          if (!applicationServerKey) {
            const res = await fetch('/api/push/vapid-public-key');
            if (!res.ok) return;
            const { publicKey } = await res.json();
            if (!publicKey) return;

            const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
            const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = self.atob(base64);
            const keyBytes = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
              keyBytes[i] = rawData.charCodeAt(i);
            }
            applicationServerKey = keyBytes;
          }

          newSub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        }

        const subJson = newSub.toJSON();
        if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
          return;
        }

        const newSubscriptionPayload = {
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
          },
        };

        // Intentar rotación criptográfica segura usando las llaves previas (funciona aun si la cookie JWT expiró)
        if (oldJson?.endpoint && oldJson.keys?.p256dh && oldJson.keys?.auth) {
          const rotateRes = await fetch('/api/push/rotate', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              oldEndpoint: oldJson.endpoint,
              oldKeys: {
                p256dh: oldJson.keys.p256dh,
                auth: oldJson.keys.auth,
              },
              newSubscription: newSubscriptionPayload,
            }),
          });
          if (rotateRes.ok) {
            return;
          }
        }

        // Respaldo con sesión activa
        await fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSubscriptionPayload),
        });
      } catch {
        // Ignorar si no hay red o sesión; el cliente re-sincronizará al abrir o enfocar el portal
      }
    })()
  );
});
