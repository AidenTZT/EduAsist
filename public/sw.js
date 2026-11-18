// Service Worker oficial de EduAsist para Notificaciones Web Push en Tiempo Real

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/pwa-192x192.png',
      badge: payload.badge || '/pwa-192x192.png',
      tag: payload.tag || 'eduasist-asistencia',
      renotify: Boolean(payload.renotify),
      requireInteraction: Boolean(payload.requireInteraction),
      data: payload.data,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl =
    (event.notification.data && event.notification.data.url) || '/#portal-representante';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

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

        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes,
        });
        const subJson = newSub.toJSON();
        if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
          await fetch('/api/push/subscribe', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: subJson.endpoint,
              keys: {
                p256dh: subJson.keys.p256dh,
                auth: subJson.keys.auth,
              },
            }),
          });
        }
      } catch {
        // Ignorar si la sesión expiró; el cliente re-sincronizará al abrir el portal
      }
    })()
  );
});
