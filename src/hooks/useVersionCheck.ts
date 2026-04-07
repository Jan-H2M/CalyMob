import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';

// Current app version - update this with each deployment
const LOCAL_APP_VERSION = '1.0.0';

/**
 * Compare two semver strings (e.g., "1.2.3" vs "1.2.4")
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

/**
 * Simple version check hook - does ONE Firestore read on mount
 * Use this in Layout.tsx where user is already authenticated
 */
export function useVersionCheck() {
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const versionDoc = await getDoc(doc(db, 'settings', 'app_version'));
        if (!versionDoc.exists()) return;

        const data = versionDoc.data();
        const isNewer = compareVersions(data.version, LOCAL_APP_VERSION) > 0;

        if (data.forceRefresh && isNewer) {
          logger.debug(`🔄 Force refresh needed: ${data.version} > ${LOCAL_APP_VERSION}`);
          setNeedsRefresh(true);
          setMessage(data.message || 'Update beschikbaar');
        } else {
          logger.debug(`✅ App version OK: ${LOCAL_APP_VERSION}`);
        }
      } catch (error) {
        // Silently fail - version check is not critical
        logger.error('Version check failed:', error);
      }
    };

    checkVersion();
  }, []);

  return {
    needsRefresh,
    message,
    currentVersion: LOCAL_APP_VERSION,
    refreshApp: () => window.location.reload()
  };
}

/**
 * Get the current local app version
 */
export function getAppVersion(): string {
  return LOCAL_APP_VERSION;
}
