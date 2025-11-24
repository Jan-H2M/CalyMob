#!/usr/bin/env node

/**
 * Google Gmail OAuth2 Refresh Token Generator
 *
 * This script helps you generate a refresh token for Gmail API access.
 *
 * Prerequisites:
 * 1. Google Cloud project with Gmail API enabled
 * 2. OAuth 2.0 credentials (Client ID + Client Secret)
 * 3. Redirect URI configured: http://localhost:3000
 *
 * Usage:
 *   node scripts/get-gmail-refresh-token.js
 */

const http = require('http');
const url = require('url');
const readline = require('readline');
const { exec } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  log('\n🔐 Google Gmail OAuth2 Refresh Token Generator\n', 'bright');

  // Get credentials from user
  log('📋 Voer je OAuth2 credentials in:\n', 'cyan');

  const clientId = await question('Client ID: ');
  const clientSecret = await question('Client Secret: ');

  if (!clientId || !clientSecret) {
    log('\n❌ Client ID en Client Secret zijn verplicht!', 'red');
    rl.close();
    process.exit(1);
  }

  const redirectUri = 'http://localhost:3000';
  const scope = 'https://www.googleapis.com/auth/gmail.send';

  // Build authorization URL
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scope)}&` +
    `access_type=offline&` +
    `prompt=consent`;

  log('\n✅ Authorization URL gegenereerd!', 'green');
  log('\n📝 Stappen:', 'yellow');
  log('  1. Browser opent automatisch (of kopieer de URL hieronder)', 'yellow');
  log('  2. Log in met je Gmail account (calycompta@gmail.com)', 'yellow');
  log('  3. Geef toestemming voor Gmail API access', 'yellow');
  log('  4. Je wordt teruggestuurd naar localhost (kan een foutmelding tonen - dat is OK!)', 'yellow');
  log('  5. Script zal automatisch de authorization code detecteren\n', 'yellow');

  log('🌐 Authorization URL:', 'blue');
  log(`   ${authUrl}\n`, 'cyan');

  await question('Druk op ENTER om de browser te openen... ');

  // Start local server to catch redirect
  const server = await new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      const queryData = url.parse(req.url, true).query;

      if (queryData.code) {
        const code = queryData.code;

        // Send success response to browser
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>CalyCompta - OAuth Success</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .container {
                  background: white;
                  padding: 3rem;
                  border-radius: 1rem;
                  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                  text-align: center;
                  max-width: 500px;
                }
                h1 { color: #10b981; margin: 0 0 1rem 0; }
                p { color: #6b7280; margin: 0.5rem 0; }
                .emoji { font-size: 4rem; margin-bottom: 1rem; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="emoji">✅</div>
                <h1>Authenticatie geslaagd!</h1>
                <p>Je kan dit venster sluiten en terugkeren naar de terminal.</p>
                <p style="margin-top: 2rem; color: #9ca3af; font-size: 0.875rem;">
                  CalyCompta Email Service - OAuth2 Setup
                </p>
              </div>
            </body>
          </html>
        `);

        log('\n✅ Authorization code ontvangen!', 'green');
        log('🔄 Exchanging code voor refresh token...\n', 'yellow');

        // Exchange code for refresh token
        try {
          const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              code: code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
            }),
          });

          const tokenData = await tokenResponse.json();

          if (tokenData.error) {
            log(`❌ Fout: ${tokenData.error_description || tokenData.error}`, 'red');
            srv.close();
            rl.close();
            process.exit(1);
          }

          log('═'.repeat(80), 'green');
          log('  🎉 SUCCESS! Refresh Token gegenereerd!', 'green');
          log('═'.repeat(80), 'green');
          log('\n📋 Kopieer deze waarden naar CalyCompta (Settings → Intégrations):\n', 'bright');

          log('Client ID:', 'cyan');
          log(`  ${clientId}\n`, 'reset');

          log('Client Secret:', 'cyan');
          log(`  ${clientSecret}\n`, 'reset');

          log('Refresh Token:', 'cyan');
          log(`  ${tokenData.refresh_token}\n`, 'reset');

          log('Email expéditeur:', 'cyan');
          log(`  calycompta@gmail.com\n`, 'reset');

          log('Nom expéditeur:', 'cyan');
          log(`  Calypso Diving Club\n`, 'reset');

          log('═'.repeat(80), 'green');
          log('\n💡 Volgende stappen:', 'yellow');
          log('  1. Log in op https://calycompta.vercel.app', 'yellow');
          log('  2. Ga naar Settings → Intégrations', 'yellow');
          log('  3. Scroll naar "📧 Services Email"', 'yellow');
          log('  4. Vul bovenstaande waarden in', 'yellow');
          log('  5. Klik "Sauvegarder toutes les clés API"', 'yellow');
          log('  6. Test met "Envoyer un email de test"\n', 'yellow');

          // Close server after 2 seconds
          setTimeout(() => {
            srv.close();
            rl.close();
            process.exit(0);
          }, 2000);
        } catch (error) {
          log(`\n❌ Fout bij token exchange: ${error.message}`, 'red');
          srv.close();
          rl.close();
          process.exit(1);
        }
      } else if (queryData.error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>CalyCompta - OAuth Error</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #f43f5e 0%, #dc2626 100%);
                }
                .container {
                  background: white;
                  padding: 3rem;
                  border-radius: 1rem;
                  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                  text-align: center;
                  max-width: 500px;
                }
                h1 { color: #dc2626; margin: 0 0 1rem 0; }
                p { color: #6b7280; margin: 0.5rem 0; }
                .emoji { font-size: 4rem; margin-bottom: 1rem; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="emoji">❌</div>
                <h1>Authenticatie geweigerd</h1>
                <p>Je hebt geen toestemming gegeven voor Gmail API access.</p>
                <p style="margin-top: 1rem; color: #dc2626;">Error: ${queryData.error}</p>
                <p style="margin-top: 2rem; color: #9ca3af; font-size: 0.875rem;">
                  Sluit dit venster en probeer opnieuw
                </p>
              </div>
            </body>
          </html>
        `);

        log(`\n❌ Authenticatie geweigerd: ${queryData.error}`, 'red');
        srv.close();
        rl.close();
        process.exit(1);
      }
    });

    srv.listen(3000, () => {
      log('🌐 Lokale server gestart op http://localhost:3000', 'green');
      resolve(srv);
    });
  });

  // Open browser (macOS)
  try {
    exec(`open "${authUrl}"`);
    log('✅ Browser geopend! Volg de instructies in de browser...\n', 'green');
  } catch (error) {
    log('⚠️  Kon browser niet automatisch openen.', 'yellow');
    log('   Kopieer de URL hierboven en open deze handmatig.\n', 'yellow');
  }
}

// Run script
main().catch((error) => {
  log(`\n❌ Onverwachte fout: ${error.message}`, 'red');
  rl.close();
  process.exit(1);
});
