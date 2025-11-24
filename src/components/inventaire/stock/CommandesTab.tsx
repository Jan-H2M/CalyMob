import React, { useState, useEffect } from 'react';
import { Plus, ShoppingBag, CheckCircle, X, FileText } from 'lucide-react';
import { StockService } from '@/services/stockService';
import { PDFGenerationService } from '@/services/pdfGenerationService';
import { Order, StockProduct } from '@/types/inventory';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import { cn } from '@/utils/utils';

interface Props {
  onRefresh: () => void;
}

export function CommandesTab({ onRefresh }: Props) {
  const { clubId } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clubId) {
      loadData();
    }
  }, [clubId]);

  const loadData = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const [ordersData, productsData] = await Promise.all([
        StockService.getOrders(clubId),
        StockService.getProducts(clubId)
      ]);

      setOrders(ordersData);
      setProducts(productsData);
    } catch (error: any) {
      console.error('Erreur chargement commandes:', error);
      toast.error(error.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDelivered = async (orderId: string) => {
    if (!clubId) return;

    const confirmed = window.confirm('Marquer cette commande comme livrée ?');
    if (!confirmed) return;

    try {
      await StockService.markOrderDelivered(clubId, orderId, Timestamp.now());
      toast.success('Commande marquée livrée');
      loadData();
      onRefresh();
    } catch (error: any) {
      console.error('Erreur livraison commande:', error);
      toast.error(error.message || 'Erreur lors de la livraison');
    }
  };

  const getStatutBadge = (statut: string) => {
    const badges = {
      en_attente: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      commandee: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      livree: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      annulee: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    };

    const labels = {
      en_attente: 'En attente',
      commandee: 'Commandée',
      livree: 'Livrée',
      annulee: 'Annulée'
    };

    return (
      <span className={cn('px-2 py-1 text-xs font-medium rounded-full', badges[statut as keyof typeof badges])}>
        {labels[statut as keyof typeof labels]}
      </span>
    );
  };

  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return '-';
    return new Date(timestamp.toDate()).toLocaleDateString();
  };

  const handleDownloadPurchaseOrder = async (order: Order) => {
    if (!clubId) return;

    try {
      const product = products.find(p => p.id === order.productId);

      if (!product) {
        toast.error('Produit introuvable pour générer le bon de commande');
        return;
      }

      const clubInfo = {
        nom: 'Calypso Diving Club',
        adresse: 'Belgique',
        email: 'contact@calypso-diving.be',
        logo_url: '/logo-horizontal.jpg'
      };

      // Adapter le format pour le service PDF
      const productsForPDF = [{
        product,
        quantite: order.quantite,
        prix_unitaire: order.prix_achat_unitaire
      }];

      const pdfBlob = await PDFGenerationService.generatePurchaseOrder(
        order,
        productsForPDF,
        clubInfo
      );

      // Télécharger le fichier
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bon-commande-${order.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Bon de commande téléchargé');
    } catch (error: any) {
      console.error('Erreur génération bon:', error);
      toast.error(error.message || 'Erreur lors de la génération du bon de commande');
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
          Commandes fournisseur
        </h3>
        <div className="text-sm text-gray-500 dark:text-dark-text-secondary">
          Fonctionnalité complète à venir
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
          <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">
                Date commande
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">
                Fournisseur
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">
                Produits
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">
                Montant
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">
                Statut
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                  <ShoppingBag className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                  <p>Aucune commande enregistrée</p>
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-text-secondary">
                    {formatDate(order.date_commande)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                    {order.fournisseur}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-dark-text-secondary">
                    {order.productName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                    {order.montant_total.toFixed(2)} €
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatutBadge(order.statut)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleDownloadPurchaseOrder(order)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        title="Télécharger bon de commande"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      {order.statut === 'commandee' && (
                        <button
                          onClick={() => handleMarkDelivered(order.id)}
                          className="inline-flex items-center gap-1 text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                        >
                          <CheckCircle className="h-4 w-4" />
                          <span>Marquer livrée</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
