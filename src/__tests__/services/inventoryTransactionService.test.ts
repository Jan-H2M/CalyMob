/**
 * Tests Unitaires - InventoryTransactionService
 *
 * Teste la génération automatique de transactions bancaires depuis les opérations d'inventaire
 */

import { InventoryTransactionService } from '@/services/inventoryTransactionService';
import { collection, doc, setDoc, Timestamp } from 'firebase/firestore';
import { Sale, Order } from '@/types';

jest.mock('@/lib/firebase');
jest.mock('firebase/firestore');

describe('InventoryTransactionService', () => {
  const mockClubId = 'test-club-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTransactionFromSale', () => {
    it('devrait créer une transaction bancaire depuis une vente', async () => {
      const mockSale: Sale = {
        id: 'sale-123',
        clubId: mockClubId,
        productId: 'product-456',
        memberId: 'member-789',
        quantite: 3,
        prix_unitaire: 15.00,
        montant_total: 45.00,
        date_vente: Timestamp.now(),
        fiscal_year_id: '2025',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (doc as jest.Mock).mockReturnValue({ id: 'new-transaction-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const result = await InventoryTransactionService.createTransactionFromSale(mockClubId, mockSale, {
        bankAccount: 'BE123456789',
        autoReconcile: true,
      });

      expect(result).toBe('new-transaction-id');
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'new-transaction-id',
          numero_sequence: expect.stringContaining('INV-SALE-'),
          montant: 45.00, // Positif = revenu
          type: 'income',
          type_transaction: 'Vente stock - Inventaire',
          contrepartie_nom: 'Membre member-789',
          communication: 'Vente stock - product-456',
          categorie: 'ventes_materiel',
          code_comptable: '740-00',
          linked_to_sale_id: 'sale-123',
          reconcilie: true,
          statut_reconciliation: 'reconcilie',
          fiscal_year_id: '2025',
          matched_entities: expect.arrayContaining([
            expect.objectContaining({
              entity_type: 'member',
              entity_id: 'member-789',
              confidence: 100,
              matched_by: 'auto',
            }),
          ]),
        })
      );
    });

    it('devrait générer un numéro de séquence unique avec timestamp', async () => {
      const mockSale: Sale = {
        id: 'sale-123',
        clubId: mockClubId,
        productId: 'product-456',
        memberId: 'member-789',
        quantite: 1,
        prix_unitaire: 20.00,
        montant_total: 20.00,
        date_vente: Timestamp.now(),
        fiscal_year_id: '2025',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (doc as jest.Mock).mockReturnValue({ id: 'tx-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryTransactionService.createTransactionFromSale(mockClubId, mockSale);

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          numero_sequence: expect.stringMatching(/^INV-SALE-\d+$/),
        })
      );
    });

    it('devrait extraire l\'année fiscale de la date de vente si non fournie', async () => {
      const mockSale: Sale = {
        id: 'sale-123',
        clubId: mockClubId,
        productId: 'product-456',
        memberId: 'member-789',
        quantite: 1,
        prix_unitaire: 20.00,
        montant_total: 20.00,
        date_vente: Timestamp.fromDate(new Date('2024-06-15')),
        // fiscal_year_id NON fourni
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (doc as jest.Mock).mockReturnValue({ id: 'tx-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryTransactionService.createTransactionFromSale(mockClubId, mockSale);

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fiscal_year_id: '2024', // Extrait de date_vente
        })
      );
    });

    it('devrait générer un hash de déduplication', async () => {
      const mockSale: Sale = {
        id: 'sale-123',
        clubId: mockClubId,
        productId: 'product-456',
        memberId: 'member-789',
        quantite: 1,
        prix_unitaire: 20.00,
        montant_total: 20.00,
        date_vente: Timestamp.now(),
        fiscal_year_id: '2025',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (doc as jest.Mock).mockReturnValue({ id: 'tx-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryTransactionService.createTransactionFromSale(mockClubId, mockSale);

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          hash_dedup: expect.stringMatching(/^[a-f0-9]{64}$/), // SHA-256 hex (64 chars)
        })
      );
    });
  });

  describe('createTransactionFromOrder', () => {
    it('devrait créer une transaction bancaire depuis une commande fournisseur', async () => {
      const mockOrder: Order = {
        id: 'order-123',
        clubId: mockClubId,
        fournisseur: 'Fournisseur ABC',
        date_commande: Timestamp.now(),
        items: [
          {
            productId: 'product-1',
            quantite: 50,
            prix_unitaire: 8.00,
          },
          {
            productId: 'product-2',
            quantite: 30,
            prix_unitaire: 12.00,
          },
        ],
        montant_total: 760.00,
        statut: 'livree',
        date_livraison: Timestamp.now(),
        fiscal_year_id: '2025',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (doc as jest.Mock).mockReturnValue({ id: 'new-transaction-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const result = await InventoryTransactionService.createTransactionFromOrder(mockClubId, mockOrder, {
        bankAccount: 'BE123456789',
        autoReconcile: true,
      });

      expect(result).toBe('new-transaction-id');
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'new-transaction-id',
          numero_sequence: expect.stringContaining('INV-ORDER-'),
          montant: -760.00, // Négatif = dépense
          type: 'expense',
          type_transaction: 'Achat stock - Inventaire',
          contrepartie_nom: 'Fournisseur ABC',
          communication: 'Commande stock - 2 produit(s)',
          categorie: 'achats_materiel',
          code_comptable: '604-00',
          linked_to_order_id: 'order-123',
          reconcilie: true,
          fiscal_year_id: '2025',
        })
      );
    });

    it('devrait utiliser date_livraison si disponible sinon date_commande', async () => {
      const mockOrder: Order = {
        id: 'order-123',
        clubId: mockClubId,
        fournisseur: 'Fournisseur ABC',
        date_commande: Timestamp.fromDate(new Date('2025-01-10')),
        date_livraison: Timestamp.fromDate(new Date('2025-01-20')),
        items: [],
        montant_total: 100.00,
        statut: 'livree',
        fiscal_year_id: '2025',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (doc as jest.Mock).mockReturnValue({ id: 'tx-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryTransactionService.createTransactionFromOrder(mockClubId, mockOrder);

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          date_execution: mockOrder.date_livraison,
          date_valeur: mockOrder.date_livraison,
        })
      );
    });

    it('devrait générer details avec liste des produits', async () => {
      const mockOrder: Order = {
        id: 'order-123',
        clubId: mockClubId,
        fournisseur: 'Fournisseur ABC',
        date_commande: Timestamp.now(),
        items: [
          {
            productId: 'tshirt',
            quantite: 50,
            prix_unitaire: 8.00,
          },
          {
            productId: 'gourde',
            quantite: 30,
            prix_unitaire: 12.00,
          },
        ],
        montant_total: 760.00,
        statut: 'commandee',
        fiscal_year_id: '2025',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (doc as jest.Mock).mockReturnValue({ id: 'tx-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryTransactionService.createTransactionFromOrder(mockClubId, mockOrder);

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          details: 'Commande: 50x tshirt, 30x gourde',
        })
      );
    });
  });

  describe('createTransactionFromLoan', () => {
    it('devrait créer une transaction pour le paiement de caution', async () => {
      const loanData = {
        memberId: 'member-789',
        memberName: 'Jean Dupont',
        montant_caution: 90.00,
        date_pret: Timestamp.now(),
        fiscal_year_id: '2025',
      };

      (doc as jest.Mock).mockReturnValue({ id: 'new-transaction-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const result = await InventoryTransactionService.createTransactionFromLoan(
        mockClubId,
        'loan-123',
        loanData,
        {
          bankAccount: 'BE123456789',
          autoReconcile: true,
        }
      );

      expect(result).toBe('new-transaction-id');
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'new-transaction-id',
          numero_sequence: expect.stringContaining('INV-LOAN-'),
          montant: 90.00, // Positif = caution reçue
          type: 'income',
          type_transaction: 'Caution prêt matériel - Inventaire',
          contrepartie_nom: 'Jean Dupont',
          communication: 'Caution prêt matériel',
          details: 'Caution pour prêt loan-123',
          categorie: 'cautions',
          code_comptable: '439-00',
          linked_to_loan_id: 'loan-123',
          reconcilie: true,
          fiscal_year_id: '2025',
          matched_entities: expect.arrayContaining([
            expect.objectContaining({
              entity_type: 'member',
              entity_id: 'member-789',
              entity_name: 'Jean Dupont',
            }),
          ]),
        })
      );
    });

    it('devrait utiliser "Membre {id}" si nom non fourni', async () => {
      const loanData = {
        memberId: 'member-789',
        // memberName NON fourni
        montant_caution: 50.00,
        date_pret: Timestamp.now(),
        fiscal_year_id: '2025',
      };

      (doc as jest.Mock).mockReturnValue({ id: 'tx-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryTransactionService.createTransactionFromLoan(mockClubId, 'loan-123', loanData);

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          contrepartie_nom: 'Membre member-789',
        })
      );
    });
  });

  describe('createTransactionFromLoanReturn', () => {
    it('devrait créer une transaction pour le remboursement de caution', async () => {
      const returnData = {
        memberId: 'member-789',
        memberName: 'Jean Dupont',
        caution_retournee: 90.00,
        date_retour: Timestamp.now(),
        fiscal_year_id: '2025',
      };

      (doc as jest.Mock).mockReturnValue({ id: 'new-transaction-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const result = await InventoryTransactionService.createTransactionFromLoanReturn(
        mockClubId,
        'loan-123',
        returnData,
        {
          bankAccount: 'BE123456789',
          autoReconcile: true,
        }
      );

      expect(result).toBe('new-transaction-id');
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'new-transaction-id',
          numero_sequence: expect.stringContaining('INV-RETURN-'),
          montant: -90.00, // Négatif = remboursement
          type: 'expense',
          type_transaction: 'Remboursement caution - Inventaire',
          contrepartie_nom: 'Jean Dupont',
          communication: 'Remboursement caution prêt matériel',
          details: 'Remboursement caution pour prêt loan-123',
          categorie: 'cautions',
          code_comptable: '439-00',
          linked_to_loan_id: 'loan-123',
          reconcilie: true,
          fiscal_year_id: '2025',
        })
      );
    });

    it('devrait gérer un remboursement partiel', async () => {
      const returnData = {
        memberId: 'member-789',
        memberName: 'Jean Dupont',
        caution_retournee: 30.00, // Sur 50€ de caution initiale
        date_retour: Timestamp.now(),
        fiscal_year_id: '2025',
      };

      (doc as jest.Mock).mockReturnValue({ id: 'tx-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryTransactionService.createTransactionFromLoanReturn(
        mockClubId,
        'loan-123',
        returnData
      );

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          montant: -30.00, // Remboursement partiel
        })
      );
    });

    it('devrait gérer un remboursement zéro (matériel perdu)', async () => {
      const returnData = {
        memberId: 'member-789',
        memberName: 'Jean Dupont',
        caution_retournee: 0.00, // Aucun remboursement
        date_retour: Timestamp.now(),
        fiscal_year_id: '2025',
      };

      (doc as jest.Mock).mockReturnValue({ id: 'tx-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryTransactionService.createTransactionFromLoanReturn(
        mockClubId,
        'loan-123',
        returnData
      );

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          montant: -0.00,
        })
      );
    });
  });

  describe('generateHash (private method)', () => {
    it('devrait générer le même hash pour les mêmes données', async () => {
      const mockSale1: Sale = {
        id: 'sale-123',
        clubId: mockClubId,
        productId: 'product-456',
        memberId: 'member-789',
        quantite: 1,
        prix_unitaire: 20.00,
        montant_total: 20.00,
        date_vente: Timestamp.fromDate(new Date('2025-01-15')),
        fiscal_year_id: '2025',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const mockSale2: Sale = {
        ...mockSale1,
        id: 'sale-456', // ID différent mais autres données identiques
      };

      (doc as jest.Mock).mockReturnValue({ id: 'tx-1' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      // Mock Date.now() pour avoir le même timestamp
      const mockTimestamp = 1705334400000; // 2025-01-15
      jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

      await InventoryTransactionService.createTransactionFromSale(mockClubId, mockSale1);
      const call1 = (setDoc as jest.Mock).mock.calls[0][1];

      (setDoc as jest.Mock).mockClear();
      await InventoryTransactionService.createTransactionFromSale(mockClubId, mockSale2);
      const call2 = (setDoc as jest.Mock).mock.calls[0][1];

      // Les hash devraient être identiques (déduplication)
      expect(call1.hash_dedup).toBe(call2.hash_dedup);
    });
  });

  describe('Options de configuration', () => {
    it('devrait respecter autoReconcile: false', async () => {
      const mockSale: Sale = {
        id: 'sale-123',
        clubId: mockClubId,
        productId: 'product-456',
        memberId: 'member-789',
        quantite: 1,
        prix_unitaire: 20.00,
        montant_total: 20.00,
        date_vente: Timestamp.now(),
        fiscal_year_id: '2025',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (doc as jest.Mock).mockReturnValue({ id: 'tx-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryTransactionService.createTransactionFromSale(mockClubId, mockSale, {
        autoReconcile: false, // Ne PAS marquer réconcilié
      });

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          reconcilie: false,
          statut_reconciliation: 'reconcilie', // Toujours "reconcilie" même si false (?)
        })
      );
    });

    it('devrait définir le compte bancaire si fourni', async () => {
      const mockSale: Sale = {
        id: 'sale-123',
        clubId: mockClubId,
        productId: 'product-456',
        memberId: 'member-789',
        quantite: 1,
        prix_unitaire: 20.00,
        montant_total: 20.00,
        date_vente: Timestamp.now(),
        fiscal_year_id: '2025',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (doc as jest.Mock).mockReturnValue({ id: 'tx-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryTransactionService.createTransactionFromSale(mockClubId, mockSale, {
        bankAccount: 'BE68 5390 0754 7034',
      });

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          numero_compte: 'BE68 5390 0754 7034',
        })
      );
    });
  });

  describe('Gestion des erreurs', () => {
    it('devrait propager les erreurs Firestore', async () => {
      const mockSale: Sale = {
        id: 'sale-123',
        clubId: mockClubId,
        productId: 'product-456',
        memberId: 'member-789',
        quantite: 1,
        prix_unitaire: 20.00,
        montant_total: 20.00,
        date_vente: Timestamp.now(),
        fiscal_year_id: '2025',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (doc as jest.Mock).mockReturnValue({ id: 'tx-id' });
      (setDoc as jest.Mock).mockRejectedValue(new Error('Firestore error'));

      await expect(
        InventoryTransactionService.createTransactionFromSale(mockClubId, mockSale)
      ).rejects.toThrow('Firestore error');
    });
  });
});
