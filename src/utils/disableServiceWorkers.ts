/**
 * Disable service workers in development or when in a webview environment
 * This prevents registration errors in Claude Code or other webview contexts
 */

export function disableServiceWorkers() {
  // Check if we're in development or if service workers should be disabled
  if (import.meta.env.DEV || import.meta.env.VITE_DISABLE_SERVICE_WORKERS === 'true') {
    // Override navigator.serviceWorker if it exists
    if ('serviceWorker' in navigator) {
      // Create a mock service worker container
      const mockServiceWorker = {
        register: () => {
          console.log('Service Worker registration blocked in development/webview');
          return Promise.resolve({
            installing: null,
            waiting: null,
            active: null,
            scope: '/',
            updatefound: () => {},
            unregister: () => Promise.resolve(true)
          });
        },
        getRegistration: () => Promise.resolve(undefined),
        getRegistrations: () => Promise.resolve([]),
        ready: Promise.resolve({
          installing: null,
          waiting: null,
          active: null,
          scope: '/',
          updatefound: () => {},
          unregister: () => Promise.resolve(true)
        })
      };

      // Replace the service worker object
      Object.defineProperty(navigator, 'serviceWorker', {
        value: mockServiceWorker,
        writable: false,
        configurable: false
      });
    }
  }
}

// Call this function immediately when the module is imported
disableServiceWorkers();