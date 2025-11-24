import React, { useState } from 'react';
import { X, Calendar, DollarSign, Gift, ShoppingCart, Award, FileText, Upload } from 'lucide-react';
import { TypeOperation } from '@/types';

interface OperationTypeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: TypeOperation, importVPDive?: boolean) => void;
}

export function OperationTypeSelector({ isOpen, onClose, onSelectType }: OperationTypeSelectorProps) {
  const [selectedType, setSelectedType] = useState<TypeOperation | null>(null);
  const [showVPDiveChoice, setShowVPDiveChoice] = useState(false);

  if (!isOpen) return null;

  const operationTypes = [
    {
      type: 'evenement' as TypeOperation,
      icon: Calendar,
      label: 'Événement',
      description: 'Plongées, sorties, formations',
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
      borderColor: 'border-blue-500'
    },
    {
      type: 'cotisation' as TypeOperation,
      icon: DollarSign,
      label: 'Cotisation',
      description: 'Cotisations annuelles membres',
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
      borderColor: 'border-green-500'
    },
    {
      type: 'caution' as TypeOperation,
      icon: Gift,
      label: 'Caution',
      description: 'Cautions pour prêt de matériel',
      color: 'bg-pink-500',
      hoverColor: 'hover:bg-pink-600',
      borderColor: 'border-pink-500'
    },
    {
      type: 'vente' as TypeOperation,
      icon: ShoppingCart,
      label: 'Vente',
      description: 'Vente de matériel',
      color: 'bg-purple-500',
      hoverColor: 'hover:bg-purple-600',
      borderColor: 'border-purple-500'
    },
    {
      type: 'subvention' as TypeOperation,
      icon: Award,
      label: 'Subvention',
      description: 'ADEPS, fédération, subsides',
      color: 'bg-yellow-500',
      hoverColor: 'hover:bg-yellow-600',
      borderColor: 'border-yellow-500'
    },
    {
      type: 'autre' as TypeOperation,
      icon: FileText,
      label: 'Autre',
      description: 'Autre type d\'activité',
      color: 'bg-gray-500',
      hoverColor: 'hover:bg-gray-600',
      borderColor: 'border-gray-500'
    }
  ];

  const handleTypeClick = (type: TypeOperation) => {
    if (type === 'evenement') {
      setSelectedType(type);
      setShowVPDiveChoice(true);
    } else {
      onSelectType(type, false);
    }
  };

  const handleVPDiveChoice = (importVPDive: boolean) => {
    if (selectedType) {
      onSelectType(selectedType, importVPDive);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              {showVPDiveChoice ? 'Créer un événement' : 'Nouvelle activité'}
            </h2>
            <p className="text-gray-600 dark:text-dark-text-secondary mt-1">
              {showVPDiveChoice
                ? 'Choisissez comment créer l\'événement'
                : 'Sélectionnez le type d\'activité à créer'}
            </p>
          </div>
          <button
            onClick={() => {
              setShowVPDiveChoice(false);
              setSelectedType(null);
              onClose();
            }}
            className="text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {!showVPDiveChoice ? (
            /* Étape 1 : Sélection du type */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {operationTypes.map((opType) => {
                const Icon = opType.icon;
                return (
                  <button
                    key={opType.type}
                    onClick={() => handleTypeClick(opType.type)}
                    className={`flex items-start gap-4 p-4 border-2 ${opType.borderColor} rounded-lg ${opType.hoverColor} hover:shadow-lg transition-all text-left group`}
                  >
                    <div className={`${opType.color} p-3 rounded-lg text-white group-hover:scale-110 transition-transform`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-dark-text-primary group-hover:text-white transition-colors">
                        {opType.label}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-dark-text-secondary group-hover:text-white/80 transition-colors">
                        {opType.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Étape 2 : Choix VP Dive pour événements */
            <div className="space-y-4">
              <button
                onClick={() => handleVPDiveChoice(false)}
                className="w-full flex items-start gap-4 p-6 border-2 border-blue-500 rounded-lg hover:bg-blue-600 hover:shadow-lg transition-all text-left group"
              >
                <div className="bg-blue-500 p-3 rounded-lg text-white group-hover:scale-110 transition-transform">
                  <Calendar className="h-8 w-8" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary group-hover:text-white transition-colors">
                    Créer manuellement
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary group-hover:text-white/80 transition-colors mt-1">
                    Saisir les informations de l'événement via un formulaire
                  </p>
                </div>
              </button>

              <button
                onClick={() => handleVPDiveChoice(true)}
                className="w-full flex items-start gap-4 p-6 border-2 border-green-500 rounded-lg hover:bg-green-600 hover:shadow-lg transition-all text-left group"
              >
                <div className="bg-green-500 p-3 rounded-lg text-white group-hover:scale-110 transition-transform">
                  <Upload className="h-8 w-8" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary group-hover:text-white transition-colors">
                    Importer depuis VP Dive
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary group-hover:text-white/80 transition-colors mt-1">
                    Importer un fichier .xls exporté depuis VP Dive avec les participants
                  </p>
                </div>
              </button>

              <button
                onClick={() => {
                  setShowVPDiveChoice(false);
                  setSelectedType(null);
                }}
                className="w-full px-4 py-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary transition-colors"
              >
                ← Retour à la sélection du type
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
