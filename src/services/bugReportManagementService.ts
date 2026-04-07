import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, getDownloadURL, deleteObject, uploadBytes } from 'firebase/storage';
import { db, storage, DEFAULT_CLUB_ID } from '@/lib/firebase';
import { logger } from '@/utils/logger';
import type { ScreenshotMeta } from '@/services/bugReportService';

// ============================================
// Types
// ============================================

export type BugStatus = 'nouveau' | 'en_cours' | 'resolu' | 'ferme';
export type BugPriority = 'blocking' | 'annoying' | 'minor';

export interface BugReportComment {
  id?: string;
  authorName: string;
  authorUid: string;
  text: string;
  createdAt: Timestamp | Date;
}

export interface BugReport {
  id: string;
  app: string;
  title: string;
  description: string;
  priority: BugPriority;
  status: BugStatus;
  reporter: {
    uid: string;
    name: string;
    email: string;
  };
  device: {
    model: string;
    os: string;
    osVersion: string;
    appVersion: string;
    platform: string;
  };
  currentRoute: string;
  /** @deprecated Use screenshots[] - kept for backward compat */
  screenshotUrl: string | null;
  /** Multi-screenshot dossier */
  screenshots: ScreenshotMeta[];
  sentryReplayId: string | null;
  sentryEventUrl: string | null;
  linearIssueId: string | null;
  linearIssueUrl?: string | null;
  createdAt: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  resolvedAt?: Timestamp | Date;
  comments?: BugReportComment[];
}

