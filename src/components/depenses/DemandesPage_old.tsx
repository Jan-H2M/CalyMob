import React, { useState, useRef } from 'react';
import { 
  Plus, 
  Clock, 
  CheckCircle, 
  XCircle,
  Upload,
  FileText,
  Euro,
  Link2,
  Users,
  FileSpreadsheet,
  ArrowRight,
  TrendingDown,
  Check
} from 'lucide-react';
import { formatMontant, formatDate, cn, STATUS_COLORS } from '@/utils/utils';
import { TransactionBancaire, DemandeRemboursement, MatchedEntity } from '@/types';
import { VPDiveReconciliationModal } from '../banque/VPDiveReconciliationModal';
import { ReconciliationService } from '@/services/reconciliationService';
import toast from 'react-hot-toast';

// Transactions de dépense pour démonstration
const demoExpenseTransactions: TransactionBancaire[] = [
  {
    id: 'tx1',
    numero_sequence: '2025-005',
    date_execution: new Date('2024-03-21'),
    date_valeur: new Date('2024-03-21'),
    montant: -45.50,
    devise: 'EUR',
    numero_compte: 'BE26210016070629',
    type_transaction: 'Virement en euros',
    contrepartie_iban: 'BE12345678901234',
    contrepartie_nom: 'DUPONT JEAN',
    communication: 'Remboursement chlore piscine',
    statut: 'accepte',
    type: 'expense',
    reconcilie: false,
    hash_dedup: 'exp001',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 'tx2',
    numero_sequence: '2025-006',
    date_execution: new Date('2024-03-19'),
    date_valeur: new Date('2024-03-19'),
    montant: -120.00,
    devise: 'EUR',
    numero_compte: 'BE26210016070629',
    type_transaction: 'Virement en euros',
    contrepartie_iban: 'BE98765432109876',
    contrepartie_nom: 'MARTIN MARIE',
    communication: 'Location van Zélande',
    statut: 'accepte',
    type: 'expense',
    reconcilie: false,
    hash_dedup: 'exp002',
    created_at: new Date(),
    updated_at: new Date()
  },
  {
    id: 'tx3',
    numero_sequence: '2025-007',
    date_execution: new Date('2024-03-17'),
    date_valeur: new Date('2024-03-17'),
    montant: -35.00,
    devise: 'EUR',
    numero_compte: 'BE26210016070629',
    type_transaction: 'Virement en euros',
    contrepartie_iban: 'BE55555555555555',
    contrepartie_nom: 'DURAND PAUL',
    communication: 'Essence compresseur',
    statut: 'accepte',
    type: 'expense',
    reconcilie: true,
    expense_claim_id: '3',
    matched_entities: [
      {
        entity_type: 'expense_claim',
        entity_id: '3',
        entity_name: 'Essence pour compresseur',
        confidence: 95,
        matched_at: new Date('2024-03-17'),
        matched_by: 'auto'
      }
    ],
    hash_dedup: 'exp003',
    created_at: new Date(),
    updated_at: new Date()
  }
];

const demandes: DemandeRemboursement[] = [
  {
    id: '1',
    demandeur: 'Jean Dupont',
    demandeur_id: 'user1',
    montant: 45.50,
    description: 'Achat matériel piscine - chlore et pH',
    statut: 'soumis' as const,
    date_soumission: new Date('2024-03-20'),
    urls_justificatifs: ['facture1.pdf'],
    evenement_titre: null
  },
  {
    id: '2',
    demandeur: 'Marie Martin',
    demandeur_id: 'user2',
    montant: 120.00,
    description: 'Location van pour sortie Zélande',
    statut: 'approuve' as const,
    date_soumission: new Date('2024-03-18'),
    date_approbation: new Date('2024-03-19'),
    approuve_par: 'Trésorier',
    urls_justificatifs: ['contrat_location.pdf', 'facture_essence.pdf'],
    evenement_titre: 'Sortie Zélande'
  },
  {
    id: '3',
    demandeur: 'Paul Durand',
    demandeur_id: 'user3',
    montant: 35.00,
    description: 'Essence pour compresseur',
    statut: 'rembourse' as const,
    date_soumission: new Date('2024-03-15'),
    date_approbation: new Date('2024-03-16'),
    date_remboursement: new Date('2024-03-17'),
    approuve_par: 'Trésorier',
    urls_justificatifs: ['ticket_essence.jpg'],
    evenement_titre: null
  }
];

