/**
 * Client API Noda (Gen2 compatible)
 * Gère la communication avec l'API Noda (Open Banking)
 */

const axios = require('axios');

const NODA_API_URL = 'https://api.noda.live/v1';

/**
 * Client API Noda
 * En Gen2, la clé API est passée en paramètre du constructeur
 */
class NodaClient {
  /**
   * @param {string} apiKey - Clé API Noda (obtenue via defineSecret)
   */
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Noda API key is required');
    }

    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: NODA_API_URL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 secondes
    });
  }

  /**
   * Créer un paiement
   * @param {Object} paymentData - Données du paiement
   * @returns {Promise<Object>} - Réponse Noda avec payment_id et payment_url
   */
  async createPayment(paymentData) {
    try {
      const response = await this.client.post('/payments', paymentData);
      return response.data;
    } catch (error) {
      console.error('Erreur API Noda createPayment:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Erreur lors de la création du paiement');
    }
  }

  /**
   * Vérifier le statut d'un paiement
   * @param {string} paymentId - ID du paiement Noda
   * @returns {Promise<Object>} - Statut du paiement
   */
  async getPaymentStatus(paymentId) {
    try {
      const response = await this.client.get(`/payments/${paymentId}`);
      return response.data;
    } catch (error) {
      console.error('Erreur API Noda getPaymentStatus:', error.response?.data || error.message);
      throw new Error('Erreur lors de la vérification du statut');
    }
  }
}

module.exports = { NodaClient };
