/**
 * Tests Unitaires - InventoryItemService
 *
 * Teste toutes les opérations CRUD du service de gestion du matériel
 */

import { InventoryItemService } from '@/services/inventoryItemService';
import { collection, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc, query, where, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { InventoryItem } from '@/types/inventory';

// Mock des modules Firebase
jest.mock('@/lib/firebase');
jest.mock('firebase/firestore');
jest.mock('firebase/storage');

describe('InventoryItemService', () => {
  const mockClubId = 'test-club-123';
  const mockItemId = 'item-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getItems', () => {
    it('devrait récupérer tous les items d\'un club', async () => {
      const mockItems: InventoryItem[] = [
        {
          id: 'item-1',
          clubId: mockClubId,
          typeId: 'type-1',
          nom: 'Détendeur Scubapro MK25',
          numero_serie: 'SN-001',
          date_achat: Timestamp.now(),
          prix_achat: 450.00,
          statut: 'disponible',
          localisation: 'Salle matériel',
          photos: [],
          historique_maintenance: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        {
          id: 'item-2',
          clubId: mockClubId,
          typeId: 'type-2',
          nom: 'Gilet stabilisateur',
          numero_serie: 'SN-002',
          date_achat: Timestamp.now(),
          prix_achat: 380.00,
          statut: 'disponible',
          localisation: 'Salle matériel',
          photos: [],
          historique_maintenance: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
      ];

      (getDocs as jest.Mock).mockResolvedValue({
        docs: mockItems.map(item => ({
          id: item.id,
          data: () => item,
          exists: () => true,
        })),
      });

      const result = await InventoryItemService.getItems(mockClubId);

      expect(result).toHaveLength(2);
      expect(result[0].nom).toBe('Détendeur Scubapro MK25');
      expect(result[1].nom).toBe('Gilet stabilisateur');
      expect(collection).toHaveBeenCalled();
      expect(getDocs).toHaveBeenCalled();
    });

    it('devrait retourner un tableau vide si aucun item', async () => {
      (getDocs as jest.Mock).mockResolvedValue({
        docs: [],
      });

      const result = await InventoryItemService.getItems(mockClubId);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it('devrait gérer les erreurs Firestore', async () => {
      (getDocs as jest.Mock).mockRejectedValue(new Error('Firestore error'));

      await expect(InventoryItemService.getItems(mockClubId)).rejects.toThrow('Firestore error');
    });
  });

  describe('getItemById', () => {
    it('devrait récupérer un item par son ID', async () => {
      const mockItem: InventoryItem = {
        id: mockItemId,
        clubId: mockClubId,
        typeId: 'type-1',
        nom: 'Détendeur Scubapro MK25',
        numero_serie: 'SN-001',
        date_achat: Timestamp.now(),
        prix_achat: 450.00,
        statut: 'disponible',
        localisation: 'Salle matériel',
        photos: [],
        historique_maintenance: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockItem,
      });

      const result = await InventoryItemService.getItemById(mockClubId, mockItemId);

      expect(result).toEqual(mockItem);
      expect(doc).toHaveBeenCalled();
      expect(getDoc).toHaveBeenCalled();
    });

    it('devrait lancer une erreur si l\'item n\'existe pas', async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => false,
      });

      await expect(InventoryItemService.getItemById(mockClubId, mockItemId))
        .rejects.toThrow('Item introuvable');
    });
  });

  describe('createItem', () => {
    it('devrait créer un nouvel item', async () => {
      const newItemData: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'> = {
        clubId: mockClubId,
        typeId: 'type-1',
        nom: 'Détendeur Scubapro MK25',
        numero_serie: 'SN-003',
        date_achat: Timestamp.now(),
        prix_achat: 450.00,
        statut: 'disponible',
        localisation: 'Salle matériel',
        photos: [],
        historique_maintenance: [],
      };

      (doc as jest.Mock).mockReturnValue({ id: 'new-item-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const result = await InventoryItemService.createItem(mockClubId, newItemData);

      expect(result).toBe('new-item-id');
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'new-item-id',
          nom: 'Détendeur Scubapro MK25',
          numero_serie: 'SN-003',
        })
      );
    });

    it('devrait valider les données obligatoires', async () => {
      const invalidData = {
        clubId: mockClubId,
        typeId: 'type-1',
        // Manque: nom, numero_serie, date_achat, prix_achat
      } as any;

      await expect(InventoryItemService.createItem(mockClubId, invalidData))
        .rejects.toThrow();
    });
  });

  describe('updateItem', () => {
    it('devrait mettre à jour un item existant', async () => {
      const updates = {
        statut: 'en_maintenance' as const,
        localisation: 'Atelier',
      };

      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryItemService.updateItem(mockClubId, mockItemId, updates);

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statut: 'en_maintenance',
          localisation: 'Atelier',
          updatedAt: expect.anything(),
        })
      );
    });

    it('devrait gérer les erreurs de mise à jour', async () => {
      (updateDoc as jest.Mock).mockRejectedValue(new Error('Update failed'));

      await expect(
        InventoryItemService.updateItem(mockClubId, mockItemId, { statut: 'en_maintenance' })
      ).rejects.toThrow('Update failed');
    });
  });

  describe('deleteItem', () => {
    it('devrait supprimer un item (soft delete)', async () => {
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryItemService.deleteItem(mockClubId, mockItemId);

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statut: 'hors_service',
          updatedAt: expect.anything(),
        })
      );
    });
  });

  describe('uploadPhoto', () => {
    it('devrait uploader une photo vers Firebase Storage', async () => {
      const mockFile = new File(['photo-content'], 'photo.jpg', { type: 'image/jpeg' });
      const mockPhotoUrl = 'https://storage.example.com/photo.jpg';

      const mockItem: InventoryItem = {
        id: mockItemId,
        clubId: mockClubId,
        typeId: 'type-1',
        nom: 'Test Item',
        numero_serie: 'SN-001',
        date_achat: Timestamp.now(),
        prix_achat: 100,
        statut: 'disponible',
        localisation: 'Test',
        photos: [],
        historique_maintenance: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockItem,
      });

      (uploadBytes as jest.Mock).mockResolvedValue(undefined);
      (getDownloadURL as jest.Mock).mockResolvedValue(mockPhotoUrl);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      const result = await InventoryItemService.uploadPhoto(mockClubId, mockItemId, mockFile);

      expect(result).toBe(mockPhotoUrl);
      expect(ref).toHaveBeenCalled();
      expect(uploadBytes).toHaveBeenCalled();
      expect(getDownloadURL).toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          photos: [mockPhotoUrl],
        })
      );
    });

    it('devrait rejeter les fichiers non-image', async () => {
      const mockFile = new File(['content'], 'document.pdf', { type: 'application/pdf' });

      await expect(InventoryItemService.uploadPhoto(mockClubId, mockItemId, mockFile))
        .rejects.toThrow('Le fichier doit être une image');
    });

    it('devrait rejeter les fichiers trop volumineux', async () => {
      const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });

      await expect(InventoryItemService.uploadPhoto(mockClubId, mockItemId, largeFile))
        .rejects.toThrow('Le fichier ne doit pas dépasser 10 Mo');
    });
  });

  describe('deletePhoto', () => {
    it('devrait supprimer une photo de Storage et Firestore', async () => {
      const photoUrl = 'https://storage.example.com/photo.jpg';

      const mockItem: InventoryItem = {
        id: mockItemId,
        clubId: mockClubId,
        typeId: 'type-1',
        nom: 'Test Item',
        numero_serie: 'SN-001',
        date_achat: Timestamp.now(),
        prix_achat: 100,
        statut: 'disponible',
        localisation: 'Test',
        photos: [photoUrl, 'https://storage.example.com/photo2.jpg'],
        historique_maintenance: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockItem,
      });

      (deleteObject as jest.Mock).mockResolvedValue(undefined);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryItemService.deletePhoto(mockClubId, mockItemId, photoUrl);

      expect(deleteObject).toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          photos: ['https://storage.example.com/photo2.jpg'],
        })
      );
    });
  });

  describe('addMaintenanceRecord', () => {
    it('devrait ajouter un enregistrement de maintenance', async () => {
      const maintenanceData = {
        date_maintenance: Timestamp.now(),
        type_maintenance: 'Révision annuelle',
        description: 'Révision complète du détendeur',
        cout: 75.00,
        prochaine_maintenance: Timestamp.fromDate(new Date('2026-01-15')),
      };

      const mockItem: InventoryItem = {
        id: mockItemId,
        clubId: mockClubId,
        typeId: 'type-1',
        nom: 'Test Item',
        numero_serie: 'SN-001',
        date_achat: Timestamp.now(),
        prix_achat: 100,
        statut: 'disponible',
        localisation: 'Test',
        photos: [],
        historique_maintenance: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockItem,
      });

      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await InventoryItemService.addMaintenanceRecord(mockClubId, mockItemId, maintenanceData);

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          historique_maintenance: expect.arrayContaining([
            expect.objectContaining({
              type_maintenance: 'Révision annuelle',
              cout: 75.00,
            }),
          ]),
        })
      );
    });
  });

  describe('getStats', () => {
    it('devrait calculer les statistiques du matériel', async () => {
      const mockItems: InventoryItem[] = [
        {
          id: 'item-1',
          clubId: mockClubId,
          typeId: 'type-1',
          nom: 'Item 1',
          numero_serie: 'SN-001',
          date_achat: Timestamp.now(),
          prix_achat: 450.00,
          statut: 'disponible',
          localisation: 'Salle',
          photos: [],
          historique_maintenance: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        {
          id: 'item-2',
          clubId: mockClubId,
          typeId: 'type-2',
          nom: 'Item 2',
          numero_serie: 'SN-002',
          date_achat: Timestamp.now(),
          prix_achat: 380.00,
          statut: 'prete',
          localisation: 'Salle',
          photos: [],
          historique_maintenance: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        {
          id: 'item-3',
          clubId: mockClubId,
          typeId: 'type-3',
          nom: 'Item 3',
          numero_serie: 'SN-003',
          date_achat: Timestamp.now(),
          prix_achat: 200.00,
          statut: 'en_maintenance',
          localisation: 'Atelier',
          photos: [],
          historique_maintenance: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
      ];

      (getDocs as jest.Mock).mockResolvedValue({
        docs: mockItems.map(item => ({
          id: item.id,
          data: () => item,
          exists: () => true,
        })),
      });

      const stats = await InventoryItemService.getStats(mockClubId);

      expect(stats.total).toBe(3);
      expect(stats.disponible).toBe(1);
      expect(stats.prete).toBe(1);
      expect(stats.en_maintenance).toBe(1);
      expect(stats.valeur_totale).toBe(1030.00);
    });
  });
});
