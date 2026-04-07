/**
 * FournisseurDetailPanel - Detail/Edit panel voor een leverancier
 */

import { useState, useEffect } from 'react';
import { Fournisseur } from '@/types';
import { CreateFournisseurDTO, UpdateFournisseurDTO } from '@/services/fournisseurService';
import {
  X,
  Building2,
  Save,
  Trash2,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  FileText,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { cn } from '@/utils/utils';

interface FournisseurDetailPanelProps {
  fournisseur: Fournisseur | null;
  onClose: () => void;
  onCreate: (data: CreateFournisseurDTO) => Promise<void>;
  onUpdate: (id: string, data: UpdateFournisseurDTO) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function FournisseurDetailPanel({
  fournisseur,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: FournisseurDetailPanelProps) {
  const isNew = !fournisseur;

  // Form state
  const [nom, setNom] = useState('');
  const [iban, setIban] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [adresse, setAdresse] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [localite, setLocalite] = useState('');
  const [pays, setPays] = useState('Belgique');
  const [numeroTva, setNumeroTva] = useState('');
  const [notes, setNotes] = useState('');
  const [actif, setActif] = useState(true);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form when fournisseur changes
  useEffect(() => {
    if (fournisseur) {
      setNom(fournisseur.nom || '');
      setIban(formatIBAN(fournisseur.iban || ''));
      setEmail(fournisseur.email || '');
      setTelephone(fournisseur.telephone || '');
      setAdresse(fournisseur.adresse || '');
      setCodePostal(fournisseur.code_postal || '');
      setLocalite(fournisseur.localite || '');
      setPays(fournisseur.pays || 'Belgique');
      setNumeroTva(fournisseur.numero_tva || '');
      setNotes(fournisseur.notes || '');
      setActif(fournisseur.actif);
    } else {
      // Reset form for new
      setNom('');
      setIban('');
      setEmail('');
      setTelephone('');
      setAdresse('');
      setCodePostal('');
      setLocalite('');
      setPays('Belgique');
      setNumeroTva('');
      setNotes('');
      setActif(true);
    }
    setErrors({});
  }, [fournisseur]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!nom.trim()) {
      newErrors.nom = 'Le nom est obligatoire';
    }

    const cleanIban = iban.replace(/\s/g, '').toUpperCase();
    if (!cleanIban) {
      newErrors.iban = 'L\'IBAN est obligatoire';
    } else if (cleanIban.length < 15 || cleanIban.length > 34) {
      newErrors.iban = 'L\'IBAN doit contenir entre 15 et 34 caractères';
    }

    if (email && !email.includes('@')) {
      newErrors.email = 'Email invalide';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const cleanIban = iban.replace(/\s/g, '').toUpperCase();

      if (isNew) {
        await onCreate({
          nom: nom.trim(),
          iban: cleanIban,
          email: email.trim() || undefined,
          telephone: telephone.trim() || undefined,
          adresse: adresse.trim() || undefined,
          code_postal: codePostal.trim() || undefined,
          localite: localite.trim() || undefined,
          pays: pays.trim() || undefined,
          numero_tva: numeroTva.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      } else {
        await onUpdate(fournisseur!.id, {
          nom: nom.trim(),
          iban: cleanIban,
          email: email.trim() || undefined,
          telephone: telephone.trim() || undefined,
          adresse: adresse.trim() || undefined,
          code_postal: codePostal.trim() || undefined,
          localite: localite.trim() || undefined,
          pays: pays.trim() || undefined,
          numero_tva: numeroTva.trim() || undefined,
          notes: notes.trim() || undefined,
          actif,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (fournisseur) {
      await onDelete(fournisseur.id);
    }
  };

  // Format IBAN as user types
  const handleIbanChange = (value: string) => {
    // Remove all non-alphanumeric characters
    const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    // Format with spaces every 4 characters
    const formatted = clean.replace(/(.{4})/g, '$1 ').trim();
    setIban(formatted);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[500px] bg-white dark:bg-dark-bg-secondary shadow-xl border-l border-gray-200 dark:border-dark-border z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border bg-calypso-blue text-white">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5" />
          <h2 className="font-semibold">
            {isNew ? 'Nouveau Fournisseur' : fournisseur?.nom}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/20 rounded"
          aria-label="Sluiten"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Nom */}
        <div>
          <label htmlFor="fournisseur-nom-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
            Nom *
          </label>
          <input
            id="fournisseur-nom-input"
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className={cn(
              'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary',
              errors.nom ? 'border-red-500' : 'border-gray-300 dark:border-dark-border'
            )}
            placeholder="Nom de l'entreprise"
          />
          {errors.nom && (
            <p role="alert" className="text-red-500 text-sm mt-1">{errors.nom}</p>
          )}
        </div>

        {/* IBAN */}
        <div>
          <label htmlFor="fournisseur-iban-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              IBAN *
            </div>
          </label>
          <input
            id="fournisseur-iban-input"
            type="text"
            value={iban}
            onChange={(e) => handleIbanChange(e.target.value)}
            className={cn(
              'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent font-mono dark:bg-dark-bg-tertiary dark:text-dark-text-primary',
              errors.iban ? 'border-red-500' : 'border-gray-300 dark:border-dark-border'
            )}
            placeholder="BE00 0000 0000 0000"
          />
          {errors.iban && (
            <p role="alert" className="text-red-500 text-sm mt-1">{errors.iban}</p>
          )}
        </div>

        {/* Email & Telephone */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="fournisseur-email-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </div>
            </label>
            <input
              id="fournisseur-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(
                'w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary',
                errors.email ? 'border-red-500' : 'border-gray-300 dark:border-dark-border'
              )}
              placeholder="contact@example.com"
            />
            {errors.email && (
              <p role="alert" className="text-red-500 text-sm mt-1">{errors.email}</p>
            )}
          </div>
          <div>
            <label htmlFor="fournisseur-telephone-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Téléphone
              </div>
            </label>
            <input
              id="fournisseur-telephone-input"
              type="tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
              placeholder="+32 ..."
            />
          </div>
        </div>

        {/* Address */}
        <div>
          <label htmlFor="fournisseur-adresse-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Adresse
            </div>
          </label>
          <input
            id="fournisseur-adresse-input"
            type="text"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
            placeholder="Rue et numéro"
          />
        </div>

        {/* City & Postal Code */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="fournisseur-codePostal-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Code postal
            </label>
            <input
              id="fournisseur-codePostal-input"
              type="text"
              value={codePostal}
              onChange={(e) => setCodePostal(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
              placeholder="1000"
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="fournisseur-localite-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Localité
            </label>
            <input
              id="fournisseur-localite-input"
              type="text"
              value={localite}
              onChange={(e) => setLocalite(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
              placeholder="Bruxelles"
            />
          </div>
        </div>

        {/* Country */}
        <div>
          <label htmlFor="fournisseur-pays-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
            Pays
          </label>
          <input
            id="fournisseur-pays-input"
            type="text"
            value={pays}
            onChange={(e) => setPays(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
            placeholder="Belgique"
          />
        </div>

        {/* VAT Number */}
        <div>
          <label htmlFor="fournisseur-numeroTva-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Numéro de TVA
            </div>
          </label>
          <input
            id="fournisseur-numeroTva-input"
            type="text"
            value={numeroTva}
            onChange={(e) => setNumeroTva(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent font-mono dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
            placeholder="BE0123456789"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent resize-none dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
            placeholder="Notes internes..."
          />
        </div>

        {/* Active toggle (only for existing) */}
        {!isNew && (
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
            <div>
              <p className="font-medium text-gray-900 dark:text-dark-text-primary">Statut</p>
              <p className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                {actif ? 'Actif - visible dans les listes' : 'Inactif - masqué des listes'}
              </p>
            </div>
            <button
              onClick={() => setActif(!actif)}
              className={cn(
                'p-2 rounded-lg transition',
                actif ? 'text-green-600' : 'text-gray-400 dark:text-dark-text-muted'
              )}
            >
              {actif ? (
                <ToggleRight className="w-8 h-8" />
              ) : (
                <ToggleLeft className="w-8 h-8" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
        <div className="flex items-center justify-between">
          {!isNew && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
            >
              <Trash2 className="w-4 h-4" />
              Supprimer
            </button>
          )}
          <div className={cn('flex gap-2', isNew && 'ml-auto')}>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary rounded-lg transition"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Format IBAN for display (groups of 4)
 */
function formatIBAN(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}