export function DemandesPage() {
  const [showNewForm, setShowNewForm] = useState(false);
  const [filterStatut, setFilterStatut] = useState<string>('');
  const [activeView, setActiveView] = useState<'demandes' | 'matching'>('demandes');
  const [selectedDemande, setSelectedDemande] = useState<DemandeRemboursement | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionBancaire | null>(null);
  const [showVPDiveModal, setShowVPDiveModal] = useState(false);
  const [expenseTransactions, setExpenseTransactions] = useState<TransactionBancaire[]>(demoExpenseTransactions);
  const [allDemandes, setAllDemandes] = useState<DemandeRemboursement[]>(demandes);

  const filteredDemandes = filterStatut 
    ? allDemandes.filter(d => d.statut === filterStatut)
    : allDemandes;
  
  const unmatchedTransactions = expenseTransactions.filter(t => !t.reconcilie && !t.expense_claim_id);
  const matchedTransactions = expenseTransactions.filter(t => t.reconcilie || t.expense_claim_id);

  const getStatusIcon = (statut: string) => {
    switch(statut) {
      case 'soumis': return <Clock className="h-4 w-4" />;
      case 'approuve': return <CheckCircle className="h-4 w-4" />;
      case 'rembourse': return <Euro className="h-4 w-4" />;
      case 'refuse': return <XCircle className="h-4 w-4" />;
      default: return null;
    }
  };

  const getStatusLabel = (statut: string) => {
    switch(statut) {
      case 'soumis': return 'En attente';
      case 'approuve': return 'Approuvé';
      case 'rembourse': return 'Remboursé';
      case 'refuse': return 'Refusé';
      default: return statut;
    }
  };

  // Lier une transaction à une demande
  const handleLinkTransaction = async (transaction: TransactionBancaire, demande: DemandeRemboursement) => {
    const updatedTransaction: TransactionBancaire = {
      ...transaction,
      expense_claim_id: demande.id,
      reconcilie: true,
      matched_entities: [
        {
          entity_type: 'expense_claim',
          entity_id: demande.id,
          entity_name: demande.description,
          confidence: 100,
          matched_at: new Date(),
          matched_by: 'manual'
        }
      ]
    };

    setExpenseTransactions(prev => 
      prev.map(t => t.id === transaction.id ? updatedTransaction : t)
    );

    // Mettre à jour la demande
    setAllDemandes(prev =>
      prev.map(d => d.id === demande.id 
        ? { ...d, statut: 'rembourse' as const, transaction_remboursement_id: transaction.id, date_remboursement: new Date() }
        : d
      )
    );

    toast.success(`Transaction liée à la demande "${demande.description}"`);
    setSelectedTransaction(null);
    setSelectedDemande(null);
  };

  // Essayer une réconciliation automatique
  const handleAutoMatch = async () => {
    const results = await ReconciliationService.performAutoReconciliation(
      expenseTransactions,
      undefined,
      undefined,
      allDemandes.filter(d => d.statut === 'approuve')
    );

    if (results.autoReconciled.length > 0) {
      // Appliquer les correspondances automatiques
      results.autoReconciled.forEach(match => {
        const transaction = expenseTransactions.find(t => t.id === match.transaction_id);
        const demande = allDemandes.find(d => d.id === match.matched_with.id);
        
        if (transaction && demande) {
          handleLinkTransaction(transaction, demande);
        }
      });

      toast.success(`${results.autoReconciled.length} correspondances automatiques trouvées`);
    } else {
      toast.info('Aucune correspondance automatique trouvée');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Demandes de remboursement</h1>
          <p className="text-gray-600 dark:text-dark-text-secondary mt-1">Gérez les notes de frais et remboursements</p>
        </div>
        <button 
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nouvelle demande
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setFilterStatut('')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              filterStatut === '' 
                ? "bg-calypso-blue text-white" 
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            )}
          >
            Toutes ({demandes.length})
          </button>
          <button
            onClick={() => setFilterStatut('soumis')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              filterStatut === 'soumis' 
                ? "bg-blue-600 text-white" 
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            )}
          >
            En attente ({demandes.filter(d => d.statut === 'soumis').length})
          </button>
          <button
            onClick={() => setFilterStatut('approuve')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              filterStatut === 'approuve' 
                ? "bg-green-600 text-white" 
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            )}
          >
            Approuvées ({demandes.filter(d => d.statut === 'approuve').length})
          </button>
          <button
            onClick={() => setFilterStatut('rembourse')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              filterStatut === 'rembourse' 
                ? "bg-gray-600 text-white" 
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            )}
          >
            Remboursées ({demandes.filter(d => d.statut === 'rembourse').length})
          </button>
        </div>
      </div>

      {/* Liste des demandes */}
      <div className="space-y-4">
        {filteredDemandes.map((demande) => (
          <div key={demande.id} className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">{demande.demandeur}</h3>
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full",
                    STATUS_COLORS[demande.statut]
                  )}>
                    {getStatusIcon(demande.statut)}
                    {getStatusLabel(demande.statut)}
                  </span>
                  {demande.evenement_titre && (
                    <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                      {demande.evenement_titre}
                    </span>
                  )}
                </div>
                
                <p className="text-gray-700 dark:text-dark-text-primary mb-3">{demande.description}</p>
                
                <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-dark-text-muted">
                  <span>Soumis le {formatDate(demande.date_soumission)}</span>
                  {demande.date_approbation && (
                    <span>Approuvé le {formatDate(demande.date_approbation)}</span>
                  )}
                  {demande.date_remboursement && (
                    <span>Remboursé le {formatDate(demande.date_remboursement)}</span>
                  )}
                </div>
                
                {demande.urls_justificatifs.length > 0 && (
                  <div className="flex items-center gap-2 mt-3">
                    <FileText className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                    <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
                      {demande.urls_justificatifs.length} justificatif{demande.urls_justificatifs.length > 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="text-right ml-6">
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{formatMontant(demande.montant)}</p>
                
                {demande.statut === 'soumis' && (
                  <div className="flex gap-2 mt-3">
                    <button className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                      Approuver
                    </button>
                    <button className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                      Refuser
                    </button>
                  </div>
                )}
                
                {demande.statut === 'approuve' && (
                  <button className="mt-3 px-3 py-1.5 text-sm bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors">
                    Marquer comme remboursé
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Formulaire nouvelle demande (modal) */}
      {showNewForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary mb-4">Nouvelle demande de remboursement</h2>
            
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Description
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  rows={3}
                  placeholder="Décrivez la dépense..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Montant
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                    placeholder="0.00"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-dark-text-muted">€</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Événement (optionnel)
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent">
                  <option value="">Aucun</option>
                  <option value="1">Sortie Zélande</option>
                  <option value="2">Formation N2</option>
                  <option value="3">Calyfiesta 2024</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                  Justificatifs
                </label>
                <div className="border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg p-4 text-center hover:border-gray-400 transition-colors cursor-pointer">
                  <Upload className="h-8 w-8 mx-auto text-gray-400 dark:text-dark-text-muted mb-2" />
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Cliquez pour ajouter des fichiers</p>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">PDF, JPG, PNG (max 10MB)</p>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors"
                >
                  Soumettre
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}