/**
 * Bulk Invite Service
 *
 * Orchestrates the secure "invite members" flow.
 * The server now performs account activation, reset-link generation,
 * email delivery, and audit logging so sensitive data never reaches the browser.
 */
import { auth } from '@/lib/firebase';
import { getDocs, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';

export interface BulkInviteResult {
  uid?: string;
  email: string;
  displayName: string;
  status: 'activated' | 'already_active' | 'skipped' | 'failed' | 'would_activate';
  resetLink?: string | null;
  reason?: string;
  warning?: string;
  emailSent?: boolean;
  emailError?: string;
  appInstalled?: boolean;
}

export interface BulkInviteSummary {
  activated: number;
  alreadyActive: number;
  skipped: number;
  failed: number;
  emailsSent: number;
  emailsFailed: number;
  total: number;
}

export interface BulkInviteProgress {
  phase: 'activating' | 'sending_emails' | 'done';
  current: number;
  total: number;
  currentEmail?: string;
}

type ProgressCallback = (progress: BulkInviteProgress) => void;

type BulkInviteApiError = Error & { status?: number };

export function shouldUseLocalPreviewFallback(error: unknown): boolean {
  const candidate = error as BulkInviteApiError | undefined;
  if (!candidate) return false;
  if (candidate.status === 404) return true;

  const message = candidate.message || '';
  return message.includes('Failed to fetch') || message.includes('API error: 404');
}

export function canSelectForBulkInvite(result: BulkInviteResult, includeAlreadyActive = false): boolean {
  if (!result.uid) return false;
  if (result.status === 'would_activate') return true;
  return includeAlreadyActive && result.status === 'already_active';
}

export function canManuallySelectForBulkInvite(result: BulkInviteResult): boolean {
  if (!result.uid) return false;
  return result.status === 'would_activate' || result.status === 'already_active';
}

/**
 * Max members per API call — must complete fast enough to avoid idle connection
 * timeouts from Vercel's edge proxy (~30-60 s). With BATCH_DELAY_MS = 2 000 ms
 * on the server, 5 members ≈ 10-15 s processing time — well within limits.
 */
const API_CHUNK_SIZE = 5;

/**
 * Call the bulk-invite API for a single chunk of userIds.
 */
async function activateAccountsChunk(
  clubId: string,
  token: string,
  userIds: string[] | undefined,
  dryRun: boolean,
  sendEmails: boolean,
  sendToAlreadyActive: boolean,
): Promise<{ summary: any; results: any }> {
  const response = await fetch('/api/bulk-invite-users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      clubId,
      userIds,
      dryRun,
      sendEmails,
      sendToAlreadyActive,
    }),
  });

  if (!response.ok) {
    let errorMsg = `API error: ${response.status}`;
    try {
      const error = await response.json();
      errorMsg = error.error || errorMsg;
    } catch {
      // Response is not JSON (e.g. 404 HTML page in local dev)
    }
    const error = new Error(errorMsg) as BulkInviteApiError;
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * Step 1: Call the bulk-invite API to preview or execute the invite flow.
 * When userIds contains more members than API_CHUNK_SIZE, it automatically
 * splits the work into multiple sequential API calls so that no single
 * Vercel function invocation exceeds its maxDuration (300 s).
 */
async function activateAccounts(
  clubId: string,
  userIds?: string[],
  dryRun = false,
  sendEmails = !dryRun,
  sendToAlreadyActive = false,
  onChunkProgress?: (processed: number, total: number) => void,
): Promise<{ summary: any; results: any }> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');

  // If no explicit userIds or small enough list, single call
  if (!userIds || userIds.length <= API_CHUNK_SIZE) {
    return activateAccountsChunk(clubId, token, userIds, dryRun, sendEmails, sendToAlreadyActive);
  }

  // Split into chunks and call sequentially
  const chunks: string[][] = [];
  for (let i = 0; i < userIds.length; i += API_CHUNK_SIZE) {
    chunks.push(userIds.slice(i, i + API_CHUNK_SIZE));
  }

  const aggregated = {
    summary: {
      activated: 0,
      alreadyActive: 0,
      skipped: 0,
      failed: 0,
      emailsSent: 0,
      emailsFailed: 0,
      total: 0,
    },
    results: {
      activated: [] as any[],
      alreadyActive: [] as any[],
      skipped: [] as any[],
      failed: [] as any[],
      dryRun,
    },
  };

  let processed = 0;

  for (const chunk of chunks) {
    const chunkResponse = await activateAccountsChunk(
      clubId, token, chunk, dryRun, sendEmails, sendToAlreadyActive,
    );

    // Merge summary counts
    const s = chunkResponse.summary;
    aggregated.summary.activated += s.activated || 0;
    aggregated.summary.alreadyActive += s.alreadyActive || 0;
    aggregated.summary.skipped += s.skipped || 0;
    aggregated.summary.failed += s.failed || 0;
    aggregated.summary.emailsSent += s.emailsSent || 0;
    aggregated.summary.emailsFailed += s.emailsFailed || 0;
    aggregated.summary.total += s.total || 0;

    // Merge result arrays
    const r = chunkResponse.results;
    aggregated.results.activated.push(...(r.activated || []));
    aggregated.results.alreadyActive.push(...(r.alreadyActive || []));
    aggregated.results.skipped.push(...(r.skipped || []));
    aggregated.results.failed.push(...(r.failed || []));

    processed += chunk.length;
    if (onChunkProgress) {
      onChunkProgress(processed, userIds.length);
    }
  }

  return aggregated;
}

