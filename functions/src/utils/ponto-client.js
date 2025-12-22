/**
 * Ponto Connect API Client
 * Handles OAuth2 authentication and payment requests via Ibanity's Ponto Connect API
 *
 * API Documentation: https://documentation.ibanity.com/ponto-connect/api
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const functions = require('firebase-functions');

const PONTO_API_URL = 'https://api.ibanity.com';

/**
 * Ponto Connect API Client
 */
class PontoClient {
  constructor() {
    // Get credentials from Firebase config (functions.config().ponto)
    // Falls back to environment variables for local development
    const config = functions.config().ponto || {};
    this.clientId = config.client_id || process.env.PONTO_CLIENT_ID;
    this.clientSecret = config.client_secret || process.env.PONTO_CLIENT_SECRET;

    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        'Ponto credentials not configured. Run: firebase functions:config:set ponto.client_id="..." ponto.client_secret="..."'
      );
    }

    // Token cache
    this._accessToken = null;
    this._tokenExpiresAt = null;

    // Account cache
    this._accountId = null;

    // HTTP client for API calls
    this.client = axios.create({
      baseURL: PONTO_API_URL,
      timeout: 30000,
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
      },
    });
  }

  /**
   * Get OAuth2 access token using client credentials flow
   * Tokens are cached for 25 minutes (they expire after 30 min)
   *
   * @returns {Promise<string>} Access token
   */
  async getAccessToken() {
    // Return cached token if still valid
    if (this._accessToken && this._tokenExpiresAt && Date.now() < this._tokenExpiresAt) {
      return this._accessToken;
    }

    console.log('🔑 Requesting new Ponto access token...');

    try {
      // Create Basic auth header
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await axios.post(
        `${PONTO_API_URL}/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
          timeout: 30000,
        }
      );

      this._accessToken = response.data.access_token;
      // Cache for 25 minutes (tokens expire after 30 min)
      this._tokenExpiresAt = Date.now() + (25 * 60 * 1000);

      console.log('✅ Ponto access token obtained');
      return this._accessToken;
    } catch (error) {
      console.error('❌ Failed to get Ponto access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Ponto API');
    }
  }

  /**
   * Get the first available account with payments enabled
   * Account ID is cached after first retrieval
   *
   * @returns {Promise<string>} Account UUID
   */
  async getAccountId() {
    // Return cached account if available
    if (this._accountId) {
      return this._accountId;
    }

    console.log('🏦 Fetching Ponto accounts...');

    const token = await this.getAccessToken();

    try {
      const response = await this.client.get('/ponto-connect/accounts', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const accounts = response.data.data || [];

      if (accounts.length === 0) {
        throw new Error('No Ponto accounts found. Please add a bank account in the Ponto dashboard.');
      }

      // Find first account (in sandbox, all should work)
      const account = accounts[0];
      this._accountId = account.id;

      console.log(`✅ Using Ponto account: ${this._accountId}`);
      return this._accountId;
    } catch (error) {
      console.error('❌ Failed to fetch Ponto accounts:', error.response?.data || error.message);
      throw new Error('Failed to retrieve Ponto accounts');
    }
  }

  /**
   * Create a payment request
   *
   * @param {Object} paymentData - Payment details
   * @param {number} paymentData.amount - Amount in EUR
   * @param {string} paymentData.description - Payment description
   * @param {string} paymentData.reference - Unique reference (e.g., participantId)
   * @param {Object} paymentData.metadata - Additional metadata to store
   * @returns {Promise<Object>} Payment request response with redirect URL
   */
  async createPaymentRequest(paymentData) {
    const { amount, description, reference, metadata } = paymentData;

    console.log('💳 Creating Ponto payment request:', { amount, description, reference });

    const token = await this.getAccessToken();
    const accountId = await this.getAccountId();
    const idempotencyKey = uuidv4();

    // Create unique end-to-end ID (max 35 chars for SEPA)
    const endToEndId = `CALY${Date.now().toString(36).toUpperCase()}${reference.substring(0, 10)}`;

    const requestBody = {
      data: {
        type: 'paymentRequest',
        attributes: {
          amount: parseFloat(amount).toFixed(2),
          currency: 'EUR',
          remittanceInformation: description.substring(0, 140), // SEPA limit
          remittanceInformationType: 'unstructured',
          endToEndId: endToEndId.substring(0, 35),
        },
      },
    };

    try {
      const response = await this.client.post(
        `/ponto-connect/accounts/${accountId}/payment-requests`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Ibanity-Idempotency-Key': idempotencyKey,
          },
        }
      );

      const paymentRequest = response.data.data;
      const redirectUrl = response.data.data.links?.redirect ||
                         response.data.links?.redirect ||
                         null;

      console.log('✅ Payment request created:', paymentRequest.id);

      return {
        paymentId: paymentRequest.id,
        paymentUrl: redirectUrl,
        status: 'pending',
        endToEndId: endToEndId,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ Failed to create payment request:', error.response?.data || error.message);

      // Extract error details from JSON:API error format
      const apiError = error.response?.data?.errors?.[0];
      const errorMessage = apiError?.detail || apiError?.title || 'Failed to create payment request';

      throw new Error(errorMessage);
    }
  }

  /**
   * Get payment request status
   *
   * @param {string} paymentRequestId - Payment request UUID
   * @returns {Promise<Object>} Payment request details with status
   */
  async getPaymentRequestStatus(paymentRequestId) {
    console.log('🔍 Checking payment request status:', paymentRequestId);

    const token = await this.getAccessToken();
    const accountId = await this.getAccountId();

    try {
      const response = await this.client.get(
        `/ponto-connect/accounts/${accountId}/payment-requests/${paymentRequestId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      const paymentRequest = response.data.data;
      const attributes = paymentRequest.attributes || {};

      // Map Ponto status to CalyMob status
      let status = 'pending';
      let paye = false;

      if (attributes.signedAt) {
        status = 'signed';
      }
      if (attributes.closedAt) {
        // Payment was closed - could be completed or cancelled
        // If signed before closed, likely completed
        if (attributes.signedAt) {
          status = 'completed';
          paye = true;
        } else {
          status = 'cancelled';
        }
      }

      console.log(`✅ Payment status: ${status}`);

      return {
        paymentId: paymentRequest.id,
        status: status,
        paye: paye,
        signedAt: attributes.signedAt,
        closedAt: attributes.closedAt,
        amount: attributes.amount,
        currency: attributes.currency,
      };
    } catch (error) {
      console.error('❌ Failed to get payment status:', error.response?.data || error.message);
      throw new Error('Failed to check payment status');
    }
  }

  /**
   * Delete/cancel a payment request
   *
   * @param {string} paymentRequestId - Payment request UUID
   * @returns {Promise<void>}
   */
  async deletePaymentRequest(paymentRequestId) {
    console.log('🗑️ Deleting payment request:', paymentRequestId);

    const token = await this.getAccessToken();
    const accountId = await this.getAccountId();

    try {
      await this.client.delete(
        `/ponto-connect/accounts/${accountId}/payment-requests/${paymentRequestId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      console.log('✅ Payment request deleted');
    } catch (error) {
      console.error('❌ Failed to delete payment request:', error.response?.data || error.message);
      throw new Error('Failed to delete payment request');
    }
  }
}

module.exports = { PontoClient };
