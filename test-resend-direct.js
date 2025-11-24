/**
 * Script de test direct pour Resend
 * Usage: node test-resend-direct.js
 */

// Remplacez par votre vraie clé API Resend (commence par re_...)
const RESEND_API_KEY = 'YOUR_RESEND_API_KEY_HERE';

async function testResendDirect() {
  console.log('🧪 Test direct de l\'API Resend...\n');

  const emailData = {
    from: 'Calypso Diving Club <onboarding@resend.dev>',
    to: 'your-email@example.com', // CHANGEZ CECI PAR VOTRE EMAIL
    subject: '🧪 Test Resend Direct',
    html: `
      <h1>Test d'envoi direct Resend</h1>
      <p>Si vous recevez cet email, c'est que votre configuration Resend fonctionne !</p>
      <p><strong>Détails:</strong></p>
      <ul>
        <li>✅ Clé API Resend valide</li>
        <li>✅ Connexion établie</li>
        <li>✅ Email envoyé avec succès</li>
      </ul>
    `,
  };

  console.log('📤 Envoi de l\'email...');
  console.log('From:', emailData.from);
  console.log('To:', emailData.to);
  console.log('Subject:', emailData.subject);
  console.log('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Email envoyé avec succès !');
      console.log('Message ID:', data.id);
      console.log('');
      console.log('🔍 Vérifiez votre email et le dashboard Resend:');
      console.log('   https://resend.com/emails/' + data.id);
    } else {
      console.error('❌ Erreur lors de l\'envoi:');
      console.error('Status:', response.status);
      console.error('Message:', data.message || data.error);
      console.error('');
      console.error('💡 Vérifications:');
      console.error('   - Votre clé API est-elle valide ? (commence par re_...)');
      console.error('   - Le domaine est-il vérifié dans Resend ?');
      console.error('   - Utilisez onboarding@resend.dev pour les tests');
    }
  } catch (error) {
    console.error('❌ Erreur réseau:', error.message);
  }
}

// Vérifier que la clé API est configurée
if (RESEND_API_KEY === 'YOUR_RESEND_API_KEY_HERE') {
  console.error('❌ Erreur: Vous devez configurer votre clé API Resend dans ce script');
  console.error('');
  console.error('📝 Instructions:');
  console.error('   1. Ouvrez ce fichier: test-resend-direct.js');
  console.error('   2. Remplacez YOUR_RESEND_API_KEY_HERE par votre vraie clé API');
  console.error('   3. Remplacez your-email@example.com par votre email');
  console.error('   4. Lancez: node test-resend-direct.js');
  console.error('');
  console.error('🔑 Pour obtenir votre clé API:');
  console.error('   https://resend.com/api-keys');
  process.exit(1);
}

testResendDirect();
