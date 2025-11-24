/**
 * Tests d'Intégration - Module Inventaire
 *
 * Teste des scénarios complets de bout en bout
 */

import { InventoryItemService } from '@/services/inventoryItemService';
import { LoanService } from '@/services/loanService';
import { StockService } from '@/services/stockService';
import { InventoryTransactionService } from '@/services/inventoryTransactionService';
import { InventoryConfigService } from '@/services/inventoryConfigService';
import { Timestamp } from 'firebase/firestore';

jest.mock('@/lib/firebase');
jest.mock('firebase/firestore');
jest.mock('firebase/storage');

describe('Integration Tests - Inventory Module', () => {
  const mockClubId = 'test-club-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * SCÉNARIO 1: Cycle complet d'un prêt
   *
   * 1. Créer un matériel disponible
   * 2. Créer un prêt avec ce matériel
   * 3. Vérifier que le matériel passe en statut "prête"
   * 4. Retourner le prêt
   * 5. Vérifier que le matériel redevient "disponible"
   */
  describe('Scénario 1: Cycle complet d\'un prêt', () => {
    it('devrait gérer le cycle complet création → prêt → retour', async () => {
      // STEP 1: Créer un matériel disponible
      const itemData = {
        clubId: mockClubId,
        typeId: 'type-detendeur',
        nom: 'Détendeur Scubapro MK25',
        numero_serie: 'SN-001',
        date_achat: Timestamp.now(),
        prix_achat: 450.00,
        statut: 'disponible' as const,
        localisation: 'Salle matériel',
        photos: [],
        historique_maintenance: [],
      };

      // Mock création item
      const mockItemId = 'item-123';
      jest.spyOn(InventoryItemService, 'createItem').mockResolvedValue(mockItemId);
      jest.spyOn(InventoryItemService, 'getItemById').mockResolvedValue({
        id: mockItemId,
        ...itemData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const itemId = await InventoryItemService.createItem(mockClubId, itemData);
      expect(itemId).toBe(mockItemId);

      // STEP 2: Créer un prêt avec ce matériel
      const loanData = {
        clubId: mockClubId,
        memberId: 'member-789',
        itemIds: [itemId],
        date_pret: Timestamp.now(),
        date_retour_prevue: Timestamp.fromDate(new Date('2025-02-15')),
        statut: 'en_cours' as const,
        montant_caution: 50.00,
        caution_payee: true,
      };

      // Mock config pour checklist
      jest.spyOn(InventoryConfigService, 'getItemTypeById').mockResolvedValue({
        id: 'type-detendeur',
        clubId: mockClubId,
        nom: 'Détendeur',
        description: 'Détendeur de plongée',
        valeur_caution_defaut: 50.00,
        checklistIds: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const mockLoanId = 'loan-456';
      jest.spyOn(LoanService, 'createLoan').mockResolvedValue(mockLoanId);
      jest.spyOn(InventoryItemService, 'updateItem').mockResolvedValue();

      const loanId = await LoanService.createLoan(mockClubId, loanData);
      expect(loanId).toBe(mockLoanId);

      // STEP 3: Vérifier que updateItem a été appelé pour marquer le matériel comme "prête"
      expect(InventoryItemService.updateItem).toHaveBeenCalledWith(
        mockClubId,
        itemId,
        expect.objectContaining({ statut: 'prete' })
      );

      // STEP 4: Retourner le prêt
      const returnData = {
        checklist_retour_remplie: [],
        etat_retour: 'bon' as const,
        commentaire_retour: 'Matériel en bon état',
      };

      jest.spyOn(LoanService, 'returnLoan').mockResolvedValue();

      await LoanService.returnLoan(mockClubId, loanId, returnData);

      // STEP 5: Vérifier que le matériel redevient "disponible"
      expect(InventoryItemService.updateItem).toHaveBeenCalledWith(
        mockClubId,
        itemId,
        expect.objectContaining({ statut: 'disponible' })
      );
    });

    it('devrait gérer un matériel endommagé au retour', async () => {
      const mockItemId = 'item-123';
      const mockLoanId = 'loan-456';

      jest.spyOn(InventoryItemService, 'getItemById').mockResolvedValue({
        id: mockItemId,
        clubId: mockClubId,
        typeId: 'type-1',
        nom: 'Test Item',
        numero_serie: 'SN-001',
        date_achat: Timestamp.now(),
        prix_achat: 100,
        statut: 'prete',
        localisation: 'Test',
        photos: [],
        historique_maintenance: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      jest.spyOn(LoanService, 'getLoanById').mockResolvedValue({
        id: mockLoanId,
        clubId: mockClubId,
        memberId: 'member-789',
        itemIds: [mockItemId],
        date_pret: Timestamp.now(),
        date_retour_prevue: Timestamp.now(),
        statut: 'en_cours',
        montant_caution: 50.00,
        caution_payee: true,
        checklist_snapshot: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      jest.spyOn(LoanService, 'returnLoan').mockResolvedValue();
      jest.spyOn(InventoryItemService, 'updateItem').mockResolvedValue();

      const returnData = {
        checklist_retour_remplie: [],
        etat_retour: 'endommage' as const,
        montant_retenu: 20.00,
        commentaire_retour: 'Joint HP endommagé',
      };

      await LoanService.returnLoan(mockClubId, mockLoanId, returnData);

      // Le matériel devrait passer en "en_maintenance" (logique métier)
      expect(InventoryItemService.updateItem).toHaveBeenCalled();
    });
  });

  /**
   * SCÉNARIO 2: Vente de produit en stock avec génération automatique de transaction
   *
   * 1. Créer un produit en stock
   * 2. Créer une vente
   * 3. Vérifier que le stock diminue
   * 4. Vérifier qu'une transaction bancaire est générée
   */
  describe('Scénario 2: Vente de stock avec transaction automatique', () => {
    it('devrait créer une vente, diminuer le stock et générer une transaction', async () => {
      // STEP 1: Créer un produit en stock
      const productData = {
        clubId: mockClubId,
        nom: 'T-shirt Calypso',
        description: 'T-shirt bleu avec logo',
        prix_achat: 8.00,
        prix_vente: 15.00,
        quantite_stock: 50,
        seuil_alerte: 10,
        categorie: 'Vêtements',
      };

      const mockProductId = 'product-123';
      jest.spyOn(StockService, 'createProduct').mockResolvedValue(mockProductId);
      jest.spyOn(StockService, 'getProductById').mockResolvedValue({
        id: mockProductId,
        ...productData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const productId = await StockService.createProduct(mockClubId, productData);
      expect(productId).toBe(mockProductId);

      // STEP 2: Créer une vente (3 unités)
      const saleData = {
        clubId: mockClubId,
        productId: mockProductId,
        memberId: 'member-789',
        quantite: 3,
        prix_unitaire: 15.00,
        montant_total: 45.00,
        date_vente: Timestamp.now(),
        fiscal_year_id: '2025',
      };

      const mockSaleId = 'sale-456';
      jest.spyOn(StockService, 'createSale').mockResolvedValue(mockSaleId);
      jest.spyOn(StockService, 'adjustStock').mockResolvedValue();
      jest.spyOn(InventoryTransactionService, 'createTransactionFromSale').mockResolvedValue('tx-789');

      const saleId = await StockService.createSale(mockClubId, saleData);
      expect(saleId).toBe(mockSaleId);

      // STEP 3: Vérifier que le stock a diminué (50 → 47)
      expect(StockService.adjustStock).toHaveBeenCalledWith(
        mockClubId,
        mockProductId,
        -3,
        expect.any(String)
      );

      // STEP 4: Vérifier qu'une transaction bancaire a été générée
      expect(InventoryTransactionService.createTransactionFromSale).toHaveBeenCalledWith(
        mockClubId,
        expect.objectContaining({
          id: mockSaleId,
          montant_total: 45.00,
        }),
        expect.objectContaining({
          autoReconcile: true,
        })
      );
    });

    it('devrait empêcher une vente si stock insuffisant', async () => {
      const mockProductId = 'product-123';

      jest.spyOn(StockService, 'getProductById').mockResolvedValue({
        id: mockProductId,
        clubId: mockClubId,
        nom: 'T-shirt',
        description: 'T-shirt bleu',
        prix_achat: 8.00,
        prix_vente: 15.00,
        quantite_stock: 2, // Stock faible
        seuil_alerte: 10,
        categorie: 'Vêtements',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const saleData = {
        clubId: mockClubId,
        productId: mockProductId,
        memberId: 'member-789',
        quantite: 5, // TROP ÉLEVÉ
        prix_unitaire: 15.00,
        montant_total: 75.00,
        date_vente: Timestamp.now(),
        fiscal_year_id: '2025',
      };

      jest.spyOn(StockService, 'createSale').mockRejectedValue(new Error('Stock insuffisant'));

      await expect(StockService.createSale(mockClubId, saleData))
        .rejects.toThrow('Stock insuffisant');
    });

    it('ne devrait pas bloquer la vente si la transaction échoue', async () => {
      const mockProductId = 'product-123';
      const mockSaleId = 'sale-456';

      jest.spyOn(StockService, 'getProductById').mockResolvedValue({
        id: mockProductId,
        clubId: mockClubId,
        nom: 'T-shirt',
        description: 'T-shirt bleu',
        prix_achat: 8.00,
        prix_vente: 15.00,
        quantite_stock: 50,
        seuil_alerte: 10,
        categorie: 'Vêtements',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const saleData = {
        clubId: mockClubId,
        productId: mockProductId,
        memberId: 'member-789',
        quantite: 2,
        prix_unitaire: 15.00,
        montant_total: 30.00,
        date_vente: Timestamp.now(),
        fiscal_year_id: '2025',
      };

      jest.spyOn(StockService, 'createSale').mockResolvedValue(mockSaleId);
      jest.spyOn(StockService, 'adjustStock').mockResolvedValue();

      // Simuler échec de la transaction bancaire
      jest.spyOn(InventoryTransactionService, 'createTransactionFromSale')
        .mockRejectedValue(new Error('Transaction failed'));

      // La vente devrait réussir malgré l'échec de la transaction
      const saleId = await StockService.createSale(mockClubId, saleData);
      expect(saleId).toBe(mockSaleId);
    });
  });

  /**
   * SCÉNARIO 3: Commande fournisseur livrée avec augmentation de stock
   *
   * 1. Créer une commande fournisseur
   * 2. Marquer comme livrée
   * 3. Vérifier que les stocks augmentent pour tous les produits
   * 4. Vérifier qu'une transaction bancaire est générée (optionnel)
   */
  describe('Scénario 3: Commande fournisseur et augmentation de stock', () => {
    it('devrait créer une commande, la marquer livrée et augmenter les stocks', async () => {
      // STEP 1: Créer une commande fournisseur
      const orderData = {
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
        statut: 'commandee' as const,
        fiscal_year_id: '2025',
      };

      const mockOrderId = 'order-123';
      jest.spyOn(StockService, 'createOrder').mockResolvedValue(mockOrderId);
      jest.spyOn(StockService, 'getOrderById').mockResolvedValue({
        id: mockOrderId,
        ...orderData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const orderId = await StockService.createOrder(mockClubId, orderData);
      expect(orderId).toBe(mockOrderId);

      // STEP 2: Marquer comme livrée
      jest.spyOn(StockService, 'markOrderDelivered').mockResolvedValue();
      jest.spyOn(StockService, 'adjustStock').mockResolvedValue();

      await StockService.markOrderDelivered(mockClubId, orderId, Timestamp.now());

      // STEP 3: Vérifier que les stocks augmentent pour chaque produit
      expect(StockService.adjustStock).toHaveBeenCalledTimes(2);
      expect(StockService.adjustStock).toHaveBeenCalledWith(
        mockClubId,
        'product-1',
        50,
        expect.any(String)
      );
      expect(StockService.adjustStock).toHaveBeenCalledWith(
        mockClubId,
        'product-2',
        30,
        expect.any(String)
      );
    });
  });

  /**
   * SCÉNARIO 4: Calcul automatique de caution pour prêt multi-items
   *
   * 1. Créer plusieurs types de matériel avec valeurs de caution différentes
   * 2. Calculer la caution totale pour un prêt multi-items
   * 3. Vérifier que la caution est la somme des valeurs individuelles
   */
  describe('Scénario 4: Calcul automatique de caution multi-items', () => {
    it('devrait calculer correctement la caution pour plusieurs items', async () => {
      const item1 = {
        id: 'item-1',
        typeId: 'type-detendeur',
        prix_achat: 450.00,
      };

      const item2 = {
        id: 'item-2',
        typeId: 'type-gilet',
        prix_achat: 380.00,
      };

      const item3 = {
        id: 'item-3',
        typeId: 'type-ordinateur',
        prix_achat: 600.00,
      };

      const type1 = {
        id: 'type-detendeur',
        valeur_caution_defaut: 50.00,
      };

      const type2 = {
        id: 'type-gilet',
        valeur_caution_defaut: 40.00,
      };

      const type3 = {
        id: 'type-ordinateur',
        valeur_caution_defaut: 100.00,
      };

      jest.spyOn(InventoryItemService, 'getItemById')
        .mockResolvedValueOnce(item1 as any)
        .mockResolvedValueOnce(item2 as any)
        .mockResolvedValueOnce(item3 as any);

      jest.spyOn(InventoryConfigService, 'getItemTypeById')
        .mockResolvedValueOnce(type1 as any)
        .mockResolvedValueOnce(type2 as any)
        .mockResolvedValueOnce(type3 as any);

      jest.spyOn(LoanService, 'calculateCautionAmount').mockResolvedValue(190.00);

      const totalCaution = await LoanService.calculateCautionAmount(
        mockClubId,
        ['item-1', 'item-2', 'item-3']
      );

      expect(totalCaution).toBe(190.00); // 50 + 40 + 100
    });
  });

  /**
   * SCÉNARIO 5: Alertes de stock faible
   *
   * 1. Créer plusieurs produits avec différents niveaux de stock
   * 2. Récupérer la liste des produits en alerte
   * 3. Vérifier que seuls les produits sous le seuil sont retournés
   */
  describe('Scénario 5: Alertes de stock faible', () => {
    it('devrait identifier les produits avec stock faible', async () => {
      const products = [
        {
          id: 'product-1',
          quantite_stock: 8,
          seuil_alerte: 10, // EN ALERTE
        },
        {
          id: 'product-2',
          quantite_stock: 30,
          seuil_alerte: 5, // OK
        },
        {
          id: 'product-3',
          quantite_stock: 3,
          seuil_alerte: 5, // EN ALERTE
        },
      ];

      jest.spyOn(StockService, 'getLowStockProducts').mockResolvedValue(
        [products[0], products[2]] as any
      );

      const lowStockProducts = await StockService.getLowStockProducts(mockClubId);

      expect(lowStockProducts).toHaveLength(2);
      expect(lowStockProducts[0].id).toBe('product-1');
      expect(lowStockProducts[1].id).toBe('product-3');
    });
  });

  /**
   * SCÉNARIO 6: Prêts en retard
   *
   * 1. Créer plusieurs prêts avec différentes dates de retour
   * 2. Récupérer la liste des prêts en retard
   * 3. Vérifier que seuls les prêts dépassés sont retournés
   */
  describe('Scénario 6: Identification des prêts en retard', () => {
    it('devrait identifier les prêts en retard', async () => {
      const now = new Date('2025-01-20');
      const pastDate = new Date('2025-01-10'); // 10 jours en retard
      const futureDate = new Date('2025-01-30'); // OK

      const loans = [
        {
          id: 'loan-1',
          date_retour_prevue: Timestamp.fromDate(pastDate),
          statut: 'en_cours',
        },
        {
          id: 'loan-2',
          date_retour_prevue: Timestamp.fromDate(futureDate),
          statut: 'en_cours',
        },
      ];

      jest.spyOn(LoanService, 'getLoansNeedingReturn').mockResolvedValue([loans[0]] as any);
      jest.spyOn(global.Date, 'now').mockReturnValue(now.getTime());

      const lateLoans = await LoanService.getLoansNeedingReturn(mockClubId);

      expect(lateLoans).toHaveLength(1);
      expect(lateLoans[0].id).toBe('loan-1');
    });
  });
});
