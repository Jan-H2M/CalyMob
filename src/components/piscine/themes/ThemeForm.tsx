import React, { useState, useRef } from 'react';
import { X, Plus, Trash2, Upload, FileText, Loader2 } from 'lucide-react';
import { SessionTheme, ThemeCategory, THEME_CATEGORIES, RelatedExercice, ThemeDocument } from '@/types/sessionTheme.types';
import { useAuth } from '@/contexts/AuthContext';
import { getDisplayName } from '@/utils/fieldMapper';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

interface ThemeFormProps {
  theme: SessionTheme | null;  // null = create, filled = edit
  onSave: (data: Omit<SessionTheme, 'id'>) => Promise<void>;
  onClose: () => void;
}

const NIVEAUX = ['1*', '2*', '3*', '4*', 'AM', 'MC'];

export const ThemeForm: React.FC<ThemeFormProps> = ({ theme, onSave, onClose }) => {
  const { user, appUser } = useAuth();
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState(theme?.title ?? '');
  const [description, setDescription] = useState(theme?.description ?? '');
  const [instructorNotes, setInstructorNotes] = useState(theme?.instructorNotes ?? '');
  const [category, setCategory] = useState<ThemeCategory>(theme?.category ?? 'technique');
  const [difficulty, setDifficulty] = useState<'debutant' | 'intermediaire' | 'avance'>(theme?.difficulty ?? 'intermediaire');
  const [targetNiveaux, setTargetNiveaux] = useState<string[]>(theme?.targetNiveaux ?? []);
  const [relatedExercices, setRelatedExercices] = useState<RelatedExercice[]>(
    theme?.relatedExercices ?? []
  );
  const [documents, setDocuments] = useState<ThemeDocument[]>(theme?.documents ?? []);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const newDocs: ThemeDocument[] = [];
      for (const file of Array.from(files)) {
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `clubs/calypso/session_themes/${timestamp}_${safeName}`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        const fileType = file.name.endsWith('.pdf') ? 'pdf'
          : file.name.endsWith('.docx') || file.name.endsWith('.doc') ? 'docx'
          : file.type.startsWith('image/') ? 'image'
          : 'autre';

        newDocs.push({
          name: file.name,
          url,
          type: fileType,
          uploadedBy: user?.uid ?? '',
          uploadedByName: getDisplayName(appUser) ?? '',
          uploadedAt: new Date(),
        });
      }
      setDocuments(prev => [...prev, ...newDocs]);
    } catch (err) {
      console.error('Upload error:', err);
      alert('Erreur lors du téléchargement du fichier.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const toggleNiveau = (n: string) => {
    setTargetNiveaux(prev =>
      prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]
    );
  };

  const addExercice = () => {
    setRelatedExercices(prev => [...prev, { code: '', description: '' }]);
  };

  const removeExercice = (index: number) => {
    setRelatedExercices(prev => prev.filter((_, i) => i !== index));
  };

  const updateExercice = (index: number, field: keyof RelatedExercice, value: string) => {
    setRelatedExercices(prev =>
      prev.map((ex, i) => i === index ? { ...ex, [field]: value } : ex)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        instructorNotes: instructorNotes.trim() || '',        category,
        targetNiveaux,
        difficulty: difficulty as 'debutant' | 'intermediaire' | 'avance',
        relatedExercices: relatedExercices.filter(ex => ex.code.trim()),
        documents,
        timesUsed: theme?.timesUsed ?? 0,
        ...(theme?.lastUsedDate ? { lastUsedDate: theme.lastUsedDate } : {}),
        ...(theme?.lastUsedSessionId ? { lastUsedSessionId: theme.lastUsedSessionId } : {}),
        createdBy: theme?.createdBy ?? user?.uid ?? '',
        createdByName: theme?.createdByName ?? getDisplayName(appUser) ?? '',
        createdAt: theme?.createdAt ?? new Date(),
        updatedAt: new Date(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {theme ? 'Modifier le thème' : 'Nouveau thème'}
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="h-5 w-5" />          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Titre *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex: Gestion d'un givrage"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg
                dark:bg-dark-card dark:border-dark-border dark:text-white
                focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}              rows={3}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg
                dark:bg-dark-card dark:border-dark-border dark:text-white
                focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Instructor Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes pour le moniteur (optionnel)
            </label>
            <textarea
              value={instructorNotes}
              onChange={(e) => setInstructorNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg
                dark:bg-dark-card dark:border-dark-border dark:text-white
                focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Category + Difficulty row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Catégorie
              </label>              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ThemeCategory)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg
                  dark:bg-dark-card dark:border-dark-border dark:text-white"
              >
                {THEME_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Difficulté
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as 'debutant' | 'intermediaire' | 'avance')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg
                  dark:bg-dark-card dark:border-dark-border dark:text-white"
              >
                <option value="debutant">Débutant</option>
                <option value="intermediaire">Intermédiaire</option>
                <option value="avance">Avancé</option>
              </select>
            </div>
          </div>
          {/* Target Niveaux */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Niveaux ciblés
            </label>
            <div className="flex flex-wrap gap-2">
              {NIVEAUX.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggleNiveau(n)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    targetNiveaux.includes(n)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-dark-card text-gray-700 dark:text-gray-300 border-gray-300 dark:border-dark-border hover:border-blue-400'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Related Exercices */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Exercices LIFRAS liés (optionnel)
            </label>
            {relatedExercices.map((ex, i) => (              <div key={i} className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={ex.code}
                  onChange={(e) => updateExercice(i, 'code', e.target.value)}
                  placeholder="P2.CO"
                  className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg text-sm font-mono
                    dark:bg-dark-card dark:border-dark-border dark:text-white"
                />
                <input
                  type="text"
                  value={ex.description}
                  onChange={(e) => updateExercice(i, 'description', e.target.value)}
                  placeholder="Épreuve du combiné"
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm
                    dark:bg-dark-card dark:border-dark-border dark:text-white"
                />
                <button type="button" onClick={() => removeExercice(i)}
                  className="p-1.5 text-gray-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button type="button" onClick={addExercice}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
              <Plus className="h-4 w-4" /> Ajouter un exercice
            </button>
          </div>
          {/* Documents pédagogiques */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Documents pédagogiques (optionnel)
            </label>
            {documents.length > 0 && (
              <div className="space-y-2 mb-3">
                {documents.map((doc, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-dark-hover rounded-lg">
                    <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{doc.name}</span>
                    <span className="text-xs text-gray-400 uppercase flex-shrink-0">{doc.type}</span>
                    <button type="button" onClick={() => removeDocument(i)}
                      className="p-1 text-gray-400 hover:text-red-600 flex-shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Téléchargement en cours...</>
              ) : (
                <><Upload className="h-4 w-4" /> Ajouter un document</>
              )}
            </button>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Enregistrement...' : theme ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};