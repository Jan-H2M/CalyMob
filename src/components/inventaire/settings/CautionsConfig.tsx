import React, { useState, useEffect } from 'react';
import { Save, Euro, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { InventoryConfigService } from '@/services/inventoryConfigService';
import { CautionRule } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

const DEFAULT_CAUTION_RULES: CautionRule[] = [
  {
    id: 'kit_base',
    nom: 'Kit Base',
    description: 'Régulateur + BC + Lampe',
    montant: 300,
    pourcentage_remboursement: {
      excellent: 100,
      bon: 100,
      correct: 80,
      mauvais: 50,
      perte: 0
    },
    mode_validation: 'manuel',
    delai_remboursement: 'fin_mois'
  },
  {
    id: 'kit_complet',
    nom: 'Kit Complet',
    description: 'Régulateur + BC + Lampe + Ordinateur',
    montant: 450,
    pourcentage_remboursement: {
      excellent: 100,
      bon: 100,
      correct: 80,
      mauvais: 50,
      perte: 0
    },
    mode_validation: 'manuel',
    delai_remboursement: 'fin_mois'
  },
  {
    id: 'lampe',
    nom: 'Lampe uniquement',
    description: 'Lampe de plongée',
    montant: 100,
    pourcentage_remboursement: {
      excellent: 100,
      bon: 100,
      correct: 80,
      mauvais: 50,
      perte: 0
    },
    mode_validation: 'manuel',
    delai_remboursement: 'immediat'
  },
  {
    id: 'custom',
    nom: 'Montant personnalisé',
    description: 'Pour autres combinaisons',
    montant: 0,
    pourcentage_remboursement: {
      excellent: 100,
      bon: 100,
      correct: 80,
      mauvais: 50,
      perte: 0
    },
    mode_validation: 'manuel',
    delai_remboursement: 'fin_mois'
  }
];

export function CautionsConfig() {
  const { clubId } = useAuth();
  const [rules, setRules] = useState<CautionRule[]>(DEFAULT_CAUTION_RULES);
  const [loading, setLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadRules();
  }, [clubId]);

  const loadRules = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const rulesData = await InventoryConfigService.getCautionRules(clubId);

      if (rulesData.length > 0) {
        setRules(rulesData);
      } else {
        // Use defaults if no rules exist
        setRules(DEFAULT_CAUTION_RULES);
      }
    } catch (error) {
      console.error('Erreur chargement règles caution:', error);
      toast.error('Erreur lors du chargement des règles');
      setRules(DEFAULT_CAUTION_RULES);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!clubId) return;

    try {
      await InventoryConfigService.updateCautionRules(clubId, rules);
      toast.success('Règles de caution sauvegardées');
      setHasChanges(false);
    } catch (error) {
      console.error('Erreur sauvegarde règles:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const updateRule = (ruleId: string, updates: Partial<CautionRule>) => {
    setRules(rules.map(rule =>
      rule.id === ruleId ? { ...rule, ...updates } : rule
    ));
    setHasChanges(true);
  };

  const updateRemboursement = (ruleId: string, etat: keyof CautionRule['pourcentage_remboursement'], value: number) => {
    setRules(rules.map(rule =>
      rule.id === ruleId
        ? {
            ...rule,
            pourcentage_remboursement: {
              ...rule.pourcentage_remboursement,
              [etat]: value
            }
          }
        : rule
    ));
    setHasChanges(true);
  };

  const handleAddCaution = () => {
    const newId = `caution_${Date.now()}`;
    const newRule: CautionRule = {
      id: newId,
      nom: 'Nouvelle caution',
      description: 'Description',
      montant: 0,
      pourcentage_remboursement: {
        excellent: 100,
        bon: 100,
        correct: 80,
        mauvais: 50,
        perte: 0
      },
      mode_validation: 'manuel',
      delai_remboursement: 'fin_mois'
    };
    setRules([...rules, newRule]);
    setHasChanges(true);
    toast.success('Nouvelle caution ajoutée');
  };

  const handleDeleteCaution = async (ruleId: string) => {
    if (!clubId) return;

    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer la caution "${rule.nom}" ?\n\nCette action est irréversible.`
    );

    if (!confirmed) return;

    try {
      // Supprimer de Firestore
      await InventoryConfigService.deleteCautionRule(clubId, ruleId);

      // Supprimer de l'état local
      setRules(rules.filter(r => r.id !== ruleId));
      setHasChanges(false);

      toast.success(`Caution "${rule.nom}" supprimée`);
    } catch (error) {
      console.error('Erreur suppression caution:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Règles de Caution</h2>
          <p className="mt-1 text-sm text-gray-500">
            Configurez les montants de caution et les règles de remboursement
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAddCaution}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Plus className="h-4 w-4 mr-2" />
            Ajouter une caution
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4 mr-2" />
            Sauvegarder
          </button>
        </div>
      </div>

      {/* Info Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">
              Comptabilisation des cautions
            </h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                Les cautions sont traitées comme des <strong>opérations neutres</strong> (ni revenu ni dépense).
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Elles sont filtrées séparément dans les rapports comptables</li>
                <li>Catégorie spéciale : <code className="px-1 py-0.5 bg-blue-100 rounded">caution_materiel</code> (sans code PCMN)</li>
                <li>Le remboursement partiel (état "mauvais") est enregistré comme charge (dégât matériel)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Caution Rules */}
      <div className="space-y-4">
        {rules.map((rule) => (
          <div key={rule.id} className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="space-y-4">
              {/* Rule Header with Delete Button */}
              <div className="flex items-start justify-between">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nom
                    </label>
                    <input
                      type="text"
                      value={rule.nom}
                      onChange={(e) => updateRule(rule.id, { nom: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="Ex: Kit Base, Kit Complet..."
                    />
                    <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">
                      Description
                    </label>
                    <input
                      type="text"
                      value={rule.description}
                      onChange={(e) => updateRule(rule.id, { description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="Ex: Régulateur + BC + Lampe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Montant de la caution
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Euro className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="number"
                        value={rule.montant}
                        onChange={(e) => updateRule(rule.id, { montant: parseFloat(e.target.value) || 0 })}
                        min="0"
                        step="10"
                        className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteCaution(rule.id)}
                  className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-md"
                  title="Supprimer cette caution"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>

              {/* Refund Percentages */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Pourcentage de remboursement selon l'état du matériel
                </label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {Object.entries(rule.pourcentage_remboursement).map(([etat, pourcentage]) => (
                    <div key={etat}>
                      <label className="block text-xs text-gray-600 mb-1 capitalize">
                        {etat === 'excellent' && '⭐ Excellent'}
                        {etat === 'bon' && '✓ Bon'}
                        {etat === 'correct' && '~ Correct'}
                        {etat === 'mauvais' && '⚠ Mauvais'}
                        {etat === 'perte' && '✗ Perte'}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={pourcentage}
                          onChange={(e) => updateRemboursement(
                            rule.id,
                            etat as keyof CautionRule['pourcentage_remboursement'],
                            parseInt(e.target.value) || 0
                          )}
                          min="0"
                          max="100"
                          className="w-full px-2 py-1.5 pr-6 text-sm border border-gray-300 rounded-md"
                        />
                        <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mode de validation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mode de validation
                  </label>
                  <select
                    value={rule.mode_validation}
                    onChange={(e) => updateRule(rule.id, { mode_validation: e.target.value as 'manuel' | 'auto' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="manuel">Manuel</option>
                    <option value="auto">Automatique</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {rule.mode_validation === 'manuel'
                      ? 'Le remboursement doit être validé manuellement'
                      : 'Le remboursement est automatique après inspection'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Délai de remboursement
                  </label>
                  <select
                    value={rule.delai_remboursement}
                    onChange={(e) => updateRule(rule.id, { delai_remboursement: e.target.value as CautionRule['delai_remboursement'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="immediat">Immédiat</option>
                    <option value="fin_semaine">Fin de semaine</option>
                    <option value="fin_mois">Fin de mois</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {rule.delai_remboursement === 'immediat' && 'Remboursement le jour même du retour'}
                    {rule.delai_remboursement === 'fin_semaine' && 'Remboursement en fin de semaine'}
                    {rule.delai_remboursement === 'fin_mois' && 'Remboursement en fin de mois'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Example Calculations */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Exemples de remboursement</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {rules.filter(r => r.id !== 'custom').map((rule) => (
            <div key={rule.id} className="bg-white p-4 rounded border border-gray-200">
              <h4 className="text-sm font-medium text-gray-900 mb-2">{rule.nom}</h4>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Excellent:</span>
                  <span className="font-medium">{(rule.montant * rule.pourcentage_remboursement.excellent / 100).toFixed(2)}€</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Bon:</span>
                  <span className="font-medium">{(rule.montant * rule.pourcentage_remboursement.bon / 100).toFixed(2)}€</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Correct:</span>
                  <span className="font-medium">{(rule.montant * rule.pourcentage_remboursement.correct / 100).toFixed(2)}€</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Mauvais:</span>
                  <span className="font-medium">{(rule.montant * rule.pourcentage_remboursement.mauvais / 100).toFixed(2)}€</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Perte:</span>
                  <span className="font-medium">{(rule.montant * rule.pourcentage_remboursement.perte / 100).toFixed(2)}€</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