export const BUG_STATUS_CONFIG: Record<BugStatus, { label: string; color: string; bgColor: string; emoji: string; order: number }> = {
  nouveau: { label: 'Nouveau', color: 'text-blue-700 dark:text-blue-300', bgColor: 'bg-blue-100 dark:bg-blue-900/30', emoji: '🆕', order: 0 },
  en_cours: { label: 'En cours', color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-100 dark:bg-amber-900/30', emoji: '🔧', order: 1 },
  resolu: { label: 'Résolu', color: 'text-green-700 dark:text-green-300', bgColor: 'bg-green-100 dark:bg-green-900/30', emoji: '✅', order: 2 },
  ferme: { label: 'Fermé', color: 'text-gray-700 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-800/30', emoji: '🔒', order: 3 },
};

export const BUG_PRIORITY_CONFIG: Record<BugPriority, { label: string; color: string; bgColor: string; emoji: string }> = {
  blocking: { label: 'Bloquant', color: 'text-red-700 dark:text-red-300', bgColor: 'bg-red-100 dark:bg-red-900/30', emoji: '🔴' },
  annoying: { label: 'Gênant', color: 'text-yellow-700 dark:text-yellow-300', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30', emoji: '🟡' },
  minor: { label: 'Mineur', color: 'text-blue-700 dark:text-blue-300', bgColor: 'bg-blue-100 dark:bg-blue-900/30', emoji: '🔵' },
};

// ============================================
// Service
// ============================================

class BugReportManagementService {
  private collectionPath(clubId: string = DEFAULT_CLUB_ID) {
    return `clubs/${clubId}/bug_reports`;
  }

  /**
   * Charge tous les bug reports (one-shot)
   */
  async fetchAll(clubId: string = DEFAULT_CLUB_ID): Promise<BugReport[]> {
    try {
      const q = query(
        collection(db, this.collectionPath(clubId)),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const reports: BugReport[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        reports.push(this.mapDoc(docSnap.id, data));
      });
      logger.info(`🐛 ${reports.length} bug reports chargés`);
      return reports;
    } catch (e) {
      logger.error('Erreur chargement bug reports:', e);
      throw e;
    }
  }

  /**
   * Écoute en temps réel les bug reports
   */
  subscribe(
    clubId: string = DEFAULT_CLUB_ID,
    callback: (reports: BugReport[]) => void
  ): () => void {
    const q = query(
      collection(db, this.collectionPath(clubId)),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
      const reports: BugReport[] = [];
      snap.forEach((docSnap) => {
        reports.push(this.mapDoc(docSnap.id, docSnap.data()));
      });
      callback(reports);
    });
  }

  /**
   * Met à jour le statut d'un bug report
   */
  async updateStatus(
    reportId: string,
    newStatus: BugStatus,
    clubId: string = DEFAULT_CLUB_ID
  ): Promise<void> {
    const docRef = doc(db, this.collectionPath(clubId), reportId);
    const updates: Record<string, any> = {
      status: newStatus,
      updatedAt: serverTimestamp(),
    };
    if (newStatus === 'resolu') {
      updates.resolvedAt = serverTimestamp();
    }
    await updateDoc(docRef, updates);
    logger.info(`🐛 Bug ${reportId} → ${newStatus}`);
  }

  /**
   * Met à jour la priorité
   */
  async updatePriority(
    reportId: string,
    priority: BugPriority,
    clubId: string = DEFAULT_CLUB_ID
  ): Promise<void> {
    const docRef = doc(db, this.collectionPath(clubId), reportId);
    await updateDoc(docRef, { priority, updatedAt: serverTimestamp() });
    logger.info(`🐛 Bug ${reportId} priorité → ${priority}`);
  }

  /**
   * Met à jour le titre d'un bug report
   */
  async updateTitle(
    reportId: string,
    title: string,
    clubId: string = DEFAULT_CLUB_ID
  ): Promise<void> {
    const docRef = doc(db, this.collectionPath(clubId), reportId);
    await updateDoc(docRef, { title, updatedAt: serverTimestamp() });
    logger.info(`🐛 Bug ${reportId} titre mis à jour`);
  }

  /**
   * Met à jour la description d'un bug report
   */
  async updateDescription(
    reportId: string,
    description: string,
    clubId: string = DEFAULT_CLUB_ID
  ): Promise<void> {
    const docRef = doc(db, this.collectionPath(clubId), reportId);
    await updateDoc(docRef, { description, updatedAt: serverTimestamp() });
    logger.info(`🐛 Bug ${reportId} description mise à jour`);
  }

  /**
   * Ajoute un fichier/photo en pièce jointe à un bug report existant
   */
  async addAttachment(
    reportId: string,
    file: File,
    currentScreenshots: ScreenshotMeta[],
    clubId: string = DEFAULT_CLUB_ID
  ): Promise<ScreenshotMeta> {
    const index = currentScreenshots.length;
    const ext = file.name.split('.').pop() || 'bin';
    const storagePath = `clubs/${clubId}/bug_reports/${reportId}/attachment_${index}_${Date.now()}.${ext}`;
    const storageRef = ref(storage, storagePath);

    // Upload to Firebase Storage
    await uploadBytes(storageRef, file, { contentType: file.type });
    const url = await getDownloadURL(storageRef);

    const newScreenshot: ScreenshotMeta = {
      url,
      page: file.name,
      capturedAt: new Date(),
      storagePath,
    };

    // Update Firestore with new attachment
    const updatedScreenshots = [...currentScreenshots, newScreenshot];
    const docRef = doc(db, this.collectionPath(clubId), reportId);
    await updateDoc(docRef, {
      screenshots: updatedScreenshots,
      updatedAt: serverTimestamp(),
    });
    logger.info(`🐛 Bug ${reportId}: pièce jointe ajoutée (${file.name})`);
    return newScreenshot;
  }

  /**
   * Ajoute un commentaire
   */
  async addComment(
    reportId: string,
    comment: Omit<BugReportComment, 'id' | 'createdAt'>,
    clubId: string = DEFAULT_CLUB_ID
  ): Promise<void> {
    const commentsRef = collection(
      db,
      this.collectionPath(clubId),
      reportId,
      'comments'
    );
    await addDoc(commentsRef, {
      ...comment,
      createdAt: serverTimestamp(),
    });
    logger.info(`🐛 Commentaire ajouté à ${reportId}`);
  }

  /**
   * Charge les commentaires d'un bug report
   */
  async fetchComments(
    reportId: string,
    clubId: string = DEFAULT_CLUB_ID
  ): Promise<BugReportComment[]> {
    const commentsRef = collection(
      db,
      this.collectionPath(clubId),
      reportId,
      'comments'
    );
    const q = query(commentsRef, orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    const comments: BugReportComment[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      comments.push({
        id: docSnap.id,
        authorName: data.authorName || 'Inconnu',
        authorUid: data.authorUid || '',
        text: data.text || '',
        createdAt: data.createdAt,
      });
    });
    return comments;
  }

  /**
   * Supprime un bug report avec toutes ses screenshots (Storage) et commentaires (subcollection)
   */
  async deleteReport(
    reportId: string,
    clubId: string = DEFAULT_CLUB_ID,
    screenshots: ScreenshotMeta[] = []
  ): Promise<void> {
    // 1. Supprimer toutes les screenshots du Storage
    for (const s of screenshots) {
      if (s.storagePath) {
        try {
          const storageRef = ref(storage, s.storagePath);
          await deleteObject(storageRef);
        } catch (e: any) {
          if (e?.code !== 'storage/object-not-found') {
            logger.warn(`🐛 Erreur suppression screenshot ${s.storagePath}:`, e);
          }
        }
      }
    }

    // Legacy screenshot formats
    const legacyPaths = [
      `clubs/${clubId}/bug_reports/${reportId}/screenshot.jpg`,
      `clubs/${clubId}/bug_reports/${reportId}/screenshot.png`,
    ];
    for (const path of legacyPaths) {
      try {
        await deleteObject(ref(storage, path));
      } catch (e: any) {
        if (e?.code !== 'storage/object-not-found') {
          logger.warn(`🐛 Erreur suppression legacy screenshot:`, e);
        }
      }
    }

    // 2. Supprimer la subcollection comments
    try {
      const commentsRef = collection(db, this.collectionPath(clubId), reportId, 'comments');
      const commentsSnap = await getDocs(commentsRef);
      const deletePromises = commentsSnap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    } catch (e) {
      logger.warn(`🐛 Erreur suppression commentaires de ${reportId}:`, e);
    }

    // 3. Supprimer le document Firestore
    const docRef = doc(db, this.collectionPath(clubId), reportId);
    await deleteDoc(docRef);
    logger.info(`🐛 Bug ${reportId} supprimé (+ screenshots + commentaires)`);
  }

  /**
   * Supprime tous les bug reports fermés (status === 'ferme')
   * Retourne le nombre de bugs supprimés
   */
  async deleteClosedReports(clubId: string = DEFAULT_CLUB_ID): Promise<number> {
    const all = await this.fetchAll(clubId);
    const closed = all.filter((r) => r.status === 'ferme');
    if (closed.length === 0) return 0;

    for (const report of closed) {
      await this.deleteReport(report.id, clubId, report.screenshots);
    }
    logger.info(`🐛 ${closed.length} bugs fermés supprimés`);
    return closed.length;
  }

  /**
   * Supprime une seule screenshot (par index) d'un bug report
   */
  async deleteScreenshotByIndex(
    reportId: string,
    index: number,
    currentScreenshots: ScreenshotMeta[],
    clubId: string = DEFAULT_CLUB_ID
  ): Promise<void> {
    const screenshot = currentScreenshots[index];
    if (!screenshot) return;

    // Supprimer du Storage
    if (screenshot.storagePath) {
      try {
        const storageRef = ref(storage, screenshot.storagePath);
        await deleteObject(storageRef);
        logger.info(`🐛 Screenshot supprimé: ${screenshot.storagePath}`);
      } catch (e: any) {
        if (e?.code !== 'storage/object-not-found') {
          logger.warn(`🐛 Erreur suppression screenshot:`, e);
        }
      }
    }

    // Mettre à jour Firestore
    const updatedScreenshots = currentScreenshots.filter((_, i) => i !== index);
    const docRef = doc(db, this.collectionPath(clubId), reportId);
    await updateDoc(docRef, {
      screenshots: updatedScreenshots,
      screenshotUrl: updatedScreenshots.length > 0 ? updatedScreenshots[0].url : null,
      updatedAt: serverTimestamp(),
    });
    logger.info(`🐛 Bug ${reportId}: screenshot ${index} supprimé, ${updatedScreenshots.length} restantes`);
  }

  /**
   * Supprime TOUTES les screenshots d'un bug report
   * (backward compat: aussi l'ancien format screenshot.jpg/png)
   */
  async deleteAllScreenshots(
    reportId: string,
    currentScreenshots: ScreenshotMeta[],
    clubId: string = DEFAULT_CLUB_ID
  ): Promise<void> {
    // Supprimer les nouvelles screenshots
    for (const s of currentScreenshots) {
      if (s.storagePath) {
        try {
          const storageRef = ref(storage, s.storagePath);
          await deleteObject(storageRef);
        } catch (e: any) {
          if (e?.code !== 'storage/object-not-found') {
            logger.warn(`🐛 Erreur suppression screenshot:`, e);
          }
        }
      }
    }

    // Aussi essayer les anciens formats (backward compat)
    const legacyPaths = [
      `clubs/${clubId}/bug_reports/${reportId}/screenshot.jpg`,
      `clubs/${clubId}/bug_reports/${reportId}/screenshot.png`,
    ];
    for (const path of legacyPaths) {
      try {
        const storageRef = ref(storage, path);
        await deleteObject(storageRef);
        logger.info(`🐛 Legacy screenshot supprimé: ${path}`);
      } catch (e: any) {
        if (e?.code !== 'storage/object-not-found') {
          logger.warn(`🐛 Erreur suppression legacy screenshot:`, e);
        }
      }
    }

    // Clear Firestore
    const docRef = doc(db, this.collectionPath(clubId), reportId);
    await updateDoc(docRef, {
      screenshots: [],
      screenshotUrl: null,
      updatedAt: serverTimestamp(),
    });
    logger.info(`🐛 Bug ${reportId}: toutes screenshots supprimées`);
  }

  /**
   * @deprecated Use deleteAllScreenshots or deleteScreenshotByIndex
   */
  async deleteScreenshot(
    reportId: string,
    clubId: string = DEFAULT_CLUB_ID
  ): Promise<void> {
    return this.deleteAllScreenshots(reportId, [], clubId);
  }

  /**
   * Génère le texte pour copier vers Claude Code
   */
  generateClaudeCodePrompt(report: BugReport): string {
    const lines: string[] = [
      `# Bug Report: ${report.title}`,
      '',
      `**Priorité:** ${BUG_PRIORITY_CONFIG[report.priority]?.emoji || ''} ${BUG_PRIORITY_CONFIG[report.priority]?.label || report.priority}`,
      `**Statut:** ${BUG_STATUS_CONFIG[report.status]?.label || report.status}`,
      `**Route/Page:** \`${report.currentRoute}\``,
      `**Rapporté par:** ${report.reporter.name} (${report.reporter.email})`,
      `**Date:** ${report.createdAt instanceof Timestamp ? report.createdAt.toDate().toLocaleString('fr-BE') : new Date(report.createdAt).toLocaleString('fr-BE')}`,
      '',
      `## Device Info`,
      `- Browser: ${report.device.model}`,
      `- OS: ${report.device.osVersion}`,
      `- App Version: ${report.device.appVersion}`,
      `- Platform: ${report.device.platform}`,
      '',
    ];

    if (report.description) {
      lines.push(`## Description`, report.description, '');
    }

    // Multi-screenshots
    if (report.screenshots.length > 0) {
      lines.push(`## Screenshots (${report.screenshots.length})`);
      report.screenshots.forEach((s, i) => {
        lines.push(`### Screenshot ${i + 1} — \`${s.page}\``);
        lines.push(`![Screenshot ${i + 1}](${s.url})`, '');
      });
    } else if (report.screenshotUrl) {
      lines.push(`## Screenshot`, `![Screenshot](${report.screenshotUrl})`, '');
    }

    lines.push(
      `## Instructions`,
      `Investigue et fix cette bug in het CalyCompta project.`,
      `De bug bevindt zich op route \`${report.currentRoute}\`.`,
      `Check de relevante components en services voor deze pagina.`,
    );

    return lines.join('\n');
  }

  /**
   * Crée manuellement un bug report (sans screenshot)
   */
  async createManualReport(
    data: {
      title: string;
      description: string;
      priority: BugPriority;
      currentRoute: string;
      reporter: { uid: string; name: string; email: string };
    },
    clubId: string = DEFAULT_CLUB_ID
  ): Promise<string> {
    const colRef = collection(db, this.collectionPath(clubId));
    const docData = {
      app: 'CalyCompta',
      title: data.title,
      description: data.description || '',
      priority: data.priority,
      status: 'nouveau' as BugStatus,
      reporter: data.reporter,
      device: {
        model: 'Manuel',
        os: navigator.platform || 'Inconnu',
        osVersion: '',
        appVersion: 'dev',
        platform: 'web',
      },
      currentRoute: data.currentRoute || '',
      screenshotUrl: null,
      screenshots: [],
      sentryReplayId: null,
      sentryEventUrl: null,
      linearIssueId: null,
      linearIssueUrl: null,
      createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(colRef, docData);
    logger.info(`🐛 Bug report créé manuellement: ${docRef.id}`);
    return docRef.id;
  }

  // ---- Private helpers ----

  private mapDoc(id: string, data: any): BugReport {
    // Migrate old status values to new ones
    let status: BugStatus = data.status || 'nouveau';
    if (status === 'open' as any) status = 'nouveau';
    if (status === 'in_progress' as any) status = 'en_cours';
    if (status === 'resolved' as any) status = 'resolu';
    if (status === 'closed' as any) status = 'ferme';

    // Build screenshots array (backward compat)
    let screenshots: ScreenshotMeta[] = [];
    if (Array.isArray(data.screenshots) && data.screenshots.length > 0) {
      screenshots = data.screenshots.map((s: any) => ({
        url: s.url || '',
        page: s.page || '',
        capturedAt: s.capturedAt || new Date(),
        storagePath: s.storagePath || '',
      }));
    } else if (data.screenshotUrl) {
      // Legacy single screenshot — create synthetic entry
      screenshots = [{
        url: data.screenshotUrl,
        page: data.currentRoute || '',
        capturedAt: data.createdAt || new Date(),
        storagePath: '', // unknown for legacy
      }];
    }

    return {
      id,
      app: data.app || 'CalyCompta',
      title: data.title || '(sans titre)',
      description: data.description || '',
      priority: data.priority || 'minor',
      status,
      reporter: {
        uid: data.reporter?.uid || '',
        name: data.reporter?.name || 'Inconnu',
        email: data.reporter?.email || '',
      },
      device: {
        model: data.device?.model || 'Inconnu',
        os: data.device?.os || 'Inconnu',
        osVersion: data.device?.osVersion || '',
        appVersion: data.device?.appVersion || '',
        platform: data.device?.platform || 'web',
      },
      currentRoute: data.currentRoute || '',
      screenshotUrl: data.screenshotUrl || null,
      screenshots,
      sentryReplayId: data.sentryReplayId || null,
      sentryEventUrl: data.sentryEventUrl || null,
      linearIssueId: data.linearIssueId || null,
      linearIssueUrl: data.linearIssueUrl || null,
      createdAt: data.createdAt || new Date(),
      updatedAt: data.updatedAt || null,
      resolvedAt: data.resolvedAt || null,
    };
  }
}

export const bugReportManagementService = new BugReportManagementService();
