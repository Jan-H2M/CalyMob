// Placeholder for Firebase Messaging Service Worker
// This prevents Firebase from trying to auto-register a service worker

self.addEventListener('install', (event) => {
  console.log('Firebase Messaging SW: Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Firebase Messaging SW: Activated');
  event.waitUntil(clients.claim());
});

// Handle background messages (if needed in the future)
self.addEventListener('push', (event) => {
  console.log('Push event received:', event);
});