type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  debug: (message: string, data?: unknown) => {
    if (isDev) console.log(`[DEBUG] ${message}`, data ?? '');
  },
  
  info: (message: string, data?: unknown) => {
    if (isDev) console.info(`[INFO] ${message}`, data ?? '');
  },
  
  warn: (message: string, data?: unknown) => {
    console.warn(`[WARN] ${message}`, data ?? '');
  },
  
  error: (message: string, error?: Error | unknown) => {
    console.error(`[ERROR] ${message}`, error ?? '');
    // TODO: Send to error tracking service (Sentry, etc.)
  },
};

export default logger;
