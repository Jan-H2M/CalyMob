import React, { useState, useEffect, useRef } from 'react';
import { X, Package, Camera, Trash2, Upload, Image as ImageIcon, Calendar, MapPin, Wrench } from 'lucide-react';
import { InventoryItemService } from '@/services/inventoryItemService';
import { InventoryConfigService } from '@/services/inventoryConfigService';
import { InventoryItem, ItemType, Location, MaintenanceRecord } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import { cn } from '@/utils/utils';

interface Props {
  item: InventoryItem;
  isCreateMode: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function MaterielDetailView({ item, isCreateMode, onClose, onSave }: Props) {
  const { clubId } = useAuth();
  const [types, setTypes] = useState<ItemType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    numero_serie: item.numero_serie || '',
    typeId: item.typeId || '',
    nom: item.nom || '',
    emplacementId: item.emplacementId || '',
    statut: item.statut || 'disponible',
    valeur_achat: item.valeur_achat || 0,
    date_achat: item.date_achat,
    date_mise_service: item.date_mise_service,
    date_derniere_maintenance: item.date_derniere_maintenance,
    date_derniere_revision: item.date_derniere_revision,
    date_prochaine_maintenance: item.date_prochaine_maintenance,
    date_prochaine_revision: item.date_prochaine_revision,
    notes: item.notes || '',
    photos: item.photos || [],
    historique_maintenance: item.historique_maintenance || [],
    champs_personnalises: item.champs_personnalises || {}
  });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Photo preview
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  // Maintenance
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [maintenanceType, setMaintenanceType] = useState<'entretien' | 'revision' | 'reparation'>('entretien');
  const [maintenanceDescription, setMaintenanceDescription] = useState('');
  const [maintenanceCost, setMaintenanceCost] = useState<number | undefined>();

  useEffect(() => {
    if (clubId) {
      loadData();
    }

    // Cleanup camera on unmount
    return () => {
      stopCamera();
    };
  }, [clubId]);

  const loadData = async () => {
    if (!clubId) return;

    try {
      const [typesData, locationsData] = await Promise.all([
        InventoryConfigService.getItemTypes(clubId),
        InventoryConfigService.getLocations(clubId)
      ]);

      setTypes(typesData);
      setLocations(locationsData);
    } catch (error) {
      console.error('Erreur chargement config:', error);
    }
  };

  // Auto-save handler for individual fields
  const handleFieldSave = async (field: string, value: any) => {
    if (isCreateMode || !clubId || !item.id) return; // Don't auto-save in create mode

    try {
      // Validate before saving
      if (field === 'numero_serie' && (!value || !value.trim())) {
        toast.error('Le numéro de série est obligatoire');
        return;
      } else if (field === 'typeId' && !value) {
        toast.error('Le type est obligatoire');
        return;
      } else if (field === 'valeur_achat') {
        const montant = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(montant) || montant < 0) {
          toast.error('La valeur d\'achat doit être un nombre positif');
          return;
        }
        value = montant;
      }

      // Save to Firestore
      await InventoryItemService.updateItem(clubId, item.id, { [field]: value });

      // Success feedback
      toast.success('✓ Sauvegardé', {
        duration: 1500,
        position: 'bottom-right'
      });
    } catch (error: any) {
      console.error(`Error saving ${field}:`, error);
      toast.error(error.message || 'Erreur lors de la sauvegarde');
    }
  };

  const handleCreate = async () => {
    if (!clubId) return;

    // Validation
    if (!formData.numero_serie || !formData.typeId) {
      toast.error('Numéro de série et type sont obligatoires');
      return;
    }

    setSaving(true);

    try {
      await InventoryItemService.createItem(clubId, formData as any);
      toast.success('Matériel créé');
      onSave();
    } catch (error: any) {
      console.error('Erreur création matériel:', error);
      toast.error(error.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!clubId || !item.id) return;

    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir désactiver le matériel "${item.numero_serie}" ?\n\n` +
      `Le matériel sera marqué comme hors service mais ses données seront conservées.`
    );

    if (!confirmed) return;

    try {
      await InventoryItemService.deleteItem(clubId, item.id);
      toast.success('Matériel désactivé');
      onSave();
    } catch (error: any) {
      console.error('Erreur suppression matériel:', error);
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const handleDateChange = (field: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const dateStr = e.target.value;
    const newValue = dateStr ? Timestamp.fromDate(new Date(dateStr)) : undefined;
    setFormData({ ...formData, [field]: newValue });

    // Auto-save the date field
    if (!isCreateMode) {
      handleFieldSave(field, newValue);
    }
  };

  const getDateValue = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return '';
    return new Date(timestamp.toDate()).toISOString().split('T')[0];
  };

  // ========================================
  // CAMERA & PHOTOS
  // ========================================

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' } // Caméra arrière sur mobile
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setCameraStream(stream);
      setCameraActive(true);
    } catch (error) {
      console.error('Erreur accès caméra:', error);
      toast.error('Impossible d\'accéder à la caméra');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !clubId || !item.id) return;

    try {
      // Créer un canvas pour capturer l'image
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        toast.error('Erreur lors de la capture');
        return;
      }

      ctx.drawImage(videoRef.current, 0, 0);

      // Convertir en blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error('Erreur lors de la capture');
          return;
        }

        setUploadingPhoto(true);

        // Créer un File depuis le blob
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });

        // Upload
        const photoUrl = await InventoryItemService.uploadPhoto(clubId, item.id, file);

        // Mettre à jour l'état local
        setFormData({
          ...formData,
          photos: [...(formData.photos || []), photoUrl]
        });

        toast.success('Photo ajoutée');
        setUploadingPhoto(false);
        stopCamera();
      }, 'image/jpeg', 0.9);
    } catch (error) {
      console.error('Erreur capture photo:', error);
      toast.error('Erreur lors de la capture');
      setUploadingPhoto(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clubId || !item.id) return;

    try {
      setUploadingPhoto(true);

      const photoUrl = await InventoryItemService.uploadPhoto(clubId, item.id, file);

      // Mettre à jour l'état local
      setFormData({
        ...formData,
        photos: [...(formData.photos || []), photoUrl]
      });

      toast.success('Photo ajoutée');
    } catch (error: any) {
      console.error('Erreur upload photo:', error);
      toast.error(error.message || 'Erreur lors de l\'upload');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (photoUrl: string, index: number) => {
    if (!clubId || !item.id) return;

    const confirmed = window.confirm('Supprimer cette photo ?');
    if (!confirmed) return;

    try {
      await InventoryItemService.deletePhoto(clubId, item.id, photoUrl);

      // Mettre à jour l'état local
      const updatedPhotos = (formData.photos || []).filter((_, i) => i !== index);
      setFormData({ ...formData, photos: updatedPhotos });

      toast.success('Photo supprimée');
    } catch (error: any) {
      console.error('Erreur suppression photo:', error);
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  // ========================================
  // MAINTENANCE
  // ========================================

  const handleAddMaintenance = async () => {
    if (!clubId || !item.id || !maintenanceDescription.trim()) {
      toast.error('Veuillez remplir la description');
      return;
    }

    try {
      const record: Omit<MaintenanceRecord, 'id' | 'date'> = {
        type: maintenanceType,
        description: maintenanceDescription,
        cost: maintenanceCost
      };

      await InventoryItemService.addMaintenanceRecord(clubId, item.id, record);

      // Recharger les données
      const updatedItem = await InventoryItemService.getItemById(clubId, item.id);
      if (updatedItem) {
        setFormData({
          ...formData,
          historique_maintenance: updatedItem.historique_maintenance,
          date_derniere_maintenance: updatedItem.date_derniere_maintenance,
          date_derniere_revision: updatedItem.date_derniere_revision
        });
      }

      toast.success('Maintenance enregistrée');
      setShowMaintenanceForm(false);
      setMaintenanceDescription('');
      setMaintenanceCost(undefined);
    } catch (error: any) {
      console.error('Erreur ajout maintenance:', error);
      toast.error(error.message || 'Erreur lors de l\'ajout');
    }
  };

  const selectedType = types.find(t => t.id === formData.typeId);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-in Drawer Panel */}
      <div className="fixed right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col">
        {/* Compact Header */}
        <div className="flex-shrink-0 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 h-10 w-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                  {isCreateMode ? 'Nouveau matériel' : item.numero_serie}
                </h2>
                {!isCreateMode && selectedType && (
                  <p className="text-xs text-gray-500 dark:text-dark-text-secondary">{selectedType.nom}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isCreateMode && item.statut !== 'hors_service' && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  title="Désactiver ce matériel"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Désactiver</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-md transition-colors"
                title="Fermer"
              >
                <X className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Informations générales */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4">
                Informations générales
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Numéro de série *
                  </label>
                  <input
                    type="text"
                    value={formData.numero_serie || ''}
                    onChange={(e) => setFormData({ ...formData, numero_serie: e.target.value })}
                    onBlur={(e) => handleFieldSave('numero_serie', e.target.value)}
                    disabled={isCreateMode}
                    placeholder="12345ABC"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Type *
                  </label>
                  <select
                    value={formData.typeId}
                    onChange={(e) => {
                      setFormData({ ...formData, typeId: e.target.value });
                      if (!isCreateMode) handleFieldSave('typeId', e.target.value);
                    }}
                    disabled={isCreateMode}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                  >
                    <option value="">Sélectionner un type</option>
                    {types.map(type => (
                      <option key={type.id} value={type.id}>{type.nom}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Nom (optionnel)
                  </label>
                  <input
                    type="text"
                    value={formData.nom || ''}
                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                    onBlur={(e) => handleFieldSave('nom', e.target.value)}
                    disabled={isCreateMode}
                    placeholder="Scubapro MK25"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Emplacement
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <select
                      value={formData.emplacementId}
                      onChange={(e) => {
                        setFormData({ ...formData, emplacementId: e.target.value });
                        if (!isCreateMode) handleFieldSave('emplacementId', e.target.value);
                      }}
                      disabled={isCreateMode}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                    >
                      <option value="">Sélectionner un emplacement</option>
                      {locations.filter(l => l.actif).map(location => (
                        <option key={location.id} value={location.id}>{location.nom}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Statut
                  </label>
                  <select
                    value={formData.statut}
                    onChange={(e) => {
                      setFormData({ ...formData, statut: e.target.value as any });
                      if (!isCreateMode) handleFieldSave('statut', e.target.value);
                    }}
                    disabled={isCreateMode}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                  >
                    <option value="disponible">Disponible</option>
                    <option value="prete">Prêté</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="hors_service">Hors service</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Valeur d'achat (€)
                  </label>
                  <input
                    type="number"
                    value={formData.valeur_achat || 0}
                    onChange={(e) => setFormData({ ...formData, valeur_achat: parseFloat(e.target.value) || 0 })}
                    onBlur={(e) => handleFieldSave('valeur_achat', parseFloat(e.target.value) || 0)}
                    disabled={isCreateMode}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Date d'achat
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="date"
                      value={getDateValue(formData.date_achat)}
                      onChange={(e) => handleDateChange('date_achat', e)}
                      disabled={isCreateMode}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Date de mise en service
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="date"
                      value={getDateValue(formData.date_mise_service)}
                      onChange={(e) => handleDateChange('date_mise_service', e)}
                      disabled={isCreateMode}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  onBlur={(e) => handleFieldSave('notes', e.target.value)}
                  disabled={isCreateMode}
                  rows={3}
                  placeholder="Notes sur l'état, l'historique, etc."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:bg-gray-50 dark:disabled:bg-dark-bg-tertiary"
                />
              </div>
            </div>

            {/* Photos (only if not creating) */}
            {!isCreateMode && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4">
                  Photos
                </h3>

                {/* Camera View */}
                {cameraActive ? (
                  <div className="space-y-4">
                    <video
                      ref={videoRef}
                      className="w-full rounded-lg bg-black"
                      autoPlay
                      playsInline
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={capturePhoto}
                        disabled={uploadingPhoto}
                        className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Capturer
                      </button>
                      <button
                        onClick={stopCamera}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-primary border border-gray-300 dark:border-dark-border rounded-md hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Action Buttons */}
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={startCamera}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-primary border border-gray-300 dark:border-dark-border rounded-md hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Prendre une photo
                      </button>

                      <label className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-primary border border-gray-300 dark:border-dark-border rounded-md hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary cursor-pointer">
                        <Upload className="h-4 w-4 mr-2" />
                        Importer une photo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          disabled={uploadingPhoto}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Photo Grid */}
                    {formData.photos && formData.photos.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {formData.photos.map((photoUrl, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={photoUrl}
                              alt={`Photo ${index + 1}`}
                              className="w-full h-32 object-cover rounded-lg cursor-pointer"
                              onClick={() => setSelectedPhotoIndex(index)}
                            />
                            <button
                              onClick={() => handleDeletePhoto(photoUrl, index)}
                              className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500 dark:text-dark-text-secondary">
                        <ImageIcon className="mx-auto h-12 w-12 mb-2" />
                        <p>Aucune photo</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Maintenance (only if not creating) */}
            {!isCreateMode && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
                    Maintenance
                  </h3>
                  <button
                    onClick={() => setShowMaintenanceForm(!showMaintenanceForm)}
                    className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30"
                  >
                    <Wrench className="h-4 w-4 mr-1" />
                    Ajouter
                  </button>
                </div>

                {/* Maintenance Form */}
                {showMaintenanceForm && (
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 mb-4 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                        Type
                      </label>
                      <select
                        value={maintenanceType}
                        onChange={(e) => setMaintenanceType(e.target.value as any)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                      >
                        <option value="entretien">Entretien</option>
                        <option value="revision">Révision</option>
                        <option value="reparation">Réparation</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                        Description
                      </label>
                      <textarea
                        value={maintenanceDescription}
                        onChange={(e) => setMaintenanceDescription(e.target.value)}
                        rows={2}
                        placeholder="Détails de l'intervention..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                        Coût (€, optionnel)
                      </label>
                      <input
                        type="number"
                        value={maintenanceCost || ''}
                        onChange={(e) => setMaintenanceCost(e.target.value ? parseFloat(e.target.value) : undefined)}
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleAddMaintenance}
                        className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                      >
                        Enregistrer
                      </button>
                      <button
                        onClick={() => {
                          setShowMaintenanceForm(false);
                          setMaintenanceDescription('');
                          setMaintenanceCost(undefined);
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-primary border border-gray-300 dark:border-dark-border rounded-md hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {/* Maintenance Dates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                      Dernière maintenance
                    </label>
                    <input
                      type="date"
                      value={getDateValue(formData.date_derniere_maintenance)}
                      onChange={(e) => handleDateChange('date_derniere_maintenance', e)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                      Prochaine maintenance
                    </label>
                    <input
                      type="date"
                      value={getDateValue(formData.date_prochaine_maintenance)}
                      onChange={(e) => handleDateChange('date_prochaine_maintenance', e)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                      Dernière révision
                    </label>
                    <input
                      type="date"
                      value={getDateValue(formData.date_derniere_revision)}
                      onChange={(e) => handleDateChange('date_derniere_revision', e)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                      Prochaine révision
                    </label>
                    <input
                      type="date"
                      value={getDateValue(formData.date_prochaine_revision)}
                      onChange={(e) => handleDateChange('date_prochaine_revision', e)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                    />
                  </div>
                </div>

                {/* Maintenance History */}
                {formData.historique_maintenance && formData.historique_maintenance.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                      Historique
                    </h4>
                    <div className="space-y-2">
                      {formData.historique_maintenance.map((record) => (
                        <div
                          key={record.id}
                          className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={cn(
                                  'px-2 py-0.5 text-xs font-medium rounded',
                                  record.type === 'entretien' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                                  record.type === 'revision' && 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
                                  record.type === 'reparation' && 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                                )}>
                                  {record.type}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-dark-text-secondary">
                                  {new Date(record.date.toDate()).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-sm text-gray-900 dark:text-dark-text-primary">
                                {record.description}
                              </p>
                            </div>
                            {record.cost !== undefined && (
                              <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary ml-4">
                                {record.cost.toFixed(2)} €
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer - Only show Create button in create mode */}
        {isCreateMode && (
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-dark-border px-6 py-4">
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-primary border border-gray-300 dark:border-dark-border rounded-md hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !formData.numero_serie || !formData.typeId}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Package className="h-4 w-4 mr-2" />
                Créer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Photo Lightbox */}
      {selectedPhotoIndex !== null && formData.photos && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedPhotoIndex(null)}
        >
          <img
            src={formData.photos[selectedPhotoIndex]}
            alt={`Photo ${selectedPhotoIndex + 1}`}
            className="max-w-full max-h-full object-contain"
          />
          <button
            onClick={() => setSelectedPhotoIndex(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 text-white rounded-full hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </>
  );
}