/**
 * Main entry point: execute the bulk invite flow server-side
 */
export async function bulkInviteMembers(
  clubId: string,
  _clubName: string,
  _logoUrl: string,
  options?: {
    userIds?: string[];
    dryRun?: boolean;
    sendToAlreadyActive?: boolean;
    onProgress?: ProgressCallback;
  },
): Promise<{
  summary: BulkInviteSummary;
  results: BulkInviteResult[];
}> {
  const { userIds, dryRun = false, sendToAlreadyActive = false, onProgress } = options || {};

  // Phase 1: Activate accounts
  if (onProgress) {
    onProgress({ phase: 'activating', current: 0, total: 0 });
  }

  const apiResponse = await activateAccounts(
    clubId,
    userIds,
    dryRun,
    !dryRun,
    sendToAlreadyActive,
    onProgress
      ? (processed, total) => {
          onProgress({
            phase: 'sending_emails',
            current: processed,
            total,
          });
        }
      : undefined,
  );

  const allResults: BulkInviteResult[] = [
    ...apiResponse.results.activated,
    ...apiResponse.results.alreadyActive,
    ...apiResponse.results.skipped,
    ...apiResponse.results.failed,
  ];

  if (dryRun) {
    return {
      summary: {
        ...apiResponse.summary,
        emailsSent: 0,
        emailsFailed: 0,
      },
      results: allResults,
    };
  }

  if (onProgress) {
    onProgress({
      phase: 'sending_emails',
      current: apiResponse.summary.emailsSent + apiResponse.summary.emailsFailed,
      total: apiResponse.summary.emailsSent + apiResponse.summary.emailsFailed,
    });
    onProgress({ phase: 'done', current: 0, total: 0 });
  }

  return {
    summary: apiResponse.summary,
    results: allResults,
  };
}

/**
 * Client-side preview: reads Firestore directly to categorize members.
 * Works without the API endpoint (useful for local dev with `npm run dev`).
 * Falls back to the API dry-run if available.
 */
async function previewBulkInviteLocal(
  clubId: string,
): Promise<{
  summary: { activated: number; alreadyActive: number; skipped: number; total: number };
  results: BulkInviteResult[];
}> {
  const membersRef = collection(db, 'clubs', clubId, 'members');
  const snapshot = await getDocs(membersRef);

  const results: BulkInviteResult[] = [];
  let activated = 0;
  let alreadyActive = 0;
  let skipped = 0;

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const uid = docSnap.id;
    const email = data.email || '';
    const displayName = [data.prenom, data.nom].filter(Boolean).join(' ') || data.displayName || email;
    // Resolve member_status from multiple legacy fields for backwards compatibility
    // Some members may only have legacy fields (actif, isActive, status, app_status)
    // without the newer member_status field set
    const memberStatus = data.member_status
      || (data.actif === true || data.isActive === true ? 'active' : undefined)
      || (data.status === 'active' || data.app_status === 'active' ? 'active' : undefined)
      || 'unknown';

    const appInstalled = data.app_installed === true;

    // ONLY activate members with active status (checked across legacy fields above)
    // Inactive, archived, deleted, or unknown members must be skipped
    if (memberStatus !== 'active') {
      skipped++;
      results.push({ uid, email, displayName, status: 'skipped', reason: `Statut membre: ${memberStatus}`, appInstalled });
      return;
    }

    // Skip members without valid email
    if (!email || email.includes('@placeholder') || !email.includes('@')) {
      skipped++;
      results.push({ uid, email: email || '(aucun)', displayName, status: 'skipped', reason: 'Email invalide ou manquant', appInstalled });
      return;
    }

    // Check if already activated (has_app_access true and no pending activation)
    if (data.has_app_access && !data.metadata?.pendingActivation) {
      alreadyActive++;
      results.push({ uid, email, displayName, status: 'already_active', appInstalled });
      return;
    }

    // Would be activated
    activated++;
    results.push({ uid, email, displayName, status: 'would_activate', appInstalled });
  });

  return {
    summary: { activated, alreadyActive, skipped, total: snapshot.size },
    results,
  };
}

/**
 * Dry-run: preview what would happen without making changes.
 * Tries the API first, falls back to client-side Firestore read.
 */
export async function previewBulkInvite(
  clubId: string,
  userIds?: string[],
): Promise<{
  summary: { activated: number; alreadyActive: number; skipped: number; total: number };
  results: BulkInviteResult[];
}> {
  try {
    const apiResponse = await activateAccounts(clubId, userIds, true);
    return {
      summary: apiResponse.summary,
      results: [
        ...apiResponse.results.activated,
        ...apiResponse.results.alreadyActive,
        ...apiResponse.results.skipped,
        ...apiResponse.results.failed,
      ],
    };
  } catch (apiError: any) {
    if (!shouldUseLocalPreviewFallback(apiError)) {
      throw apiError;
    }

    // API not available (local dev) — use client-side Firestore read
    logger.warn('API not available for preview, using client-side Firestore read:', apiError.message);
    return previewBulkInviteLocal(clubId);
  }
}
