import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Bug, X, Send, Loader2, Trash2, Plus, Camera, Image } from 'lucide-react';
import html2canvas from 'html2canvas';
import { useAuth } from '@/contexts/AuthContext';
import { bugReportService, BugReportData, ScreenshotEntry } from '@/services/bugReportService';
import { getDisplayName } from '@/utils/fieldMapper';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

// ============================================
// Context global pour activer le mode bug report
// ============================================
interface BugReportContextType {
  isActive: boolean;
  activate: () => void;
}

const BugReportContext = React.createContext<BugReportContextType>({
  isActive: false,
  activate: () => {},
});

export const useBugReport = () => React.useContext(BugReportContext);

// ============================================
// Provider + Overlay (multi-screenshot support)
// ============================================
const AUTO_TIMEOUT_MS = 120_000; // 120 secondes (plus de temps pour multi-page)

type Priority = 'blocking' | 'annoying' | 'minor';

const PRIORITIES: { value: Priority; label: string; emoji: string; color: string }[] = [
  { value: 'blocking', label: 'Bloquant', emoji: '🔴', color: 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' },
  { value: 'annoying', label: 'Gênant', emoji: '🟡', color: 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300' },
  { value: 'minor', label: 'Mineur', emoji: '🔵', color: 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' },
];

interface LocalScreenshot {
  blob: Blob;
  previewUrl: string;
  page: string;       // route where the screenshot was taken
  capturedAt: Date;
}

export function BugReportProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [screenshots, setScreenshots] = useState<LocalScreenshot[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('annoying');

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const [iconPos, setIconPos] = useState({ x: -1, y: -1 }); // -1 = use default

  const location = useLocation();
  const { user, appUser } = useAuth();

  // Activer le mode bug report
  const activate = useCallback(() => {
    setIsActive(true);
    setShowForm(false);
    setScreenshots([]);
    setTitle('');
    setDescription('');
    setPriority('annoying');
    setIconPos({ x: -1, y: -1 });
  }, []);

  // Désactiver tout
  const deactivate = useCallback(() => {
    setIsActive(false);
    setShowForm(false);
    // Nettoyer les preview URLs
    screenshots.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    setScreenshots([]);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, [screenshots]);

  // Auto-timeout
  useEffect(() => {
    if (isActive && !showForm) {
      timeoutRef.current = setTimeout(() => {
        deactivate();
        toast('Mode bug report expiré', { icon: '⏱️' });
      }, AUTO_TIMEOUT_MS);
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }
  }, [isActive, showForm, deactivate]);

  // Prendre une capture d'écran et ouvrir le formulaire
  const captureAndOpenForm = useCallback(async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    try {
      // Cacher l'icône temporairement pour la capture
      if (iconRef.current) iconRef.current.style.display = 'none';

      const canvas = await html2canvas(document.body, {
        useCORS: true,
        logging: false,
        scale: 1,
        ignoreElements: (el) => el.id === 'bug-report-overlay',
      });

      if (iconRef.current) iconRef.current.style.display = '';

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.7)
      );

      if (blob) {
        const newScreenshot: LocalScreenshot = {
          blob,
          previewUrl: URL.createObjectURL(blob),
          page: location.pathname,
          capturedAt: new Date(),
        };
        setScreenshots((prev) => [...prev, newScreenshot]);
      }
    } catch (e) {
      console.warn('Erreur capture écran:', e);
      if (iconRef.current) iconRef.current.style.display = '';
    }

    setShowForm(true);
  }, [location.pathname]);

  // Ajouter encore une screenshot (retour au mode capture)
  const addAnotherScreenshot = useCallback(() => {
    setShowForm(false);
    // L'icône reste active, l'utilisateur navigue vers une autre page et clique à nouveau
    toast('Naviguez vers une autre page et cliquez le bug', { icon: '📸', duration: 3000 });
  }, []);

  // Supprimer une screenshot individuelle
  const removeScreenshot = useCallback((index: number) => {
    setScreenshots((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].previewUrl);
      updated.splice(index, 1);
      return updated;
    });
  }, []);

  // Soumettre le bug report
  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !user) return;

    setIsSubmitting(true);
    try {
      const userName = appUser ? getDisplayName(appUser) : user.email || 'Inconnu';

      // Convertir les screenshots locaux pour le service
      const screenshotEntries: ScreenshotEntry[] = screenshots.map((s) => ({
        blob: s.blob,
        page: s.page,
        capturedAt: s.capturedAt,
      }));

      await bugReportService.submitBugReport(
        user.uid,
        userName,
        user.email || '',
        {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          screenshots: screenshotEntries,
          currentRoute: location.pathname,
        }
      );

      toast.success('Merci ! Nous allons examiner votre signalement.');
      deactivate();
    } catch (e) {
      console.error('Erreur envoi bug report:', e);
      toast.error("Erreur lors de l'envoi. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  }, [title, description, priority, screenshots, user, appUser, location.pathname, deactivate]);

  // Drag handler pour l'icône
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const el = iconRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    el.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      setIconPos({
        x: e.clientX - dragRef.current.offsetX,
        y: e.clientY - dragRef.current.offsetY,
      });
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = Math.abs(e.clientX - dragRef.current.startX);
    const dy = Math.abs(e.clientY - dragRef.current.startY);
    dragRef.current = null;
    if (dx < 5 && dy < 5) {
      captureAndOpenForm();
    }
  }, [captureAndOpenForm]);

  return (
    <BugReportContext.Provider value={{ isActive, activate }}>
      {children}

      {/* Overlay flottant - bug icône */}
      {isActive && !showForm && (
        <button
          ref={iconRef}
          id="bug-report-overlay"
          className="fixed z-[9999] flex items-center justify-center w-12 h-12
                     rounded-full bg-orange-500 hover:bg-orange-600 text-white
                     shadow-lg cursor-grab active:cursor-grabbing
                     transition-colors animate-pulse"
          style={
            iconPos.x >= 0
              ? { left: iconPos.x, top: iconPos.y }
              : { right: 24, bottom: 24 }
          }
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="Cliquez pour capturer cette page"
        >
          {screenshots.length > 0 ? (
            <span className="relative">
              <Camera className="w-6 h-6" />
              <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-white text-orange-600 text-[10px] font-bold flex items-center justify-center">
                {screenshots.length}
              </span>
            </span>
          ) : (
            <Bug className="w-6 h-6" />
          )}
        </button>
      )}

      {/* Modal formulaire */}
      {showForm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Bug className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Signaler un bug
                </h2>
                {screenshots.length > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {screenshots.length} capture{screenshots.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button
                onClick={deactivate}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Screenshot gallery */}
              {screenshots.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Captures d'écran
                    </label>
                    <button
                      onClick={addAnotherScreenshot}
                      className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium"
                      title="Naviguer vers une autre page pour ajouter une capture"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Ajouter une page
                    </button>
                  </div>
                  <div className={cn(
                    'grid gap-2',
                    screenshots.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                  )}>
                    {screenshots.map((s, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={s.previewUrl}
                          alt={`Capture ${i + 1}`}
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 max-h-36 object-cover object-top"
                        />
                        {/* Page label */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-b-lg truncate">
                          {s.page}
                        </div>
                        {/* Delete button */}
                        <button
                          onClick={() => removeScreenshot(i)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-full bg-red-500 text-white
                                     opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Supprimer cette capture"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        {/* Badge number */}
                        {screenshots.length > 1 && (
                          <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bouton capture si aucune screenshot */}
              {screenshots.length === 0 && (
                <button
                  onClick={addAnotherScreenshot}
                  className="w-full py-6 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600
                             text-gray-400 dark:text-gray-500 hover:border-orange-400 hover:text-orange-500
                             transition-colors flex flex-col items-center gap-2"
                >
                  <Image className="w-8 h-8" />
                  <span className="text-sm">Ajouter une capture d'écran</span>
                </button>
              )}

              {/* Titre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Quel est le problème ? <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Le bouton Sauvegarder ne fonctionne pas"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                             placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent
                             text-sm"
                  autoFocus
                  maxLength={200}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Plus de détails
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Décrivez les étapes pour reproduire le problème..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                             placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent
                             text-sm resize-none"
                  maxLength={2000}
                />
              </div>

              {/* Gravité */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Gravité
                </label>
                <div className="flex gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setPriority(p.value)}
                      className={cn(
                        'flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all',
                        priority === p.value
                          ? p.color
                          : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                      )}
                    >
                      <span className="mr-1">{p.emoji}</span> {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Info auto-collectée */}
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Informations collectées automatiquement : navigateur, OS, version de l'app,
                route actuelle, identifiant utilisateur.
              </p>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={deactivate}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800
                           dark:hover:text-gray-200 transition-colors"
                disabled={isSubmitting}
              >
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={!title.trim() || isSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600
                           text-white text-sm font-medium transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Envoi...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Envoyer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </BugReportContext.Provider>
  );
}
