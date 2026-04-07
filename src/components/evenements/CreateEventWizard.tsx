import { logger } from '@/utils/logger';
/**
 * Wizard de création d'événement en 2 étapes :
 * 1. Sélection du lieu de plongée
 * 2. Détails de l'événement (pré-remplis avec les données du lieu)
 */

import React, { useState, useEffect } from 'react';
import { X, Calendar, MapPin, Users, FileText, User, ChevronLeft, ChevronRight, Euro, AlertCircle, Edit2 } from 'lucide-react';
import { Operation, Membre } from '@/types';
import { DiveLocation, Tariff } from '@/types/tariff.types';
import { cn } from '@/utils/utils';
import { copyTariffsFromLocation, computeBudgetPrevu } from '@/utils/tariffUtils';
import { DiveLocationService } from '@/services/diveLocationService';
import { useAuth } from '@/contexts/AuthContext';

type WizardStep = 'select_location' | 'event_details';

interface CreateEventWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Partial<Operation>) => Promise<void>;
  onCreateManual?: () => void; // Callback pour créer manuellement (sans lieu prédéfini)
  existingEvent?: Operation | null; // Pour l'édition
}

export function CreateEventWizard({
  isOpen,
  onClose,
  onSave,
  onCreateManual,
  existingEvent
}: CreateEventWizardProps) {
  const { clubId } = useAuth();

  // État du wizard
  const [currentStep, setCurrentStep] = useState<WizardStep>('select_location');
  const [selectedLocation, setSelectedLocation] = useState<DiveLocation | null>(null);
  const [locations, setLocations] = useState<DiveLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  // État du formulaire événement
  const [eventDraft, setEventDraft] = useState<Partial<Operation>>({
    titre: '',
    description: '',
    type: 'evenement',
    date_debut: new Date(),
    date_fin: undefined,
    lieu: '',
    lieu_id: '',
    capacite_max: undefined,
    montant_prevu: 0,
    statut: 'brouillon',
    organisateur_id: '',
    organisateur_nom: '',
    event_tariffs: []
  });

  const [saving, setSaving] = useState(false);

  // Charger les lieux au montage
  useEffect(() => {
    // Charger les lieux pour une nouvelle création (pas d'id)
    if (isOpen && (!existingEvent || !existingEvent.id)) {
      loadLocations();
    }
  }, [isOpen, clubId, existingEvent]);

  // Si édition d'un événement existant, skip vers les détails
  useEffect(() => {
    // Un objet vide ou sans id = nouvelle création
    if (existingEvent && existingEvent.id) {
      setEventDraft({
        ...existingEvent,
        date_debut: existingEvent.date_debut || new Date(),
        date_fin: existingEvent.date_fin || undefined
      });
      setCurrentStep('event_details');
    } else {
      // Nouvelle création : commencer par sélection du lieu
      setCurrentStep('select_location');
      // Créer une date par défaut avec une heure raisonnable (14:00)
      const defaultDate = new Date();
      defaultDate.setHours(14, 0, 0, 0);

      setEventDraft({
        titre: '',
        description: '',
        type: 'evenement',
        date_debut: defaultDate,
        date_fin: undefined,
        lieu: '',
        lieu_id: '',
        capacite_max: undefined,
        montant_prevu: 0,
        statut: 'brouillon',
        organisateur_id: '',
        organisateur_nom: '',
        event_tariffs: []
      });
    }
  }, [existingEvent, isOpen]);

  const loadLocations = async () => {
    if (!clubId) return;

    setLoadingLocations(true);
    try {
      const locs = await DiveLocationService.getAllLocations(clubId);
      setLocations(locs);
    } catch (error) {
      logger.error('Error loading locations:', error);
    } finally {
      setLoadingLocations(false);
    }
  };

  const handleLocationSelected = (location: DiveLocation) => {
    setSelectedLocation(location);

    // Pré-remplir le formulaire avec les données du lieu
    const copiedTariffs = copyTariffsFromLocation(location.tariffs);
    const budget = computeBudgetPrevu(copiedTariffs, eventDraft.capacite_max);

    setEventDraft(prev => ({
      ...prev,
      lieu: location.name,
      lieu_id: location.id,
      event_category: 'plongee', // Locatie selectie = plongée event
      description: location.description || '',
      event_tariffs: copiedTariffs,
      montant_prevu: budget,
      titre: location.name
    }));

    // Passer à l'étape suivante
    setCurrentStep('event_details');
  };

  const handleBack = () => {
    if (currentStep === 'event_details' && !existingEvent) {
      setCurrentStep('select_location');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      await onSave(eventDraft);
      handleReset();
    } catch (error) {
      logger.error('Error saving event:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setCurrentStep('select_location');
    setSelectedLocation(null);
    setEventDraft({
      titre: '',
      description: '',
      type: 'evenement',
      date_debut: new Date(),
      date_fin: undefined,
      lieu: '',
      lieu_id: '',
      capacite_max: undefined,
      montant_prevu: 0,
      statut: 'brouillon',
      organisateur_id: '',
      organisateur_nom: '',
      event_tariffs: []
    });
    onClose();
  };

  const updateField = <K extends keyof Operation>(field: K, value: Operation[K]) => {
    setEventDraft(prev => ({ ...prev, [field]: value }));

    // Recalculer budget si capacité change
    if (field === 'capacite_max' && eventDraft.event_tariffs) {
      const newBudget = computeBudgetPrevu(eventDraft.event_tariffs, value as number);
      setEventDraft(prev => ({ ...prev, montant_prevu: newBudget }));
    }
  };

  if (!isOpen) return null;

  const isNewEvent = !existingEvent || !existingEvent.id;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 dark:bg-black/60 z-40"
        onClick={handleReset}
      />

      {/* Panel latéral */}
      <div className={cn(
        "fixed right-0 top-0 h-full bg-white dark:bg-dark-bg-primary shadow-2xl z-50 flex flex-col transition-transform duration-300",
        isOpen ? "translate-x-0" : "translate-x-full",
        "w-full max-w-3xl"
      )}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-calypso-blue to-calypso-blue-dark">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">
                {isNewEvent ? 'Nouvel événement' : 'Modifier l\'événement'}
              </h2>
              {isNewEvent && (
                <p className="text-sm text-white/80 mt-1">
                  {currentStep === 'select_location' ? 'Étape 1/2 : Sélection du lieu' : 'Étape 2/2 : Détails de l\'événement'}
                </p>
              )}
            </div>
            <button
              onClick={handleReset}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ÉTAPE 1 : Sélection du lieu */}
          {currentStep === 'select_location' && (
            <LocationSelectionStep
              locations={locations}
              loading={loadingLocations}
              selectedLocation={selectedLocation}
              onLocationSelected={handleLocationSelected}
              onRefresh={loadLocations}
              onCreateManual={onCreateManual}
            />
          )}

          {/* ÉTAPE 2 : Détails de l'événement */}
          {currentStep === 'event_details' && (
            <EventDetailsStep
              eventDraft={eventDraft}
              selectedLocation={selectedLocation}
              onUpdateField={updateField}
              isNewEvent={isNewEvent}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary flex justify-between gap-3">
          <div>
            {currentStep === 'event_details' && isNewEvent && (
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary transition-colors flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Retour
              </button>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary transition-colors"
              disabled={saving}
            >
              Annuler
            </button>

            {currentStep === 'event_details' && (
              <button
                onClick={handleSubmit}
                disabled={saving || !eventDraft.titre || !eventDraft.date_debut}
                className={cn(
                  "px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors flex items-center gap-2",
                  (saving || !eventDraft.titre || !eventDraft.date_debut) && "opacity-50 cursor-not-allowed"
                )}
              >
                {saving ? 'Enregistrement...' : (isNewEvent ? 'Créer l\'événement' : 'Enregistrer')}
                {!saving && <ChevronRight className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// SOUS-COMPOSANTS
// ============================================================================

/**
 * Étape 1 : Sélection du lieu de plongée
 */
interface LocationSelectionStepProps {
  locations: DiveLocation[];
  loading: boolean;
  selectedLocation: DiveLocation | null;
  onLocationSelected: (location: DiveLocation) => void;
  onRefresh: () => void;
  onCreateManual?: () => void;
}

function LocationSelectionStep({
  locations,
  loading,
  selectedLocation,
  onLocationSelected,
  onRefresh,
  onCreateManual
}: LocationSelectionStepProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLocations = locations.filter(loc =>
    loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    loc.country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-2">
          Choisir un lieu de plongée
        </h3>
        <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
          Sélectionnez un lieu pour pré-remplir les tarifs et les informations de l'événement.
        </p>
      </div>

      {/* Option créer manuellement */}
      {onCreateManual && (
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border pb-4 mb-4">
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
            Événement hors plongée ou lieu non répertorié ?
          </p>
          <button
            type="button"
            onClick={onCreateManual}
            className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 transition-colors text-sm font-medium"
          >
            Créer manuellement
          </button>
        </div>
      )}

      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Rechercher un lieu..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-8 text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
          Chargement des lieux...
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredLocations.length === 0 && (
        <div className="text-center py-8">
          <AlertCircle className="h-12 w-12 text-gray-400 dark:text-dark-text-muted mx-auto mb-3" />
          <p className="text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
            {searchQuery ? 'Aucun lieu trouvé' : 'Aucun lieu configuré'}
          </p>
          <button
            onClick={onRefresh}
            className="mt-3 text-calypso-blue hover:underline"
          >
            Rafraîchir
          </button>
        </div>
      )}

      {/* Liste des lieux */}
      {!loading && filteredLocations.length > 0 && (
        <div className="grid gap-3">
          {filteredLocations.map(location => (
            <LocationCard
              key={location.id}
              location={location}
              isSelected={selectedLocation?.id === location.id}
              onSelect={() => onLocationSelected(location)}
            />
          ))}
        </div>
      )}

    </div>
  );
}

/**
 * Card pour afficher un lieu
 */
interface LocationCardProps {
  location: DiveLocation;
  isSelected: boolean;
  onSelect: () => void;
}

function LocationCard({ location, isSelected, onSelect }: LocationCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left p-4 rounded-lg border-2 transition-all hover:shadow-md",
        isSelected
          ? "border-calypso-blue bg-calypso-blue/5 dark:bg-calypso-blue/10"
          : "border-gray-200 dark:border-dark-border hover:border-gray-300 dark:border-dark-border dark:hover:border-gray-600 bg-white dark:bg-dark-bg-secondary"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="h-4 w-4 text-calypso-blue" />
            <h4 className="font-semibold text-gray-900 dark:text-dark-text-primary">
              {location.name}
            </h4>
            <span className="text-xs text-gray-500 dark:text-dark-text-muted">
              {location.country}
            </span>
          </div>

          {location.description && (
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary line-clamp-2 mb-2">
              {location.description}
            </p>
          )}

          {/* Tarifs */}
          <div className="flex flex-wrap gap-2">
            {location.tariffs.map((tariff, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-dark-bg-tertiary text-xs rounded"
              >
                <span className="text-gray-700 dark:text-dark-text-primary">{tariff.label}</span>
                <span className="font-semibold text-calypso-blue">{tariff.price}€</span>
              </span>
            ))}
          </div>
        </div>

        {isSelected && (
          <div className="ml-3">
            <div className="h-6 w-6 rounded-full bg-calypso-blue flex items-center justify-center">
              <ChevronRight className="h-4 w-4 text-white" />
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

/**
 * Étape 2 : Détails de l'événement
 */
interface EventDetailsStepProps {
  eventDraft: Partial<Operation>;
  selectedLocation: DiveLocation | null;
  onUpdateField: <K extends keyof Operation>(field: K, value: Operation[K]) => void;
  isNewEvent: boolean;
}

function EventDetailsStep({
  eventDraft,
  selectedLocation,
  onUpdateField,
  isNewEvent
}: EventDetailsStepProps) {
  return (
    <div className="space-y-6">
      {/* Lieu sélectionné (read-only) */}
      {selectedLocation && isNewEvent && (
        <div className="p-4 bg-calypso-blue/5 dark:bg-calypso-blue/10 border border-calypso-blue/20 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-4 w-4 text-calypso-blue" />
            <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
              Lieu sélectionné :
            </span>
          </div>
          <p className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            {selectedLocation.name} ({selectedLocation.country})
          </p>
        </div>
      )}

      {/* Titre */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
          <FileText className="inline h-4 w-4 mr-1" />
          Titre de l'événement *
        </label>
        <input
          type="text"
          required
          value={eventDraft.titre || ''}
          onChange={(e) => onUpdateField('titre', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
          placeholder="Ex: Plongée Zélande Avril 2025"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
          Description
        </label>
        <textarea
          value={eventDraft.description || ''}
          onChange={(e) => onUpdateField('description', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
          placeholder="Description de l'événement..."
        />
      </div>

      {/* Dates et Heures */}
      <div className="space-y-4">
        {/* Date de début */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
            <Calendar className="inline h-4 w-4 mr-1" />
            Date et heure de début *
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              required
              value={(() => {
                if (!eventDraft.date_debut) return '';
                const date = new Date(eventDraft.date_debut);
                if (isNaN(date.getTime())) return '';
                // Utiliser les méthodes locales pour éviter le décalage UTC
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
              })()}
              onChange={(e) => {
                if (e.target.value) {
                  const currentDate = eventDraft.date_debut ? new Date(eventDraft.date_debut) : new Date();
                  const [year, month, day] = e.target.value.split('-').map(Number);
                  const newDate = new Date(year, month - 1, day, currentDate.getHours(), currentDate.getMinutes());
                  onUpdateField('date_debut', newDate);
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
            />
            <input
              type="time"
              required
              value={(() => {
                if (!eventDraft.date_debut) return '14:00';
                const date = new Date(eventDraft.date_debut);
                if (!isNaN(date.getTime())) {
                  const hours = date.getHours().toString().padStart(2, '0');
                  const minutes = date.getMinutes().toString().padStart(2, '0');
                  return `${hours}:${minutes}`;
                }
                return '14:00';
              })()}
              onChange={(e) => {
                if (e.target.value) {
                  const [hours, minutes] = e.target.value.split(':').map(Number);
                  const currentDate = eventDraft.date_debut ? new Date(eventDraft.date_debut) : new Date();
                  const newDate = new Date(currentDate);
                  newDate.setHours(hours, minutes, 0, 0);
                  onUpdateField('date_debut', newDate);
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
            />
          </div>
        </div>

        {/* Date de fin */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
            Date et heure de fin (optionnel)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={(() => {
                if (!eventDraft.date_fin) return '';
                const date = new Date(eventDraft.date_fin);
                if (isNaN(date.getTime())) return '';
                // Utiliser les méthodes locales pour éviter le décalage UTC
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
              })()}
              onChange={(e) => {
                if (e.target.value) {
                  const currentDate = eventDraft.date_fin ? new Date(eventDraft.date_fin) : new Date();
                  const [year, month, day] = e.target.value.split('-').map(Number);
                  const newDate = new Date(year, month - 1, day, currentDate.getHours() || 18, currentDate.getMinutes() || 0);
                  onUpdateField('date_fin', newDate);
                } else {
                  onUpdateField('date_fin', undefined);
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
            />
            <input
              type="time"
              value={(() => {
                if (!eventDraft.date_fin) return '';
                const date = new Date(eventDraft.date_fin);
                if (!isNaN(date.getTime())) {
                  const hours = date.getHours().toString().padStart(2, '0');
                  const minutes = date.getMinutes().toString().padStart(2, '0');
                  return `${hours}:${minutes}`;
                }
                return '';
              })()}
              onChange={(e) => {
                if (e.target.value && eventDraft.date_fin) {
                  const [hours, minutes] = e.target.value.split(':').map(Number);
                  const currentDate = new Date(eventDraft.date_fin);
                  const newDate = new Date(currentDate);
                  newDate.setHours(hours, minutes, 0, 0);
                  onUpdateField('date_fin', newDate);
                }
              }}
              disabled={!eventDraft.date_fin}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Capacité max & Budget */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
            <Users className="inline h-4 w-4 mr-1" />
            Capacité maximale
          </label>
          <input
            type="number"
            min="1"
            value={eventDraft.capacite_max || ''}
            onChange={(e) => onUpdateField('capacite_max', e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
            placeholder="Illimité"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
            <Euro className="inline h-4 w-4 mr-1" />
            Budget prévisionnel
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={eventDraft.montant_prevu || 0}
            onChange={(e) => onUpdateField('montant_prevu', parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
          />
        </div>
      </div>

      {/* Organisateur */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
          <User className="inline h-4 w-4 mr-1" />
          Organisateur
        </label>
        <input
          type="text"
          value={eventDraft.organisateur_nom || ''}
          onChange={(e) => onUpdateField('organisateur_nom', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
          placeholder="Nom de l'organisateur"
        />
      </div>

      {/* Tarifs (read-only preview) */}
      {eventDraft.event_tariffs && eventDraft.event_tariffs.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
            Tarifs pour cet événement
          </label>
          <div className="p-4 bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg">
            <div className="grid gap-2">
              {eventDraft.event_tariffs.map((tariff, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-dark-text-primary">
                    {tariff.label}
                  </span>
                  <span className="text-sm font-semibold text-calypso-blue">
                    {tariff.price.toFixed(2)} €
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-3">
              💡 Ces tarifs ont été copiés depuis le lieu. Vous pourrez les modifier après la création de l'événement.
            </p>
          </div>
        </div>
      )}

      {/* Statut */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
          Statut
        </label>
        <select
          value={eventDraft.statut || 'brouillon'}
          onChange={(e) => onUpdateField('statut', e.target.value as Operation['statut'])}
          className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary"
        >
          <option value="brouillon">Brouillon</option>
          <option value="ouvert">Ouvert</option>
          <option value="ferme">Fermé</option>
          <option value="annule">Annulé</option>
        </select>
      </div>
    </div>
  );
}
