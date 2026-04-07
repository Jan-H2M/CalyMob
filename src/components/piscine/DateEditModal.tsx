import React, { useState, useEffect } from 'react';
import { X, Calendar } from 'lucide-react';
import { logger } from '@/utils/logger';

interface DateEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDate: Date;
  onSave: (newDate: Date) => Promise<void>;
}

export const DateEditModal: React.FC<DateEditModalProps> = ({
  isOpen,
  onClose,
  currentDate,
  onSave
}) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && currentDate) {
      // Format date as YYYY-MM-DD for input
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      setSelectedDate(`${year}-${month}-${day}`);
    }
  }, [currentDate, isOpen]);

  const handleSave = async () => {
    if (!selectedDate) return;

    setIsSaving(true);
    try {
      // Parse the date and set to noon to avoid timezone issues
      const [year, month, day] = selectedDate.split('-').map(Number);
      const newDate = new Date(year, month - 1, day, 12, 0, 0, 0);

      await onSave(newDate);
      onClose();
    } catch (error) {
      logger.error('Error saving date:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const weekdays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const months = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ];
    return `${weekdays[date.getDay()]} ${day} ${months[month - 1]} ${year}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              Modifier la date
            </h3>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
                Nouvelle date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>

            {selectedDate && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {formatDisplayDate(selectedDate)}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 p-4 border-t border-gray-200 dark:border-dark-border dark:border-gray-700">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300
                         bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                         rounded-lg transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !selectedDate}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white
                         bg-blue-600 hover:bg-blue-700 rounded-lg
                         transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DateEditModal;
