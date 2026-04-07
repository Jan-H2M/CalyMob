import { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/utils/fieldMapper';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeatureFlags {
  carnetFormationEnabled: boolean;
  carnetFormationAdminOnly: boolean;
}

interface UseFeatureFlagsResult {
  flags: FeatureFlags;
  loading: boolean;
  error: string | null;
}

const DEFAULT_FLAGS: FeatureFlags = {
  carnetFormationEnabled: false,
  carnetFormationAdminOnly: true,
};

// ─── Hook: Raw feature flags ─────────────────────────────────────────────────
export function useFeatureFlags(clubId: string): UseFeatureFlagsResult {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clubId) {
      setLoading(false);
      return;
    }

    const ref = doc(db, 'clubs', clubId, 'settings', 'feature_flags');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setFlags({
            carnetFormationEnabled: data.carnetFormationEnabled ?? false,
            carnetFormationAdminOnly: data.carnetFormationAdminOnly ?? true,
          });
        } else {
          setFlags(DEFAULT_FLAGS);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[useFeatureFlags] Firestore error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [clubId]);

  return { flags, loading, error };
}
// ─── Hook: Is Carnet de Formation visible? ───────────────────────────────────
// Combines feature flag + admin-only check.

export function useCarnetFormationEnabled(clubId: string): boolean {
  const { flags, loading } = useFeatureFlags(clubId);
  const { appUser } = useAuth();

  return useMemo(() => {
    if (loading || !flags.carnetFormationEnabled) return false;
    if (flags.carnetFormationAdminOnly && !isAdmin(appUser)) return false;
    return true;
  }, [flags, loading, appUser]);
}

// ─── Hook: Guard for sidebar & route protection ─────────────────────────────

export function useCarnetFormationGuard(clubId: string): {
  visible: boolean;
  loading: boolean;
} {
  const { flags, loading, error } = useFeatureFlags(clubId);
  const { appUser } = useAuth();

  const visible = useMemo(() => {
    if (!flags.carnetFormationEnabled) return false;
    if (flags.carnetFormationAdminOnly && !isAdmin(appUser)) return false;
    return true;
  }, [flags, appUser]);

  return { visible, loading };
}