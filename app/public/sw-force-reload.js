/* Loaded into the service worker. When a new version replaces an older one, reload every open
   copy of the app so nobody is left running the old version (iPhone Safari and home-screen apps
   don't always reload on their own). A first-time install doesn't reload anything.

   The reloads are started but NOT awaited: the reloaded page's request can't be answered until
   activation finishes, so waiting for it here would deadlock. */
let replacingOldVersion = false;

self.addEventListener("install", () => {
  replacingOldVersion = !!self.registration.active;
});

self.addEventListener("activate", (event) => {
  if (!replacingOldVersion) return;
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const windows = await self.clients.matchAll({ type: "window" });
      for (const w of windows) w.navigate(w.url).catch(() => { /* page closed or not ours */ });
    })()
  );
});
