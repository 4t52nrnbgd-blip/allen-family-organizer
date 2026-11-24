/* The Allen's — service worker for priority-task push notifications.
   No dependencies. Shows the notification from the push payload;
   tapping it focuses the open app tab or opens the app. */
'use strict';

self.addEventListener('push', function (event) {
  let title = 'Priority task due';
  let body = '';
  let tag = 'priority-task';
  if (event.data) {
    try {
      const data = event.data.json();
      if (data.title) title = data.title;
      if (data.body) body = data.body;
      if (data.tag) tag = data.tag;
    } catch (e) {
      // Not JSON: fall back to the generic title above.
    }
  }
  event.waitUntil(
    self.registration.showNotification(title, { body: body, tag: tag })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (let i = 0; i < clients.length; i++) {
        if ('focus' in clients[i]) return clients[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    })
  );
});
