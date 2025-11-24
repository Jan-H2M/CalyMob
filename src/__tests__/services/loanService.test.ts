/**
 * Tests Unitaires - LoanService
 *
 * Teste le workflow complet des prêts (création, retour, caution)
 */

import { LoanService } from '@/services/loanService';
import { InventoryItemService } from '@/services/inventoryItemService';
import { InventoryConfigService } from '@/services/inventoryConfigService';
import { collection, getDocs, getDoc, setDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Loan, InventoryItem, ItemType, Checklist } from '@/types/inventory';

jest.mock('@/lib/firebase');
jest.mock('firebase/firestore');
jest.mock('firebase/storage');
jest.mock('@/services/inventoryItemService');
jest.mock('@/services/inventoryConfigService');

describe('LoanService', () => {
  const mockClubId = 'test-club-123';
  const mockLoanId = 'loan-456';
  const mockMemberId = 'member-789';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createLoan', () => {
    it('devrait créer un prêt avec snapshot des checklists', async () => {
      const mockItem: InventoryItem = {
        id: 'item-1',
        clubId: mockClubId,
        typeId: 'type-1',
        nom: 'Détendeur',
        numero_serie: 'SN-001',
        date_achat: Timestamp.now(),
        prix_achat: 450.00,
        statut: 'disponible',
        localisation: 'Salle',
        photos: [],
        historique_maintenance: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const mockItemType: ItemType = {
        id: 'type-1',
        clubId: mockClubId,
        nom: 'Détendeur',
        description: 'Détendeur de plongée',
        valeur_caution_defaut: 50.00,
        checklistIds: ['checklist-1'],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const mockChecklist: Checklist = {
        id: 'checklist-1',
        clubId: mockClubId,
        nom: 'Checklist détendeur',
        description: 'Vérifications avant/après prêt',
        items: [
          { id: 'check-1', texte: 'État général OK', ordre: 1 },
          { id: 'check-2', texte: 'Joints OK', ordre: 2 },
        ],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (InventoryItemService.getItemById as jest.Mock).mockResolvedValue(mockItem);
      (InventoryConfigService.getItemTypeById as jest.Mock).mockResolvedValue(mockItemType);
      (InventoryConfigService.getChecklistById as jest.Mock).mockResolvedValue(mockChecklist);
      (InventoryItemService.updateItem as jest.Mock).mockResolvedValue(undefined);

      (doc as jest.Mock).mockReturnValue({ id: 'new-loan-id' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const loanData: Omit<Loan, 'id' | 'createdAt' | 'updatedAt' | 'checklist_snapshot'> = {
        clubId: mockClubId,
        memberId: mockMemberId,
        itemIds: ['item-1'],
        date_pret: Timestamp.now(),
        date_retour_prevue: Timestamp.fromDate(new Date('2025-02-01')),
        statut: 'en_cours',
        montant_caution: 50.00,
        caution_payee: true,
      };

      const result = await LoanService.createLoan(mockClubId, loanData);

      expect(result).toBe('new-loan-id');
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'new-loan-id',
          memberId: mockMemberId,
          statut: 'en_cours',
          montant_caution: 50.00,
          checklist_snapshot: expect.arrayContaining([
            expect.objectContaining({
              itemId: 'item-1',
              checklistId: 'checklist-1',
              checklistNom: 'Checklist détendeur',
              items: expect.arrayContaining([
                expect.objectContaining({
                  id: 'check-1',
                  texte: 'État général OK',
                  checked_depart: false,
                  checked_retour: false,
                }),
              ]),
            }),
          ]),
        })
      );

      expect(InventoryItemService.updateItem).toHaveBeenCalledWith(
        mockClubId,
        'item-1',
        { statut: 'prete' }
      );
    });

    it('devrait calculer automatiquement le montant de caution', async () => {
      const mockItem: InventoryItem = {
        id: 'item-1',
        clubId: mockClubId,
        typeId: 'type-1',
        nom: 'Détendeur',
        numero_serie: 'SN-001',
        date_achat: Timestamp.now(),
        prix_achat: 450.00,
        statut: 'disponible',
        localisation: 'Salle',
        photos: [],
        historique_maintenance: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const mockItemType: ItemType = {
        id: 'type-1',
        clubId: mockClubId,
        nom: 'Détendeur',
        description: 'Détendeur de plongée',
        valeur_caution_defaut: 50.00,
        checklistIds: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (InventoryItemService.getItemById as jest.Mock).mockResolvedValue(mockItem);
      (InventoryConfigService.getItemTypeById as jest.Mock).mockResolvedValue(mockItemType);

      const cautionAmount = await LoanService.calculateCautionAmount(mockClubId, ['item-1']);

      expect(cautionAmount).toBe(50.00);
    });

    it('devrait calculer la caution pour plusieurs items', async () => {
      const mockItems = [
        {
          id: 'item-1',
          typeId: 'type-1',
          prix_achat: 450.00,
        },
        {
          id: 'item-2',
          typeId: 'type-2',
          prix_achat: 380.00,
        },
      ];

      const mockTypes = [
        {
          id: 'type-1',
          valeur_caution_defaut: 50.00,
        },
        {
          id: 'type-2',
          valeur_caution_defaut: 40.00,
        },
      ];

      (InventoryItemService.getItemById as jest.Mock)
        .mockResolvedValueOnce(mockItems[0])
        .mockResolvedValueOnce(mockItems[1]);

      (InventoryConfigService.getItemTypeById as jest.Mock)
        .mockResolvedValueOnce(mockTypes[0])
        .mockResolvedValueOnce(mockTypes[1]);

      const cautionAmount = await LoanService.calculateCautionAmount(mockClubId, ['item-1', 'item-2']);

      expect(cautionAmount).toBe(90.00); // 50 + 40
    });
  });

  describe('returnLoan', () => {
    it('devrait retourner un prêt et rembourser la caution complète', async () => {
      const mockLoan: Loan = {
        id: mockLoanId,
        clubId: mockClubId,
        memberId: mockMemberId,
        itemIds: ['item-1'],
        date_pret: Timestamp.now(),
        date_retour_prevue: Timestamp.fromDate(new Date('2025-02-01')),
        statut: 'en_cours',
        montant_caution: 50.00,
        caution_payee: true,
        checklist_snapshot: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockLoan,
      });

      (updateDoc as jest.Mock).mockResolvedValue(undefined);
      (InventoryItemService.updateItem as jest.Mock).mockResolvedValue(undefined);

      const returnData = {
        checklist_retour_remplie: [],
        etat_retour: 'bon' as const,
        commentaire_retour: 'Matériel en bon état',
      };

      await LoanService.returnLoan(mockClubId, mockLoanId, returnData);

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statut: 'retourne',
          date_retour_effective: expect.anything(),
          caution_retournee: 50.00, // Caution complète
          etat_retour: 'bon',
        })
      );

      expect(InventoryItemService.updateItem).toHaveBeenCalledWith(
        mockClubId,
        'item-1',
        { statut: 'disponible' }
      );
    });

    it('devrait calculer une caution réduite si matériel endommagé', async () => {
      const mockLoan: Loan = {
        id: mockLoanId,
        clubId: mockClubId,
        memberId: mockMemberId,
        itemIds: ['item-1'],
        date_pret: Timestamp.now(),
        date_retour_prevue: Timestamp.fromDate(new Date('2025-02-01')),
        statut: 'en_cours',
        montant_caution: 50.00,
        caution_payee: true,
        checklist_snapshot: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockLoan,
      });

      (updateDoc as jest.Mock).mockResolvedValue(undefined);
      (InventoryItemService.updateItem as jest.Mock).mockResolvedValue(undefined);

      const returnData = {
        checklist_retour_remplie: [],
        etat_retour: 'endommage' as const,
        montant_retenu: 20.00, // Rétention de 20€
        commentaire_retour: 'Joint HP endommagé',
      };

      await LoanService.returnLoan(mockClubId, mockLoanId, returnData);

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statut: 'retourne',
          caution_retournee: 30.00, // 50 - 20
          montant_retenu: 20.00,
          etat_retour: 'endommage',
        })
      );
    });

    it('ne devrait pas rembourser si matériel perdu', async () => {
      const mockLoan: Loan = {
        id: mockLoanId,
        clubId: mockClubId,
        memberId: mockMemberId,
        itemIds: ['item-1'],
        date_pret: Timestamp.now(),
        date_retour_prevue: Timestamp.fromDate(new Date('2025-02-01')),
        statut: 'en_cours',
        montant_caution: 50.00,
        caution_payee: true,
        checklist_snapshot: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockLoan,
      });

      (updateDoc as jest.Mock).mockResolvedValue(undefined);
      (InventoryItemService.updateItem as jest.Mock).mockResolvedValue(undefined);

      const returnData = {
        checklist_retour_remplie: [],
        etat_retour: 'perdu' as const,
        montant_retenu: 50.00,
        commentaire_retour: 'Matériel perdu',
      };

      await LoanService.returnLoan(mockClubId, mockLoanId, returnData);

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statut: 'retourne',
          caution_retournee: 0.00, // Aucun remboursement
          montant_retenu: 50.00,
          etat_retour: 'perdu',
        })
      );
    });
  });

  describe('cancelLoan', () => {
    it('devrait annuler un prêt et remettre les items disponibles', async () => {
      const mockLoan: Loan = {
        id: mockLoanId,
        clubId: mockClubId,
        memberId: mockMemberId,
        itemIds: ['item-1', 'item-2'],
        date_pret: Timestamp.now(),
        date_retour_prevue: Timestamp.fromDate(new Date('2025-02-01')),
        statut: 'en_cours',
        montant_caution: 90.00,
        caution_payee: true,
        checklist_snapshot: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockLoan,
      });

      (updateDoc as jest.Mock).mockResolvedValue(undefined);
      (InventoryItemService.updateItem as jest.Mock).mockResolvedValue(undefined);

      await LoanService.cancelLoan(mockClubId, mockLoanId, 'Annulation demandée par le membre');

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          statut: 'annule',
          commentaire_annulation: 'Annulation demandée par le membre',
        })
      );

      expect(InventoryItemService.updateItem).toHaveBeenCalledTimes(2);
      expect(InventoryItemService.updateItem).toHaveBeenCalledWith(
        mockClubId,
        'item-1',
        { statut: 'disponible' }
      );
      expect(InventoryItemService.updateItem).toHaveBeenCalledWith(
        mockClubId,
        'item-2',
        { statut: 'disponible' }
      );
    });
  });

  describe('uploadSignature', () => {
    it('devrait uploader une signature vers Firebase Storage', async () => {
      const mockSignatureBlob = new Blob(['signature-data'], { type: 'image/png' });
      const mockFile = new File([mockSignatureBlob], 'signature.png', { type: 'image/png' });
      const mockSignatureUrl = 'https://storage.example.com/signature.png';

      (uploadBytes as jest.Mock).mockResolvedValue(undefined);
      (getDownloadURL as jest.Mock).mockResolvedValue(mockSignatureUrl);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      const result = await LoanService.uploadSignature(mockClubId, mockLoanId, mockFile);

      expect(result).toBe(mockSignatureUrl);
      expect(ref).toHaveBeenCalled();
      expect(uploadBytes).toHaveBeenCalled();
      expect(getDownloadURL).toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          signature_url: mockSignatureUrl,
        })
      );
    });
  });

  describe('getLoansNeedingReturn', () => {
    it('devrait récupérer les prêts en retard', async () => {
      const now = new Date('2025-01-20');
      const pastDate = new Date('2025-01-10'); // 10 days ago
      const futureDate = new Date('2025-01-30'); // 10 days in future

      const mockLoans: Loan[] = [
        {
          id: 'loan-1',
          clubId: mockClubId,
          memberId: mockMemberId,
          itemIds: ['item-1'],
          date_pret: Timestamp.now(),
          date_retour_prevue: Timestamp.fromDate(pastDate), // EN RETARD
          statut: 'en_cours',
          montant_caution: 50.00,
          caution_payee: true,
          checklist_snapshot: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        {
          id: 'loan-2',
          clubId: mockClubId,
          memberId: mockMemberId,
          itemIds: ['item-2'],
          date_pret: Timestamp.now(),
          date_retour_prevue: Timestamp.fromDate(futureDate), // OK
          statut: 'en_cours',
          montant_caution: 40.00,
          caution_payee: true,
          checklist_snapshot: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
      ];

      (getDocs as jest.Mock).mockResolvedValue({
        docs: mockLoans.map(loan => ({
          id: loan.id,
          data: () => loan,
          exists: () => true,
        })),
      });

      // Mock Date.now() pour les tests
      jest.spyOn(global.Date, 'now').mockReturnValue(now.getTime());

      const lateLoans = await LoanService.getLoansNeedingReturn(mockClubId);

      expect(lateLoans).toHaveLength(1);
      expect(lateLoans[0].id).toBe('loan-1');
    });
  });

  describe('getStats', () => {
    it('devrait calculer les statistiques des prêts', async () => {
      const mockLoans: Loan[] = [
        {
          id: 'loan-1',
          clubId: mockClubId,
          memberId: mockMemberId,
          itemIds: ['item-1'],
          date_pret: Timestamp.now(),
          date_retour_prevue: Timestamp.fromDate(new Date('2025-02-01')),
          statut: 'en_cours',
          montant_caution: 50.00,
          caution_payee: true,
          checklist_snapshot: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        {
          id: 'loan-2',
          clubId: mockClubId,
          memberId: mockMemberId,
          itemIds: ['item-2'],
          date_pret: Timestamp.now(),
          date_retour_prevue: Timestamp.fromDate(new Date('2025-01-10')), // Late
          statut: 'en_cours',
          montant_caution: 40.00,
          caution_payee: true,
          checklist_snapshot: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        {
          id: 'loan-3',
          clubId: mockClubId,
          memberId: mockMemberId,
          itemIds: ['item-3'],
          date_pret: Timestamp.now(),
          date_retour_prevue: Timestamp.fromDate(new Date('2025-01-15')),
          date_retour_effective: Timestamp.now(),
          statut: 'retourne',
          montant_caution: 30.00,
          caution_payee: true,
          caution_retournee: 30.00,
          checklist_snapshot: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
      ];

      (getDocs as jest.Mock).mockResolvedValue({
        docs: mockLoans.map(loan => ({
          id: loan.id,
          data: () => loan,
          exists: () => true,
        })),
      });

      jest.spyOn(global.Date, 'now').mockReturnValue(new Date('2025-01-20').getTime());

      const stats = await LoanService.getStats(mockClubId);

      expect(stats.total_en_cours).toBe(2);
      expect(stats.total_retourne).toBe(1);
      expect(stats.en_retard).toBe(1);
      expect(stats.cautions_en_cours).toBe(90.00); // 50 + 40
    });
  });
});
