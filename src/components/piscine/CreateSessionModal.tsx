import React, { useState } from 'react';
import { X, Calendar, MapPin, Clock, AlertCircle } from 'lucide-react';
import { PiscineSessionService } from '@/services/piscineSessionService';
import { PiscineLevel, PiscineSessionStatus, LevelAssignment, SessionAssignment } from '@/types';
import { GONFLAGE_SLOTS, THEORIE_SLOTS, type SessionType, type GonflageSlot } from '@/types/piscineSlots';
import toast from 'react-hot-toast';
import { logger } from '@/utils/logger';

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  clubId: string;
  userId: string;
  defaultLieu?: string;
}

export const CreateSessionModal: React.FC<CreateSessionModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  clubId,
  userId,
  defaultLieu = 'Piscine'
}) => {
  const [mode, setMode] = useState<'single' | 'month'>('single');
  const [sessionType, setSessionType] = useState<SessionType>('piscine');
  const [date, setDate] = useState<string>('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [lieu, setLieu] = useState(defaultLieu);
  const [horaireDebut, setHoraireDebut] = useState('20:30');
  const [horaireFin, setHoraireFin] = useState('21:30');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const months = [
    { value: 1, label: 'Janvier' },
    { value: 2, label: 'Février' },
    { value: 3, label: 'Mars' },
    { value: 4, label: 'Avril' },
    { value: 5, label: 'Mai' },
    { value: 6, label: 'Juin' },
    { value: 7, label: 'Juillet' },
    { value: 8, label: 'Août' },
    { value: 9, label: 'Septembre' },
    { value: 10, label: 'Octobre' },
    { value: 11, label: 'Novembre' },
    { value: 12, label: 'Décembre' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'single') {
        // Validate single date is a Tuesday
        const selectedDate = new Date(date);
        if (selectedDate.getDay() !== 2) {
          setError('La date sélectionnée doit être un mardi');
          setIsSubmitting(false);
          return;
        }

        // Create empty niveaux
        const niveaux: Record<string, LevelAssignment> = {};
        for (const level of PiscineLevel.all) {
          niveaux[level] = { encadrants: [] };
        }

        // Create empty gonflage slots
        const gonflage: Record<string, SessionAssignment[]> = {};
        for (const slot of GONFLAGE_SLOTS) {
          gonflage[slot] = [];
        }

        // Create théorie slots if théorie type
        const theorie: Record<string, LevelAssignment> | undefined =
          sessionType === 'theorie'
            ? Object.fromEntries(THEORIE_SLOTS.map(s => [s, { encadrants: [] }]))
            : undefined;

        await PiscineSessionService.createSession(clubId, {
          operationId: '',
          type: sessionType,
          date: selectedDate,
          lieu,
          horaireDebut,
          horaireFin,
          accueil: [],
          baptemes: [],
          gonflage: gonflage as Record<GonflageSlot, SessionAssignment[]>,
          niveaux,
          theorie,
          statut: PiscineSessionStatus.brouillon,
          createdBy: userId
        });

        toast.success('Séance créée avec succès');
      } else {
        // Create sessions for all Tuesdays in the month
        const sessionIds = await PiscineSessionService.createSessionsForMonth(
          clubId,
          year,
          month,
          lieu,
          userId
        );

        if (sessionIds.length === 0) {
          toast.success('Toutes les séances existent déjà pour ce mois');
        } else {
          toast.success(`${sessionIds.length} séance(s) créée(s) avec succès`);
        }
      }

      onCreated();
      onClose();
    } catch (err) {
      logger.error('Error creating session(s):', err);
      setError('Erreur lors de la création');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setDate('');
    setLieu(defaultLieu);
    setHoraireDebut('20:30');
    setHoraireFin('21:30');
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">
            Nouvelle séance
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-4">
            {/* Session type selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                Type de séance
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSessionType('piscine')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                    sessionType === 'piscine'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Piscine
                </button>
                <button
                  type="button"
                  onClick={() => setSessionType('theorie')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                    sessionType === 'theorie'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Théorie
                </button>
              </div>
            </div>

            {/* Mode selector */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setMode('single'); resetForm(); }}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'single'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Une séance
              </button>
              <button
                type="button"
                onClick={() => { setMode('month'); resetForm(); }}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'month'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Tout le mois
              </button>
            </div>

            {mode === 'single' ? (
              <>
                {/* Date picker */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                    Date (doit être un mardi)
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Times */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                      Heure début
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
                      <input
                        type="time"
                        value={horaireDebut}
                        onChange={(e) => setHoraireDebut(e.target.value)}
                        required
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                      Heure fin
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
                      <input
                        type="time"
                        value={horaireFin}
                        onChange={(e) => setHoraireFin(e.target.value)}
                        required
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Month/Year picker */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                      Mois
                    </label>
                    <select
                      value={month}
                      onChange={(e) => setMonth(Number(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {months.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                      Année
                    </label>
                    <input
                      type="number"
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                      min={2020}
                      max={2030}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {PiscineSessionService.getTuesdaysOfMonth(year, month).length} mardi(s) dans ce mois.
                    Les séances existantes ne seront pas dupliquées.
                  </p>
                </div>
              </>
            )}

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                Lieu
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
                <input
                  type="text"
                  value={lieu}
                  onChange={(e) => setLieu(e.target.value)}
                  required
                  placeholder="Ex: Piscine municipale"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div role="alert" className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Création...' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateSessionModal;
