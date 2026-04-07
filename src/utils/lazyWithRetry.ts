import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { logger } from '@/utils/logger';

const LAZY_RELOAD_KEY = 'calycompta:lazy-import-reload-path';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isStaleChunkError(error: unknown): boolean {
  const message = getErrorMessage(error);

  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Loading chunk') ||
    message.includes('ChunkLoadError')
  );
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const module = await importer();

      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(LAZY_RELOAD_KEY);
      }

      return module;
    } catch (error) {
      if (typeof window !== 'undefined' && isStaleChunkError(error)) {
        const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const lastReloadedPath = window.sessionStorage.getItem(LAZY_RELOAD_KEY);

        if (lastReloadedPath !== currentPath) {
          logger.warn('Lazy import failed after a deployment, forcing a one-time reload', {
            currentPath,
            error: getErrorMessage(error),
          });

          window.sessionStorage.setItem(LAZY_RELOAD_KEY, currentPath);
          window.location.reload();

          return new Promise<never>(() => {});
        }

        window.sessionStorage.removeItem(LAZY_RELOAD_KEY);
      }

      throw error;
    }
  });
}
