/**
 * Client API Mollie (Gen2 compatible)
 * Gere la communication avec l'API Mollie v2
 *
 * Methodes de paiement activees pour Calypso Diving Club:
 * - bancontact (Bancontact - Belgique)
 * - kbc (KBC/CBC Payment Button - Belgique)
 * - belfius (Belfius Direct Net - Belgique)
 * - creditcard (Cartes de credit/debit)
 * - applepay (Apple Pay)
 */

const axios = require('axios');

const MOLLIE_API_URL = 'https://api.mollie.com/v2';

/**
 * Client API Mollie
 * En Gen2, la cle API est passee en parametre du constructeur
 */
class MollieClient {
  /**
   * @param {string} apiKey - Cle API Mollie (obtenue via defineSecret)
   */
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Mollie API key is required');
    }

    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: MOLLIE_API_URL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 secondes
    });
  }

  /**
   * Creer un paiement
   * @param {Object} paymentData - Donnees du paiement
   * @param {Object} paymentData.amount - { currency: 'EUR', value: '25.00' }
   * @param {string} paymentData.description - Description du paiement
   * @param {string} paymentData.redirectUrl - URL de retour apres paiement
   * @param {string} [paymentData.webhookUrl] - URL webhook pour notifications
   * @param {string} [paymentData.method] - Methode de paiement (bancontact, kbc, etc.)
   * @param {string} [paymentData.locale] - Locale (nl_BE, fr_BE, en_US)
   * @param {Object} [paymentData.metadata] - Donnees personnalisees
   * @returns {Promise<Object>} - Reponse Mollie avec id et _links.checkout.href
   */
  async createPayment(paymentData) {
    try {
      const response = await this.client.post('/payments', paymentData);
      return response.data;
    } catch (error) {
      console.error('Erreur API Mollie createPayment:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.detail ||
                          error.response?.data?.title ||
                          'Erreur lors de la creation du paiement';
      throw new Error(errorMessage);
    }
  }

  /**
   * Verifier le statut d'un paiement
   * @param {string} paymentId - ID du paiement Mollie (tr_xxx)
   * @returns {Promise<Object>} - Statut du paiement
   *
   * Statuts possibles:
   * - open: Paiement cree, en attente du client
   * - pending: Client en cours de paiement
   * - paid: Paiement reussi
   * - failed: Paiement echoue
   * - canceled: Annule par le client
   * - expired: Expire (non complete a temps)
   */
  async getPaymentStatus(paymentId) {
    try {
      const response = await this.client.get(`/payments/${paymentId}`);
      return response.data;
    } catch (error) {
      console.error('Erreur API Mollie getPaymentStatus:', error.response?.data || error.message);
      throw new Error('Erreur lors de la verification du statut');
    }
  }

  /**
   * Obtenir les methodes de paiement disponibles
   * @param {Object} [options] - Options de filtrage
   * @param {string} [options.locale] - Locale pour les noms/descriptions
   * @param {Object} [options.amount] - Montant pour filtrer les methodes disponibles
   * @returns {Promise<Object>} - Liste des methodes de paiement
   */
  async getPaymentMethods(options = {}) {
    try {
      const params = new URLSearchParams();
      if (options.locale) params.append('locale', options.locale);
      if (options.amount) {
        params.append('amount[currency]', options.amount.currency || 'EUR');
        params.append('amount[value]', options.amount.value);
      }

      const url = params.toString() ? `/methods?${params}` : '/methods';
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      console.error('Erreur API Mollie getPaymentMethods:', error.response?.data || error.message);
      throw new Error('Erreur lors de la recuperation des methodes de paiement');
    }
  }
}

module.exports = { MollieClient };
