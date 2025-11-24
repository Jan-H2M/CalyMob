import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { StockProduct, Sale, Order } from '@/types/inventory';
import { InventoryTransactionService } from './inventoryTransactionService';

/**
 * Service pour gérer les produits en stock dans Firebase
 *
 * Collections:
 * - /clubs/{clubId}/stock_products/{productId} - Produits en stock
 * - /clubs/{clubId}/stock_sales/{saleId} - Ventes
 * - /clubs/{clubId}/stock_orders/{orderId} - Commandes fournisseur
 */
export class StockService {

  // ========================================
  // CRUD PRODUITS
  // ========================================

  /**
   * Récupérer tous les produits avec filtres optionnels
   */
  static async getProducts(
    clubId: string,
    filters?: {
      categorie?: string;
      search?: string;
    }
  ): Promise<StockProduct[]> {
    try {
      const productsRef = collection(db, 'clubs', clubId, 'stock_products');
      let q = query(productsRef, orderBy('nom', 'asc'));

      // Appliquer filtres Firestore
      if (filters?.categorie) {
        q = query(productsRef, where('categorie', '==', filters.categorie), orderBy('nom', 'asc'));
      }

      const snapshot = await getDocs(q);
      let products = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as StockProduct));

      // Filtres client-side
      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        products = products.filter(p =>
          p.nom.toLowerCase().includes(searchLower) ||
          p.reference?.toLowerCase().includes(searchLower)
        );
      }

      return products;
    } catch (error) {
      console.error('Erreur chargement produits:', error);
      throw error;
    }
  }

  /**
   * Récupérer un produit par ID
   */
  static async getProductById(clubId: string, productId: string): Promise<StockProduct | null> {
    try {
      const productRef = doc(db, 'clubs', clubId, 'stock_products', productId);
      const snapshot = await getDoc(productRef);

      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: snapshot.id,
        ...snapshot.data()
      } as StockProduct;
    } catch (error) {
      console.error('Erreur chargement produit:', error);
      throw error;
    }
  }

  /**
   * Créer un nouveau produit
   */
  static async createProduct(
    clubId: string,
    data: Omit<StockProduct, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    try {
      const productsRef = collection(db, 'clubs', clubId, 'stock_products');
      const newProductRef = doc(productsRef);

      const newProduct: StockProduct = {
        ...data,
        id: newProductRef.id,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(newProductRef, newProduct);

      console.log(`Produit créé: ${newProduct.nom} (${newProduct.id})`);
      return newProductRef.id;
    } catch (error) {
      console.error('Erreur création produit:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour un produit existant
   */
  static async updateProduct(
    clubId: string,
    productId: string,
    data: Partial<Omit<StockProduct, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const productRef = doc(db, 'clubs', clubId, 'stock_products', productId);

      await updateDoc(productRef, {
        ...data,
        updatedAt: serverTimestamp()
      });

      console.log(`Produit mis à jour: ${productId}`);
    } catch (error) {
      console.error('Erreur mise à jour produit:', error);
      throw error;
    }
  }

  /**
   * Supprimer un produit
   */
  static async deleteProduct(clubId: string, productId: string): Promise<void> {
    try {
      const productRef = doc(db, 'clubs', clubId, 'stock_products', productId);
      await deleteDoc(productRef);

      console.log(`Produit supprimé: ${productId}`);
    } catch (error) {
      console.error('Erreur suppression produit:', error);
      throw error;
    }
  }

  // ========================================
  // GESTION STOCK
  // ========================================

  /**
   * Ajuster le stock d'un produit
   *
   * @param adjustment Quantité à ajouter (positif) ou retirer (négatif)
   * @param reason Raison de l'ajustement (vente, commande, inventaire, perte, etc.)
   */
  static async adjustStock(
    clubId: string,
    productId: string,
    adjustment: number,
    reason: string
  ): Promise<void> {
    try {
      const product = await this.getProductById(clubId, productId);
      if (!product) {
        throw new Error('Produit introuvable');
      }

      const newQuantity = product.quantite_stock + adjustment;
      if (newQuantity < 0) {
        throw new Error('Stock insuffisant');
      }

      const productRef = doc(db, 'clubs', clubId, 'stock_products', productId);
      await updateDoc(productRef, {
        quantite_stock: newQuantity,
        updatedAt: serverTimestamp()
      });

      console.log(`Stock ajusté pour ${productId}: ${adjustment} (${reason})`);
    } catch (error) {
      console.error('Erreur ajustement stock:', error);
      throw error;
    }
  }

  /**
   * Récupérer les produits avec stock bas (alerte)
   */
  static async getLowStockProducts(clubId: string): Promise<StockProduct[]> {
    try {
      const products = await this.getProducts(clubId);
      return products.filter(p => p.quantite_stock <= p.seuil_alerte);
    } catch (error) {
      console.error('Erreur chargement produits stock bas:', error);
      throw error;
    }
  }

  // ========================================
  // VENTES
  // ========================================

  /**
   * Récupérer toutes les ventes avec filtres optionnels
   */
  static async getSales(
    clubId: string,
    filters?: {
      productId?: string;
      memberId?: string;
      fiscal_year_id?: string;
    }
  ): Promise<Sale[]> {
    try {
      const salesRef = collection(db, 'clubs', clubId, 'stock_sales');
      let q = query(salesRef, orderBy('date_vente', 'desc'));

      // Appliquer filtres Firestore
      if (filters?.productId) {
        q = query(salesRef, where('productId', '==', filters.productId), orderBy('date_vente', 'desc'));
      }

      if (filters?.memberId) {
        q = query(salesRef, where('memberId', '==', filters.memberId), orderBy('date_vente', 'desc'));
      }

      if (filters?.fiscal_year_id) {
        q = query(salesRef, where('fiscal_year_id', '==', filters.fiscal_year_id), orderBy('date_vente', 'desc'));
      }

      const snapshot = await getDocs(q);
      const sales = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Sale));

      return sales;
    } catch (error) {
      console.error('Erreur chargement ventes:', error);
      throw error;
    }
  }

  /**
   * Créer une nouvelle vente
   *
   * Workflow:
   * 1. Vérifier stock disponible
   * 2. Créer la vente
   * 3. Décrémenter le stock
   * 4. Créer une transaction bancaire automatiquement (intégration comptable)
   */
  static async createSale(
    clubId: string,
    data: Omit<Sale, 'id' | 'createdAt' | 'updatedAt'>,
    options?: {
      createTransaction?: boolean; // Par défaut: true
      bankAccount?: string;
    }
  ): Promise<string> {
    try {
      // Vérifier stock disponible
      const product = await this.getProductById(clubId, data.productId);
      if (!product) {
        throw new Error('Produit introuvable');
      }

      if (product.quantite_stock < data.quantite) {
        throw new Error(`Stock insuffisant (disponible: ${product.quantite_stock}, demandé: ${data.quantite})`);
      }

      // Créer la vente
      const salesRef = collection(db, 'clubs', clubId, 'stock_sales');
      const newSaleRef = doc(salesRef);

      const newSale: Sale = {
        ...data,
        id: newSaleRef.id,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(newSaleRef, newSale);

      // Décrémenter le stock
      await this.adjustStock(clubId, data.productId, -data.quantite, `Vente ${newSale.id}`);

      // Créer transaction bancaire automatiquement (intégration comptable)
      if (options?.createTransaction !== false) {
        try {
          await InventoryTransactionService.createTransactionFromSale(clubId, newSale, {
            bankAccount: options?.bankAccount,
            autoReconcile: true
          });
          console.log(`Transaction bancaire créée pour vente ${newSale.id}`);
        } catch (txError) {
          console.error('Erreur création transaction bancaire:', txError);
          // Ne pas bloquer la vente si la transaction échoue
        }
      }

      console.log(`Vente créée: ${newSale.id} (${data.quantite}x ${product.nom})`);
      return newSaleRef.id;
    } catch (error) {
      console.error('Erreur création vente:', error);
      throw error;
    }
  }

  /**
   * Annuler une vente (soft delete + remboursement stock)
   */
  static async cancelSale(clubId: string, saleId: string, reason: string): Promise<void> {
    try {
      const saleRef = doc(db, 'clubs', clubId, 'stock_sales', saleId);
      const sale = await getDoc(saleRef);

      if (!sale.exists()) {
        throw new Error('Vente introuvable');
      }

      const saleData = sale.data() as Sale;

      // Rembourser le stock
      await this.adjustStock(clubId, saleData.productId, saleData.quantite, `Annulation vente ${saleId}: ${reason}`);

      // Marquer la vente comme annulée
      await updateDoc(saleRef, {
        notes: `ANNULÉE: ${reason}`,
        updatedAt: serverTimestamp()
      });

      console.log(`Vente annulée: ${saleId}`);
    } catch (error) {
      console.error('Erreur annulation vente:', error);
      throw error;
    }
  }

  // ========================================
  // COMMANDES FOURNISSEUR
  // ========================================

  /**
   * Récupérer toutes les commandes avec filtres optionnels
   */
  static async getOrders(
    clubId: string,
    filters?: {
      statut?: 'en_attente' | 'commandee' | 'livree' | 'annulee';
      fiscal_year_id?: string;
    }
  ): Promise<Order[]> {
    try {
      const ordersRef = collection(db, 'clubs', clubId, 'stock_orders');
      let q = query(ordersRef, orderBy('date_commande', 'desc'));

      // Appliquer filtres Firestore
      if (filters?.statut) {
        q = query(ordersRef, where('statut', '==', filters.statut), orderBy('date_commande', 'desc'));
      }

      if (filters?.fiscal_year_id) {
        q = query(ordersRef, where('fiscal_year_id', '==', filters.fiscal_year_id), orderBy('date_commande', 'desc'));
      }

      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Order));

      return orders;
    } catch (error) {
      console.error('Erreur chargement commandes:', error);
      throw error;
    }
  }

  /**
   * Créer une nouvelle commande
   */
  static async createOrder(
    clubId: string,
    data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    try {
      const ordersRef = collection(db, 'clubs', clubId, 'stock_orders');
      const newOrderRef = doc(ordersRef);

      const newOrder: Order = {
        ...data,
        id: newOrderRef.id,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(newOrderRef, newOrder);

      console.log(`Commande créée: ${newOrder.id} (${data.items.length} produits)`);
      return newOrderRef.id;
    } catch (error) {
      console.error('Erreur création commande:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour une commande
   */
  static async updateOrder(
    clubId: string,
    orderId: string,
    data: Partial<Omit<Order, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const orderRef = doc(db, 'clubs', clubId, 'stock_orders', orderId);

      await updateDoc(orderRef, {
        ...data,
        updatedAt: serverTimestamp()
      });

      console.log(`Commande mise à jour: ${orderId}`);
    } catch (error) {
      console.error('Erreur mise à jour commande:', error);
      throw error;
    }
  }

  /**
   * Marquer une commande comme livrée et incrémenter le stock
   */
  static async markOrderDelivered(
    clubId: string,
    orderId: string,
    dateLivraison: Timestamp
  ): Promise<void> {
    try {
      const orderRef = doc(db, 'clubs', clubId, 'stock_orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        throw new Error('Commande introuvable');
      }

      const order = orderSnap.data() as Order;

      if (order.statut === 'livree') {
        throw new Error('Commande déjà livrée');
      }

      // Incrémenter le stock pour chaque produit
      for (const item of order.items) {
        await this.adjustStock(clubId, item.productId, item.quantite, `Livraison commande ${orderId}`);
      }

      // Mettre à jour la commande
      await updateDoc(orderRef, {
        statut: 'livree',
        date_livraison: dateLivraison,
        updatedAt: serverTimestamp()
      });

      console.log(`Commande livrée: ${orderId}`);
    } catch (error) {
      console.error('Erreur livraison commande:', error);
      throw error;
    }
  }

  /**
   * Annuler une commande
   */
  static async cancelOrder(clubId: string, orderId: string, reason: string): Promise<void> {
    try {
      const orderRef = doc(db, 'clubs', clubId, 'stock_orders', orderId);

      await updateDoc(orderRef, {
        statut: 'annulee',
        notes: `ANNULÉE: ${reason}`,
        updatedAt: serverTimestamp()
      });

      console.log(`Commande annulée: ${orderId}`);
    } catch (error) {
      console.error('Erreur annulation commande:', error);
      throw error;
    }
  }

  // ========================================
  // STATISTIQUES
  // ========================================

  /**
   * Récupérer les statistiques du stock
   */
  static async getStats(clubId: string): Promise<{
    total_produits: number;
    valeur_stock_totale: number;
    produits_alerte: number;
    ventes_mois: number;
    ca_mois: number;
    commandes_en_cours: number;
  }> {
    try {
      const [products, sales, orders] = await Promise.all([
        this.getProducts(clubId),
        this.getSales(clubId),
        this.getOrders(clubId)
      ]);

      // Ventes du mois en cours
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const salesThisMonth = sales.filter(s =>
        s.date_vente.toDate() >= firstDayOfMonth
      );

      const stats = {
        total_produits: products.length,
        valeur_stock_totale: products.reduce((sum, p) => sum + (p.quantite_stock * p.prix_achat), 0),
        produits_alerte: products.filter(p => p.quantite_stock <= p.seuil_alerte).length,
        ventes_mois: salesThisMonth.length,
        ca_mois: salesThisMonth.reduce((sum, s) => sum + s.montant_total, 0),
        commandes_en_cours: orders.filter(o => o.statut === 'en_attente' || o.statut === 'commandee').length
      };

      return stats;
    } catch (error) {
      console.error('Erreur chargement statistiques stock:', error);
      throw error;
    }
  }

  /**
   * Récupérer les produits les plus vendus
   */
  static async getTopSellingProducts(
    clubId: string,
    limit: number = 10
  ): Promise<Array<{ product: StockProduct; total_ventes: number; ca_total: number }>> {
    try {
      const [products, sales] = await Promise.all([
        this.getProducts(clubId),
        this.getSales(clubId)
      ]);

      // Grouper ventes par produit
      const salesByProduct = new Map<string, { quantite: number; ca: number }>();

      sales.forEach(sale => {
        const existing = salesByProduct.get(sale.productId) || { quantite: 0, ca: 0 };
        salesByProduct.set(sale.productId, {
          quantite: existing.quantite + sale.quantite,
          ca: existing.ca + sale.montant_total
        });
      });

      // Créer tableau avec produits
      const results = Array.from(salesByProduct.entries())
        .map(([productId, data]) => {
          const product = products.find(p => p.id === productId);
          if (!product) return null;
          return {
            product,
            total_ventes: data.quantite,
            ca_total: data.ca
          };
        })
        .filter(r => r !== null) as Array<{ product: StockProduct; total_ventes: number; ca_total: number }>;

      // Trier par quantité vendue
      results.sort((a, b) => b.total_ventes - a.total_ventes);

      return results.slice(0, limit);
    } catch (error) {
      console.error('Erreur chargement produits les plus vendus:', error);
      throw error;
    }
  }
}
