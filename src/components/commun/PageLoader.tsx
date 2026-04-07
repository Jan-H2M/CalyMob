/**
 * PageLoader - Loading fallback for lazy-loaded route components
 * Used with React.lazy() and Suspense for code splitting
 */
export function PageLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-calypso-blue dark:border-calypso-aqua border-t-transparent"></div>
        <p className="mt-3 text-sm text-gray-500 dark:text-dark-text-secondary">
          Chargement...
        </p>
      </div>
    </div>
  );
}

export default PageLoader;
