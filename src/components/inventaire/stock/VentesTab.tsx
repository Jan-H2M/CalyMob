import React, { useState, useEffect } from 'react';
import { Plus, ShoppingCart, FileText } from 'lucide-react';
import { StockService } from '@/services/stockService';
import { getMembres } from '@/services/membreService';
import { PDFGenerationService } from '@/services/pdfGenerationService';
import { EmailService } from '@/services/emailService';
import { Sale, StockProduct } from '@/types/inventory';
import { Membre } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';

interface Props {
  onRefresh: () => void;
}

export function VentesTab({ onRefresh }: Props) {
  const { clubId } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [members, setMembers] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(true);

  // New sale form
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    productId: '',
    memberId: '',
    quantite: 1,
    date_vente: new Date().toISOString().split('T')[0],
    sendEmail: true  // Par défaut, envoyer l'email
  });

  useEffect(() => {
    if (clubId) {
      loadData();
    }
  }, [clubId]);

  const loadData = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const [salesData, productsData, membersData] = await Promise.all([
        StockService.getSales(clubId),
        StockService.getProducts(clubId),
        getMembres(clubId, { member_status: 'active' })
      ]);

      setSales(salesData);
      setProducts(productsData);
      setMembers(membersData);
    } catch (error: any) {
      console.error('Erreur chargement ventes:', error);
      toast.error(error.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSale = async () => {
    if (!clubId) return;

    if (!formData.productId || !formData.memberId || formData.quantite <= 0) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    const product = products.find(p => p.id === formData.productId);
    const member = members.find(m => m.id === formData.memberId);
    if (!product || !member) return;

    try {
      const saleData = {
        productId: formData.productId,
        memberId: formData.memberId,
        quantite: formData.quantite,
        prix_unitaire: product.prix_vente,
        montant_total: product.prix_vente * formData.quantite,
        date_vente: Timestamp.fromDate(new Date(formData.date_vente)),
        fiscal_year_id: new Date().getFullYear().toString()
      };

      const saleId = await StockService.createSale(clubId, saleData);
      toast.success('Vente enregistrée');

      // Envoyer email reçu si demandé (async, ne pas bloquer)
      if (formData.sendEmail) {
        try {
          const clubInfo = {
            nom: 'Calypso Diving Club',
            email: 'contact@calypso-diving.be'
          };

          const fullSale = {
            ...saleData,
            id: saleId,
            memberName: `${member.nom} ${member.prenom}`,
            productName: product.nom,
            mode_paiement: 'especes' as const,
            createdAt: Timestamp.now(),
            createdBy: member.id
          };

          const emailResult = await EmailService.sendSaleReceipt(
            clubId,
            fullSale,
            product,
            member,
            undefined, // receiptPdfUrl - TODO: upload PDF vers Storage
            clubInfo
          );

          if (emailResult.success) {
            toast.success('Reçu envoyé par email', { duration: 2000 });
          } else {
            console.warn('[VentesTab] Échec envoi email:', emailResult.error);
          }
        } catch (emailError) {
          console.error('[VentesTab] Erreur envoi email:', emailError);
          // Ne pas bloquer le workflow
        }
      }

      // Reset form
      setFormData({
        productId: '',
        memberId: '',
        quantite: 1,
        date_vente: new Date().toISOString().split('T')[0],
        sendEmail: true
      });
      setShowForm(false);

      loadData();
      onRefresh();
    } catch (error: any) {
      console.error('Erreur création vente:', error);
      toast.error(error.message || 'Erreur lors de la création');
    }
  };

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product?.nom || 'Produit inconnu';
  };

  const getMemberName = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    return member ? `${member.nom} ${member.prenom}` : 'Membre inconnu';
  };

  const formatDate = (timestamp: Timestamp) => {
    return new Date(timestamp.toDate()).toLocaleDateString();
  };

  const handleDownloadReceipt = async (sale: Sale) => {
    if (!clubId) return;

    try {
      const product = products.find(p => p.id === sale.productId);
      const member = members.find(m => m.id === sale.memberId);

      if (!product || !member) {
        toast.error('Données incomplètes pour générer le reçu');
        return;
      }

      const clubInfo = {
        nom: 'Calypso Diving Club',
        adresse: 'Belgique',
        email: 'contact@calypso-diving.be',
        logo_url: '/logo-horizontal.jpg'
      };

      const pdfBlob = await PDFGenerationService.generateSaleReceipt(
        sale,
        product,
        member,
        clubInfo
      );

      // Télécharger le fichier
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recu-vente-${sale.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Reçu téléchargé');
    } catch (error: any) {
      console.error('Erreur génération reçu:', error);
      toast.error(error.message || 'Erreur lors de la génération du reçu');
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
          Historique des ventes
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle vente
        </button>
      </div>

      {/* New sale form */}
      {showForm && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-green-900 dark:text-green-200 mb-4">
            Enregistrer une vente
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select
              value={formData.productId}
              onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
              className="px-3 py-2 border border-green-300 dark:border-green-700 rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
            >
              <option value="">Sélectionner produit</option>
              {products.filter(p => p.quantite_stock > 0).map(product => (
                <option key={product.id} value={product.id}>
                  {product.nom} ({product.quantite_stock} dispo) - {product.prix_vente.toFixed(2)} €
                </option>
              ))}
            </select>

            <select
              value={formData.memberId}
              onChange={(e) => setFormData({ ...formData, memberId: e.target.value })}
              className="px-3 py-2 border border-green-300 dark:border-green-700 rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
            >
              <option value="">Sélectionner membre</option>
              {members.map(member => (
                <option key={member.id} value={member.id}>
                  {member.nom} {member.prenom}
                </option>
              ))}
            </select>

            <input
              type="number"
              value={formData.quantite}
              onChange={(e) => setFormData({ ...formData, quantite: parseInt(e.target.value) || 1 })}
              min="1"
              placeholder="Quantité"
              className="px-3 py-2 border border-green-300 dark:border-green-700 rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
            />

            <input
              type="date"
              value={formData.date_vente}
              onChange={(e) => setFormData({ ...formData, date_vente: e.target.value })}
              className="px-3 py-2 border border-green-300 dark:border-green-700 rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
            />
          </div>

          {/* Checkbox pour envoi email */}
          <div className="mt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.sendEmail}
                onChange={(e) => setFormData({ ...formData, sendEmail: e.target.checked })}
                className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
              />
              <span className="text-sm font-medium text-green-900 dark:text-green-200">
                Envoyer le reçu par email
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleCreateSale}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
            >
              Enregistrer
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-primary border border-gray-300 dark:border-dark-border rounded-md hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
          <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">
                Produit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">
                Membre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">
                Quantité
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">
                Montant
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
            {sales.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                  <ShoppingCart className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                  <p>Aucune vente enregistrée</p>
                </td>
              </tr>
            ) : (
              sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-text-secondary">
                    {formatDate(sale.date_vente)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                    {getProductName(sale.productId)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-text-secondary">
                    {getMemberName(sale.memberId)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-dark-text-primary">
                    {sale.quantite}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                    {sale.montant_total.toFixed(2)} €
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleDownloadReceipt(sale)}
                      className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                      title="Télécharger reçu"
                    >
                      <FileText className="h-4 w-4" />
                    </button>
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
