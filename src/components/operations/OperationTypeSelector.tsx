import { X, Waves, Droplets, PartyPopper } from 'lucide-react';
import { EventCategory } from '@/types';

interface OperationTypeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEventCategory: (category: EventCategory) => void;
  onNavigateToPiscine: () => void;
}

export function OperationTypeSelector({ isOpen, onClose, onSelectEventCategory, onNavigateToPiscine }: OperationTypeSelectorProps) {
  if (!isOpen) return null;

  const eventCategories = [
    {
      category: 'plongee' as EventCategory,
      icon: Waves,
      label: 'Plongée',
      description: 'Sélectionner un lieu de plongée',
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
      borderColor: 'border-blue-500'
    },
    {
      category: 'piscine' as EventCategory,
      icon: Droplets,
      label: 'Piscine',
      description: 'Entraînement piscine',
      color: 'bg-cyan-500',
      hoverColor: 'hover:bg-cyan-600',
      borderColor: 'border-cyan-500'
    },
    {
      category: 'sortie' as EventCategory,
      icon: PartyPopper,
      label: 'Sortie',
      description: 'Événement festif ou sortie club',
      color: 'bg-orange-500',
      hoverColor: 'hover:bg-orange-600',
      borderColor: 'border-orange-500'
    }
  ];

  const handleCategoryClick = (category: EventCategory) => {
    if (category === 'piscine') {
      onClose();
      onNavigateToPiscine();
    } else {
      onSelectEventCategory(category);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              Nouvelle activité
            </h2>
            <p className="text-gray-600 dark:text-dark-text-secondary mt-1">
              Sélectionnez le type d'événement à créer
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-dark-text-secondary transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {eventCategories.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.category}
                  onClick={() => handleCategoryClick(cat.category)}
                  className={`flex flex-col items-center gap-3 p-6 border-2 ${cat.borderColor} rounded-lg ${cat.hoverColor} hover:shadow-lg transition-all text-center group`}
                >
                  <div className={`${cat.color} p-4 rounded-full text-white group-hover:scale-110 transition-transform`}>
                    <Icon className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-gray-900 dark:text-dark-text-primary group-hover:text-white transition-colors">
                      {cat.label}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary group-hover:text-white/80 transition-colors mt-1">
                      {cat.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
