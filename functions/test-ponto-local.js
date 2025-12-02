/**
 * Local test script to verify Ponto API connection with mTLS
 * Run: node test-ponto-local.js
 */

const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PONTO_API_URL = 'https://api.ibanity.com';

// Ponto credentials
const clientId = '4aee3f46-3ce7-481b-a5dc-dd6e575f3e50';
const clientSecret = '1a7a21df-9d62-4725-8677-79c1845992a5';

async function testPontoConnection() {
  console.log('🧪 Testing Ponto API connection...\n');

  // Load certificates
  const certsDir = path.join(__dirname, 'certs');
  const certPath = path.join(certsDir, 'certificate.pem');
  const keyPath = path.join(certsDir, 'private_key.pem');

  console.log('📁 Loading certificates from:', certsDir);

  if (!fs.existsSync(certPath)) {
    console.error('❌ Certificate not found:', certPath);
    return;
  }
  if (!fs.existsSync(keyPath)) {
    console.error('❌ Private key not found:', keyPath);
    return;
  }

  const cert = fs.readFileSync(certPath, 'utf-8');
  const key = fs.readFileSync(keyPath, 'utf-8');

  console.log('✅ Certificates loaded');
  console.log(`   - Certificate: ${cert.length} chars`);
  console.log(`   - Private Key: ${key.length} chars`);

  // Create HTTPS agent with mTLS
  console.log('\n🔐 Creating mTLS HTTPS agent...');
  const httpsAgent = new https.Agent({
    cert: cert,
    key: key,
    rejectUnauthorized: true,
  });

  // Create Basic auth header
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  console.log('\n🔑 Requesting access token from Ponto...');
  console.log(`   - URL: ${PONTO_API_URL}/oauth2/token`);
  console.log(`   - Client ID: ${clientId.substring(0, 8)}...`);

  try {
    const response = await axios.post(
      `${PONTO_API_URL}/oauth2/token`,
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        timeout: 30000,
        httpsAgent: httpsAgent,
      }
    );

    console.log('\n✅ Successfully connected to Ponto API!');
    console.log('   Response:', JSON.stringify(response.data, null, 2));

    // Try to get accounts
    console.log('\n🏦 Fetching Ponto accounts...');
    const accountsResponse = await axios.get(`${PONTO_API_URL}/ponto-connect/accounts`, {
      headers: {
        Authorization: `Bearer ${response.data.access_token}`,
        Accept: 'application/vnd.api+json',
      },
      timeout: 30000,
      httpsAgent: httpsAgent,
    });

    console.log('✅ Accounts retrieved:');
    console.log(JSON.stringify(accountsResponse.data, null, 2));
  } catch (error) {
    console.error('\n❌ Ponto connection failed!');
    console.error('   Error:', error.message);

    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }

    if (error.code) {
      console.error('   Code:', error.code);
    }
  }
}

testPontoConnection();
