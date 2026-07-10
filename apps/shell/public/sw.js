/* Atom shell service worker — Web Push for Agent Brain closed-app delivery. */
self.addEventListener("push", (event) => {
  let payload = { title: "Atom", body: "New update from your agent", data: { url: "/app/" } };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = {
        title: parsed.title || payload.title,
        body: parsed.body || payload.body,
        data: { url: "/app/", ...(parsed.data || {}) },
      };
    }
  } catch {
    try {
      const text = event.data?.text();
      if (text) payload.body = text;
    } catch {
      /* keep defaults */
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: payload.data,
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
      tag: payload.data?.notificationId || "atom-brain",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/app/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate?.(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    }),
  );
});
