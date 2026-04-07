import { collection, addDoc, serverTimestamp, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, DEFAULT_CLUB_ID } from '@/lib/firebase';
import { logger } from '@/utils/logger';

export interface ScreenshotEntry {
  blob: Blob;
  page: string;
  capturedAt: Date;
}

export interface BugReportData {
  title: string;
  description?: string;
  priority: 'blocking' | 'annoying' | 'minor';
  /** @deprecated Use screenshots[] instead */
  screenshotBlob?: Blob | null;
  /** Multi-screenshot support */
  screenshots?: ScreenshotEntry[];
  currentRoute: string;
}

/** Screenshot metadata stored in Firestore */
export interface ScreenshotMeta {
  url: string;
  page: string;
  capturedAt: Date | Timestamp;
  storagePath: string;
}

interface DeviceInfo {
  model: string;
  os: string;
  osVersion: string;
  appVersion: string;
  platform: string;
}

/**
 * Service pour envoyer des signalements de bugs vers Firestore + Firebase Storage.
 * Supports multi-screenshot dossier per bug report.
 */
class BugReportService {
  /**
   * Envoie un signalement de bug avec 0-N screenshots.
   */
  async submitBugReport(
    userId: string,
    userName: string,
    userEmail: string,
    data: BugReportData
  ): Promise<string> {
    try {
      const clubId = DEFAULT_CLUB_ID;
      const deviceInfo = this.collectDeviceInfo();

      // Récupérer le Sentry replay ID (si disponible)
      let sentryReplayId: string | null = null;
      try {
        // @ts-ignore
        const Sentry = await import('@sentry/browser').catch(() => null);
        if (Sentry) {
          const replay = Sentry.getReplay?.();
          if (replay) {
            sentryReplayId = replay.getReplayId?.() || null;
          }
        }
      } catch (e) {
        logger.debug('BugReport: Sentry replay ID non disponible:', e);
      }

      // Préparer le document Firestore
      const reportData = {
        app: 'CalyCompta',
        title: data.title,
        description: data.description || '',
        priority: data.priority,
        status: 'open',
        reporter: {
          uid: userId,
          name: userName,
          email: userEmail,
        },
        device: {
          model: deviceInfo.model,
          os: deviceInfo.os,
          osVersion: deviceInfo.osVersion,
          appVersion: deviceInfo.appVersion,
          platform: deviceInfo.platform,
        },
        currentRoute: data.currentRoute,
        sentryReplayId,
        sentryEventUrl: sentryReplayId
          ? `https://h2m-ai.sentry.io/replays/?query=${sentryReplayId}`
          : null,
        linearIssueId: null,
        screenshotUrl: null,       // backward compat (first screenshot URL)
        screenshots: [] as any[],  // new: array of screenshot metadata
        createdAt: serverTimestamp(),
      };

      // Écrire dans Firestore
      const colRef = collection(db, `clubs/${clubId}/bug_reports`);
      const docRef = await addDoc(colRef, reportData);
      logger.info(`🐛 Bug report créé: ${docRef.id}`);

      // Upload screenshots
      const screenshotEntries = data.screenshots || [];
      // Backward compat: if old-style single blob is provided, convert it
      if (screenshotEntries.length === 0 && data.screenshotBlob) {
        screenshotEntries.push({
          blob: data.screenshotBlob,
          page: data.currentRoute,
          capturedAt: new Date(),
        });
      }

      if (screenshotEntries.length > 0) {
        const uploadedScreenshots: ScreenshotMeta[] = [];

        for (let i = 0; i < screenshotEntries.length; i++) {
          const entry = screenshotEntries[i];
          try {
            const storagePath = `clubs/${clubId}/bug_reports/${docRef.id}/screenshot_${i}.jpg`;
            console.log(`📸 [BugReport] Uploading screenshot ${i}: ${entry.blob.size} bytes → ${storagePath}`);

            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, entry.blob, { contentType: 'image/jpeg' });

            const downloadUrl = await getDownloadURL(storageRef);
            console.log(`📸 [BugReport] Screenshot ${i} uploaded OK`);

            uploadedScreenshots.push({
              url: downloadUrl,
              page: entry.page,
              capturedAt: entry.capturedAt,
              storagePath,
            });
          } catch (e: any) {
            console.error(`📸 [BugReport] Screenshot ${i} UPLOAD FAILED:`, e?.code, e?.message);
            // Continue with remaining screenshots
          }
        }

        if (uploadedScreenshots.length > 0) {
          // Update Firestore with screenshot data
          const updateData: Record<string, any> = {
            screenshots: uploadedScreenshots.map((s) => ({
              url: s.url,
              page: s.page,
              capturedAt: s.capturedAt,
              storagePath: s.storagePath,
            })),
            // Backward compat: first screenshot URL in screenshotUrl
            screenshotUrl: uploadedScreenshots[0].url,
          };
          await updateDoc(doc(db, `clubs/${clubId}/bug_reports/${docRef.id}`), updateData);
          console.log(`📸 [BugReport] Firestore updated with ${uploadedScreenshots.length} screenshots`);
        }
      }

      return docRef.id;
    } catch (e) {
      logger.error('Erreur création bug report:', e);
      throw e;
    }
  }

  /**
   * Collecte les informations du navigateur/appareil.
   */
  private collectDeviceInfo(): DeviceInfo {
    const ua = navigator.userAgent;
    let browser = 'Inconnu';
    let os = 'Inconnu';
    let osVersion = '';

    if (ua.includes('Chrome') && !ua.includes('Edg')) {
      const match = ua.match(/Chrome\/([\d.]+)/);
      browser = `Chrome ${match?.[1] || ''}`;
    } else if (ua.includes('Firefox')) {
      const match = ua.match(/Firefox\/([\d.]+)/);
      browser = `Firefox ${match?.[1] || ''}`;
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      const match = ua.match(/Version\/([\d.]+)/);
      browser = `Safari ${match?.[1] || ''}`;
    } else if (ua.includes('Edg')) {
      const match = ua.match(/Edg\/([\d.]+)/);
      browser = `Edge ${match?.[1] || ''}`;
    }

    if (ua.includes('Windows')) {
      os = 'Windows';
      const match = ua.match(/Windows NT ([\d.]+)/);
      osVersion = match?.[1] || '';
    } else if (ua.includes('Mac OS')) {
      os = 'macOS';
      const match = ua.match(/Mac OS X ([\d_.]+)/);
      osVersion = match?.[1]?.replace(/_/g, '.') || '';
    } else if (ua.includes('Linux')) {
      os = 'Linux';
    } else if (ua.includes('Android')) {
      os = 'Android';
      const match = ua.match(/Android ([\d.]+)/);
      osVersion = match?.[1] || '';
    } else if (ua.includes('iPhone') || ua.includes('iPad')) {
      os = 'iOS';
      const match = ua.match(/OS ([\d_]+)/);
      osVersion = match?.[1]?.replace(/_/g, '.') || '';
    }

    const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';

    return {
      model: browser,
      os,
      osVersion: `${os} ${osVersion}`.trim(),
      appVersion,
      platform: 'web',
    };
  }
}

export const bugReportService = new BugReportService();
