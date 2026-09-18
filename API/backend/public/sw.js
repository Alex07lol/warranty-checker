// Service Worker for WarrantyVault
// Handles background notifications and notification interaction on mobile & desktop.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICK', ...data });
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(data.url || '/');
      }
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: 'WarrantyVault Alert', body: 'You have an update.' };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: 'WarrantyVault Alert', body: event.data.text() };
    }
  }

  const options = {
    body: payload.body || payload.message || 'Check your alerts in WarrantyVault.',
    icon: payload.icon || '/favicon.svg',
    badge: payload.badge || '/favicon.svg',
    tag: payload.tag || 'wv-alert',
    data: payload.data || {},
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'WarrantyVault', options)
  );
});
