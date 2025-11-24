/**
 * Tests Unitaires - StockService
 *
 * Teste la gestion des produits en stock, ventes et commandes
 */

import { StockService } from '@/services/stockService';
import { InventoryTransactionService } from '@/services/inventoryTransactionService';
import { collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { StockProduct, Sale, Order } from '@/types/inventory';

jest.mock('@/lib/firebase');
jest.mock('firebase/firestore');
jest.mock('@/services/inventoryTransactionService');

describe('StockService', () => {
  const mockClubId = 'test-club-123';
  const mockProductId = 'product-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProducts', () => {
    it('devrait récupérer tous les produits en stock', async () => {
      const mockProducts: StockProduct[] = [
        {
          id: 'product-1',
          clubId: mockClubId,
          nom: 'T-shirt Calypso',
          description: 'T-shirt bleu avec logo',
          prix_achat: 8.00,
          prix_vente: 15.00,
          quantite_stock: 50,
          seuil_alerte: 10,
          categorie: 'Vêtements',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        {
          id: 'product-2',
          clubId: mockClubId,
          nom: 'Gourde isotherme',
          description: 'Gourde 500ml',
          prix_achat: 12.00,
          prix_vente: 20.00,
          quantite_stock: 30,
          seuil_alerte: 5,
          categorie: 'Accessoires',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
      ];

      (getDocs as jest.Mock).mockResolvedValue({
        docs: mockProducts.map(product => ({
          id: product.id,
          data: () => product,
          exists: () => true,
        })),
      });

      const result = await StockService.getProducts(mockClubId);

      expect(result).toHaveLength(2);
      expect(result[0].nom).toBe('T-shirt Calypso');
      expect(result[1].nom).toBe('Gourde isotherme');
    });
  });

  describe('createProduct', () => {
    it('devrait créer un nouveau produit en stock', async () => {
      const newProductData: Omit<StockProduct, 'id' | 'createdAt' | 'updatedAt'> = {
        clubId: mockClubId,
        nom: 'Casquette Calypso',
        description: 'Casquette noire avec logo brodé',
        prix_achat: 6.00,
        prix_vente: 12.00,
        quantite_stock: 20,
        seuil_alerte: 5,
        categorie: 'Vêtements',
      };

      (doc as jest.Mock).mockReturnValue({ id: 'new-product-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const result = await StockService.createProduct(mockClubId, newProductData);

      expect(result).toBe('new-product-id');
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'new-product-id',
          nom: 'Casquette Calypso',
          prix_achat: 6.00,
          prix_vente: 12.00,
          quantite_stock: 20,
        })
      );
    });

    it('devrait valider que prix_vente > prix_achat', async () => {
      const invalidData: Omit<StockProduct, 'id' | 'createdAt' | 'updatedAt'> = {
        clubId: mockClubId,
        nom: 'Produit test',
        description: 'Test',
        prix_achat: 15.00,
        prix_vente: 10.00, // INVALIDE: prix vente < prix achat
        quantite_stock: 10,
        seuil_alerte: 5,
        categorie: 'Test',
      };

      await expect(StockService.createProduct(mockClubId, invalidData))
        .rejects.toThrow('Le prix de vente doit être supérieur au prix d\'achat');
    });
  });

  describe('updateProduct', () => {
    it('devrait mettre à jour un produit existant', async () => {
      const updates = {
        prix_vente: 18.00,
        quantite_stock: 45,
      };

      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await StockService.updateProduct(mockClubId, mockProductId, updates);

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          prix_vente: 18.00,
          quantite_stock: 45,
          updatedAt: expect.anything(),
        })
      );
    });
  });

  describe('adjustStock', () => {
    it('devrait augmenter le stock', async () => {
      const mockProduct: StockProduct = {
        id: mockProductId,
        clubId: mockClubId,
        nom: 'T-shirt Calypso',
        description: 'T-shirt bleu',
        prix_achat: 8.00,
        prix_vente: 15.00,
        quantite_stock: 50,
        seuil_alerte: 10,
        categorie: 'Vêtements',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockProduct,
      });

      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await StockService.adjustStock(mockClubId, mockProductId, 10, 'Réception commande');

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          quantite_stock: 60, // 50 + 10
        })
      );
    });

    it('devrait diminuer le stock', async () => {
      const mockProduct: StockProduct = {
        id: mockProductId,
        clubId: mockClubId,
        nom: 'T-shirt Calypso',
        description: 'T-shirt bleu',
        prix_achat: 8.00,
        prix_vente: 15.00,
        quantite_stock: 50,
        seuil_alerte: 10,
        categorie: 'Vêtements',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockProduct,
      });

      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await StockService.adjustStock(mockClubId, mockProductId, -5, 'Vente boutique');

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          quantite_stock: 45, // 50 - 5
        })
      );
    });

    it('devrait empêcher un stock négatif', async () => {
      const mockProduct: StockProduct = {
        id: mockProductId,
        clubId: mockClubId,
        nom: 'T-shirt Calypso',
        description: 'T-shirt bleu',
        prix_achat: 8.00,
        prix_vente: 15.00,
        quantite_stock: 5,
        seuil_alerte: 10,
        categorie: 'Vêtements',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockProduct,
      });

      await expect(StockService.adjustStock(mockClubId, mockProductId, -10, 'Vente'))
        .rejects.toThrow('Stock insuffisant');
    });
  });

  describe('createSale', () => {
    it('devrait créer une vente et diminuer le stock', async () => {
      const mockProduct: StockProduct = {
        id: mockProductId,
        clubId: mockClubId,
        nom: 'T-shirt Calypso',
        description: 'T-shirt bleu',
        prix_achat: 8.00,
        prix_vente: 15.00,
        quantite_stock: 50,
        seuil_alerte: 10,
        categorie: 'Vêtements',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockProduct,
      });

      (doc as jest.Mock).mockReturnValue({ id: 'new-sale-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);
      (InventoryTransactionService.createTransactionFromSale as jest.Mock).mockResolvedValue('tx-123');

      const saleData: Omit<Sale, 'id' | 'createdAt' | 'updatedAt'> = {
        clubId: mockClubId,
        productId: mockProductId,
        memberId: 'member-789',
        quantite: 3,
        prix_unitaire: 15.00,
        montant_total: 45.00,
        date_vente: Timestamp.now(),
        fiscal_year_id: '2025',
      };

      const result = await StockService.createSale(mockClubId, saleData);

      expect(result).toBe('new-sale-id');
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'new-sale-id',
          productId: mockProductId,
          quantite: 3,
          montant_total: 45.00,
        })
      );

      // Vérifier que le stock a été diminué
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          quantite_stock: 47, // 50 - 3
        })
      );

      // Vérifier que la transaction bancaire a été créée
      expect(InventoryTransactionService.createTransactionFromSale).toHaveBeenCalledWith(
        mockClubId,
        expect.objectContaining({
          id: 'new-sale-id',
          montant_total: 45.00,
        }),
        expect.objectContaining({
          autoReconcile: true,
        })
      );
    });

    it('devrait gérer l\'échec de création de transaction sans bloquer la vente', async () => {
      const mockProduct: StockProduct = {
        id: mockProductId,
        clubId: mockClubId,
        nom: 'T-shirt Calypso',
        description: 'T-shirt bleu',
        prix_achat: 8.00,
        prix_vente: 15.00,
        quantite_stock: 50,
        seuil_alerte: 10,
        categorie: 'Vêtements',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockProduct,
      });

      (doc as jest.Mock).mockReturnValue({ id: 'new-sale-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      // Simuler échec transaction bancaire
      (InventoryTransactionService.createTransactionFromSale as jest.Mock).mockRejectedValue(
        new Error('Transaction creation failed')
      );

      const saleData: Omit<Sale, 'id' | 'createdAt' | 'updatedAt'> = {
        clubId: mockClubId,
        productId: mockProductId,
        memberId: 'member-789',
        quantite: 2,
        prix_unitaire: 15.00,
        montant_total: 30.00,
        date_vente: Timestamp.now(),
        fiscal_year_id: '2025',
      };

      // La vente devrait réussir malgré l'échec de la transaction
      const result = await StockService.createSale(mockClubId, saleData);

      expect(result).toBe('new-sale-id');
      expect(setDoc).toHaveBeenCalled();
    });

    it('devrait empêcher une vente si stock insuffisant', async () => {
      const mockProduct: StockProduct = {
        id: mockProductId,
        clubId: mockClubId,
        nom: 'T-shirt Calypso',
        description: 'T-shirt bleu',
        prix_achat: 8.00,
        prix_vente: 15.00,
        quantite_stock: 2, // Stock faible
        seuil_alerte: 10,
        categorie: 'Vêtements',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockProduct,
      });

      const saleData: Omit<Sale, 'id' | 'createdAt' | 'updatedAt'> = {
        clubId: mockClubId,
        productId: mockProductId,
        memberId: 'member-789',
        quantite: 5, // Trop élevé
        prix_unitaire: 15.00,
        montant_total: 75.00,
        date_vente: Timestamp.now(),
        fiscal_year_id: '2025',
      };

      await expect(StockService.createSale(mockClubId, saleData))
        .rejects.toThrow('Stock insuffisant');
    });
  });

  describe('getLowStockProducts', () => {
    it('devrait récupérer les produits avec stock faible', async () => {
      const mockProducts: StockProduct[] = [
        {
          id: 'product-1',
          clubId: mockClubId,
          nom: 'T-shirt Calypso',
          description: 'T-shirt bleu',
          prix_achat: 8.00,
          prix_vente: 15.00,
          quantite_stock: 8, // EN DESSOUS du seuil (10)
          seuil_alerte: 10,
          categorie: 'Vêtements',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        {
          id: 'product-2',
          clubId: mockClubId,
          nom: 'Gourde isotherme',
          description: 'Gourde 500ml',
          prix_achat: 12.00,
          prix_vente: 20.00,
          quantite_stock: 30, // OK
          seuil_alerte: 5,
          categorie: 'Accessoires',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        {
          id: 'product-3',
          clubId: mockClubId,
          nom: 'Casquette',
          description: 'Casquette noire',
          prix_achat: 6.00,
          prix_vente: 12.00,
          quantite_stock: 3, // EN DESSOUS du seuil (5)
          seuil_alerte: 5,
          categorie: 'Vêtements',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
      ];

      (getDocs as jest.Mock).mockResolvedValue({
        docs: mockProducts.map(product => ({
          id: product.id,
          data: () => product,
          exists: () => true,
        })),
      });

      const lowStockProducts = await StockService.getLowStockProducts(mockClubId);

      expect(lowStockProducts).toHaveLength(2);
      expect(lowStockProducts[0].nom).toBe('T-shirt Calypso');
      expect(lowStockProducts[1].nom).toBe('Casquette');
    });
  });

  describe('createOrder', () => {
    it('devrait créer une commande fournisseur', async () => {
      (doc as jest.Mock).mockReturnValue({ id: 'new-order-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'> = {
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
        montant_total: 760.00, // (50 * 8) + (30 * 12)
        statut: 'commandee',
        fiscal_year_id: '2025',
      };

      const result = await StockService.createOrder(mockClubId, orderData);

      expect(result).toBe('new-order-id');
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'new-order-id',
          fournisseur: 'Fournisseur ABC',
          montant_total: 760.00,
          statut: 'commandee',
        })
      );
    });
  });

  describe('markOrderDelivered', () => {
    it('devrait marquer une commande comme livrée et augmenter les stocks', async () => {
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
        statut: 'commandee',
        fiscal_year_id: '2025',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockOrder,
      });

      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      // Mock pour les produits
      (getDoc as jest.Mock)
        .mockResolvedValueOnce({ exists: () => true, data: () => mockOrder })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            id: 'product-1',
            quantite_stock: 10,
          }),
        })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            id: 'product-2',
            quantite_stock: 5,
          }),
        });

      await StockService.markOrderDelivered(mockClubId, 'order-123', Timestamp.now());

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statut: 'livree',
          date_livraison: expect.anything(),
        })
      );

      // Vérifier l'augmentation des stocks (2 appels pour 2 produits)
      expect(updateDoc).toHaveBeenCalledTimes(3); // 1 pour commande + 2 pour produits
    });
  });

  describe('getStats', () => {
    it('devrait calculer les statistiques du stock', async () => {
      const mockProducts: StockProduct[] = [
        {
          id: 'product-1',
          clubId: mockClubId,
          nom: 'T-shirt Calypso',
          description: 'T-shirt bleu',
          prix_achat: 8.00,
          prix_vente: 15.00,
          quantite_stock: 50,
          seuil_alerte: 10,
          categorie: 'Vêtements',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        {
          id: 'product-2',
          clubId: mockClubId,
          nom: 'Gourde isotherme',
          description: 'Gourde 500ml',
          prix_achat: 12.00,
          prix_vente: 20.00,
          quantite_stock: 30,
          seuil_alerte: 5,
          categorie: 'Accessoires',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
      ];

      const mockSales: Sale[] = [
        {
          id: 'sale-1',
          clubId: mockClubId,
          productId: 'product-1',
          memberId: 'member-789',
          quantite: 5,
          prix_unitaire: 15.00,
          montant_total: 75.00,
          date_vente: Timestamp.now(),
          fiscal_year_id: '2025',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
      ];

      // Mock pour produits
      (getDocs as jest.Mock).mockResolvedValueOnce({
        docs: mockProducts.map(product => ({
          id: product.id,
          data: () => product,
          exists: () => true,
        })),
      });

      // Mock pour ventes
      (getDocs as jest.Mock).mockResolvedValueOnce({
        docs: mockSales.map(sale => ({
          id: sale.id,
          data: () => sale,
          exists: () => true,
        })),
      });

      const stats = await StockService.getStats(mockClubId);

      expect(stats.total_produits).toBe(2);
      expect(stats.valeur_stock_achat).toBe(760.00); // (50*8) + (30*12)
      expect(stats.valeur_stock_vente).toBe(1350.00); // (50*15) + (30*20)
      expect(stats.total_ventes).toBe(75.00);
      expect(stats.marge_theorique).toBeGreaterThan(0);
    });
  });
});
