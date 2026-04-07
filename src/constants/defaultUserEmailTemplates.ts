/**
 * Default HTML templates for user management emails
 * (Account activation & Password reset)
 */

/**
 * Default template for "account_activated" type
 * Notifies user that their account has been activated
 */
export const DEFAULT_ACCOUNT_ACTIVATED_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #F3F4F6;">

  <!-- Header with logo -->
  <div style="background: {{headerGradient}}; color: white; padding: 40px 30px; border-radius: 8px 8px 0 0; text-align: center;">
    {{#if logoUrl}}
    <img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 200px; height: auto; margin-bottom: 20px;">
    {{/if}}
    <h1 style="margin: 0; font-size: 28px;">📱 Activation manuelle de votre accès CalyMob</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 16px;">Un administrateur a préparé un accès temporaire pour vous</p>
  </div>

  <!-- Body -->
  <div style="background: white; padding: 40px 30px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour <strong>{{recipientName}}</strong>,</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Un administrateur a activé manuellement votre accès à <strong>CalyMob</strong> pour <strong>{{clubName}}</strong>.
      Vous pouvez installer l'application sur votre téléphone et vous connecter avec les identifiants temporaires ci-dessous.
    </p>

    <!-- Credentials Box -->
    <div style="background: #EFF6FF; border-left: 4px solid {{primaryColor}}; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #1E40AF;">
        📧 Vos identifiants de connexion
      </p>
      <p style="margin: 0 0 10px 0; font-size: 14px;">
        <strong>Email :</strong> {{email}}
      </p>
      <p style="margin: 0; font-size: 14px;">
        <strong>Mot de passe temporaire :</strong> <code style="background: #DBEAFE; padding: 4px 8px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 15px; color: #1E40AF;">{{temporaryPassword}}</code>
      </p>
    </div>

    <!-- Store Links -->
    <div style="background: #F9FAFB; border: 1px solid #E5E7EB; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 12px 0; font-size: 15px; font-weight: 600; color: #111827;">
        📲 Télécharger CalyMob
      </p>
      <p style="margin: 0 0 10px 0; font-size: 14px;">
        iPhone / iPad :
        <a href="https://apps.apple.com/be/app/calymob/id6755293289?l=fr" target="_blank" rel="noopener noreferrer" style="color: {{primaryColor}}; font-weight: 600;">
          App Store
        </a>
      </p>
      <p style="margin: 0; font-size: 14px;">
        Android :
        <a href="https://play.google.com/store/apps/details?id=club.caly.calymob&hl=fr" target="_blank" rel="noopener noreferrer" style="color: {{primaryColor}}; font-weight: 600;">
          Google Play
        </a>
      </p>
    </div>

    <!-- Instructions -->
    <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 15px 0; font-size: 15px; font-weight: 600; color: #92400E;">
        ⚠️ Important - Première connexion
      </p>
      <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #78350F;">
        <li style="margin-bottom: 8px;">Installez et ouvrez l'application CalyMob</li>
        <li style="margin-bottom: 8px;">Connectez-vous avec votre email et le mot de passe temporaire ci-dessus</li>
        <li style="margin-bottom: 8px;">Lors de cette première connexion, vous devrez <strong>choisir votre mot de passe personnel</strong></li>
        <li style="margin-bottom: 8px;">Votre nouveau mot de passe doit contenir au minimum 8 caractères, une majuscule, une minuscule et un chiffre</li>
        <li>Une fois connecté, vous pourrez activer Face ID ou l'empreinte digitale si vous le souhaitez</li>
      </ol>
    </div>

    <!-- Help Box -->
    <div style="background: #ECFDF5; border-left: 4px solid #10B981; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: 600; color: #065F46;">
        💡 Besoin d'aide ?
      </p>
      <p style="margin: 0; font-size: 14px; color: #065F46; line-height: 1.5;">
        Si vous rencontrez une difficulté lors de l'installation ou de la première connexion, contactez un administrateur du club.
      </p>
    </div>

    <!-- CTA Buttons -->
    <div style="text-align: center; margin: 35px 0;">
      <a href="https://apps.apple.com/be/app/calymob/id6755293289?l=fr" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: {{buttonColor}}; color: {{buttonTextColor}}; padding: 14px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 0 6px 12px 6px;">
         App Store
      </a>
      <a href="https://play.google.com/store/apps/details?id=club.caly.calymob&hl=fr" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #10B981; color: #FFFFFF; padding: 14px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 0 6px 12px 6px;">
        ▶ Google Play
      </a>
      <br>
      <a href="{{appUrl}}/docs/calymob" style="display: inline-block; color: {{primaryColor}}; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 8px;">
        Consulter le guide CalyMob
      </a>
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 35px 0;">

    <p style="font-size: 14px; color: #6B7280; margin-bottom: 10px;">
      Cet accès est personnel. Si vous n'êtes pas à l'origine de cette invitation, merci de prévenir rapidement un administrateur du club.
    </p>

    <p style="font-size: 14px; margin: 0;">
      Cordialement,<br>
      <strong>{{clubName}}</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      CalyCompta - Gestion comptable pour clubs de plongée
    </p>
  </div>
</body>
</html>
`.trim();

/**
 * Default template for "password_reset" type
 * Notifies user that their password has been reset to default
 */
export const DEFAULT_PASSWORD_RESET_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #F3F4F6;">

  <!-- Header with logo -->
  <div style="background: {{headerGradient}}; color: white; padding: 40px 30px; border-radius: 8px 8px 0 0; text-align: center;">
    {{#if logoUrl}}
    <img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 200px; height: auto; margin-bottom: 20px;">
    {{/if}}
    <h1 style="margin: 0; font-size: 28px;">🔑 Réinitialisation administrateur</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 16px;">Un administrateur a défini un nouveau mot de passe temporaire</p>
  </div>

  <!-- Body -->
  <div style="background: white; padding: 40px 30px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour <strong>{{recipientName}}</strong>,</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Un administrateur a réinitialisé votre accès pour <strong>{{clubName}}</strong>. Vous pouvez maintenant vous reconnecter avec le nouveau mot de passe temporaire ci-dessous.
    </p>

    <!-- Credentials Box -->
    <div style="background: #EFF6FF; border-left: 4px solid {{primaryColor}}; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #1E40AF;">
        📧 Vos nouveaux identifiants
      </p>
      <p style="margin: 0 0 10px 0; font-size: 14px;">
        <strong>Email :</strong> {{email}}
      </p>
      <p style="margin: 0; font-size: 14px;">
        <strong>Nouveau mot de passe temporaire :</strong> <code style="background: #DBEAFE; padding: 4px 8px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 15px; color: #1E40AF;">{{temporaryPassword}}</code>
      </p>
    </div>

    <!-- Instructions -->
    <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 15px 0; font-size: 15px; font-weight: 600; color: #92400E;">
        ⚠️ Important - Changement de mot de passe obligatoire
      </p>
      <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #78350F;">
        <li style="margin-bottom: 8px;">Cliquez sur le bouton ci-dessous pour accéder à l'application</li>
        <li style="margin-bottom: 8px;">Connectez-vous avec le mot de passe temporaire ci-dessus</li>
        <li style="margin-bottom: 8px;">Vous serez automatiquement invité à créer un <strong>nouveau mot de passe</strong></li>
        <li style="margin-bottom: 8px;">Choisissez un mot de passe fort et unique (minimum 8 caractères)</li>
        <li>Conservez vos nouveaux identifiants en lieu sûr</li>
      </ol>
    </div>

    <!-- Security Notice -->
    <div style="background: #FEE2E2; border-left: 4px solid #EF4444; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: 600; color: #991B1B;">
        🔒 Vous n'avez pas demandé cette réinitialisation ?
      </p>
      <p style="margin: 0; font-size: 14px; color: #7F1D1D; line-height: 1.5;">
        Si vous n'êtes pas à l'origine de cette demande de réinitialisation, contactez immédiatement un administrateur pour sécuriser votre compte.
      </p>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 35px 0;">
      <a href="{{appUrl}}" style="display: inline-block; background: {{buttonColor}}; color: {{buttonTextColor}}; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        🔐 Se connecter maintenant
      </a>
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 35px 0;">

    <p style="font-size: 14px; color: #6B7280; margin-bottom: 10px;">
      Si vous rencontrez des difficultés pour vous connecter ou si vous pensez que ce message est une erreur, contactez l'administrateur de votre club.
    </p>

    <p style="font-size: 14px; margin: 0;">
      Cordialement,<br>
      <strong>{{clubName}}</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      CalyCompta - Gestion comptable pour clubs de plongée
    </p>
  </div>
</body>
</html>
`.trim();

/**
 * NEW template for bulk invitation: "CalyMob Invitation" type
 * Uses password reset link instead of temporary password.
 * Variables: recipientName, clubName, logoUrl, email, passwordResetLink,
 *            headerGradient, primaryColor, buttonColor, buttonTextColor, appUrl
 */
export const DEFAULT_BULK_INVITE_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #F3F4F6;">
  <div style="background: {{headerGradient}}; color: white; padding: 40px 30px; border-radius: 8px 8px 0 0; text-align: center;">
    {{#if logoUrl}}<img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 200px; height: auto; margin-bottom: 20px;">{{/if}}
    <h1 style="margin: 0; font-size: 28px;">📱 Bienvenue sur CalyMob !</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 16px;">L'application mobile du {{clubName}}</p>
  </div>
  <div style="background: white; padding: 40px 30px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour {{recipientName}},</p>
    <p style="font-size: 16px; margin-bottom: 20px;">Petit rappel : <strong>CalyMob</strong>, l'application mobile du <strong>{{clubName}}</strong>, est disponible !</p>
    <p style="font-size: 16px; margin-bottom: 20px;">En tant que membre du club, cette application est votre meilleur moyen de rester au courant de tout ce qui se passe et de participer aux activités. Elle vous permet de consulter les événements, vous inscrire aux sorties, recevoir des notifications et gérer votre profil. (Elle remplace VP Dive.)</p>
    <p style="font-size: 16px; margin-bottom: 20px;">L'inscription aux séances piscine se fait désormais via CalyMob et le scan du QR code à l'accueil. Ça simplifie l'accueil pour tout le monde — plus besoin de chercher votre nom sur une liste, un simple scan et c'est réglé !</p>
    <div style="background: #F9FAFB; border: 1px solid #E5E7EB; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 700; color: #111827;">1️⃣ Téléchargez l'application</p>
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #374151;">Téléchargez CalyMob sur votre téléphone via l'App Store ou Google Play.</p>
      <div style="text-align: center;">
        <a href="https://apps.apple.com/be/app/calymob/id6755293289?l=fr" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin: 0 8px 10px 8px; text-decoration: none;"><img src="https://caly.club/badge-app-store-fr.svg" alt="Télécharger sur l'App Store" style="height: 50px; width: auto;" /></a>
        <a href="https://play.google.com/store/apps/details?id=club.caly.calymob&hl=fr" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin: 0 8px 10px 8px; text-decoration: none;"><img src="https://caly.club/badge-google-play-fr.svg" alt="Disponible sur Google Play" style="height: 50px; width: auto;" /></a>
      </div>
      <table style="margin: 15px auto 0 auto; border: none; border-spacing: 0;">
        <tr>
          <td style="text-align: center; padding: 0 15px;">
            <a href="https://apps.apple.com/be/app/calymob/id6755293289?l=fr" target="_blank" rel="noopener noreferrer"><img src="https://caly.club/qr-app-store.png" alt="QR Code App Store" style="width: 120px; height: 120px;" /></a>
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #6B7280;">App Store</p>
          </td>
          <td style="text-align: center; padding: 0 15px;">
            <a href="https://play.google.com/store/apps/details?id=club.caly.calymob&hl=fr" target="_blank" rel="noopener noreferrer"><img src="https://caly.club/qr-google-play.png" alt="QR Code Google Play" style="width: 120px; height: 120px;" /></a>
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #6B7280;">Google Play</p>
          </td>
        </tr>
      </table>
    </div>
    <div style="background: #EFF6FF; border-left: 4px solid {{primaryColor}}; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: 700; color: #1E40AF;">2️⃣ Créez votre mot de passe</p>
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #1E40AF; line-height: 1.5;">Ouvrez l'application CalyMob.</p>
      <ol style="margin: 0 0 10px 0; padding-left: 20px; font-size: 14px; color: #1E40AF; line-height: 1.8;">
        <li>Appuyez sur <strong>« Mot de passe oublié ? »</strong></li>
        <li>Entrez votre adresse e-mail : <strong>{{email}}</strong></li>
        <li>Vous recevrez un e-mail contenant un lien pour créer votre mot de passe</li>
      </ol>
    </div>
    <div style="background: #ECFDF5; border-left: 4px solid #10B981; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: 700; color: #065F46;">3️⃣ Connectez-vous</p>
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #065F46; line-height: 1.5;">Une fois votre mot de passe créé :</p>
      <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #065F46; line-height: 1.8;">
        <li>Ouvrez l'application CalyMob</li>
        <li>Connectez-vous avec votre e-mail <strong>{{email}}</strong> et votre mot de passe</li>
        <li>Vous pourrez ensuite activer Face ID ou l'empreinte digitale si vous le souhaitez</li>
      </ol>
    </div>
    <div style="text-align: center; margin: 35px 0;">
      <a href="https://apps.apple.com/be/app/calymob/id6755293289?l=fr" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin: 0 8px 10px 8px; text-decoration: none;"><img src="https://caly.club/badge-app-store-fr.svg" alt="Télécharger sur l'App Store" style="height: 50px; width: auto;" /></a>
      <a href="https://play.google.com/store/apps/details?id=club.caly.calymob&hl=fr" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin: 0 8px 10px 8px; text-decoration: none;"><img src="https://caly.club/badge-google-play-fr.svg" alt="Disponible sur Google Play" style="height: 50px; width: auto;" /></a>
      <table style="margin: 15px auto 0 auto; border: none; border-spacing: 0;">
        <tr>
          <td style="text-align: center; padding: 0 15px;">
            <a href="https://apps.apple.com/be/app/calymob/id6755293289?l=fr" target="_blank" rel="noopener noreferrer"><img src="https://caly.club/qr-app-store.png" alt="QR Code App Store" style="width: 120px; height: 120px;" /></a>
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #6B7280;">App Store</p>
          </td>
          <td style="text-align: center; padding: 0 15px;">
            <a href="https://play.google.com/store/apps/details?id=club.caly.calymob&hl=fr" target="_blank" rel="noopener noreferrer"><img src="https://caly.club/qr-google-play.png" alt="QR Code Google Play" style="width: 120px; height: 120px;" /></a>
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #6B7280;">Google Play</p>
          </td>
        </tr>
      </table>
    </div>
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 35px 0;">
    <p style="font-size: 14px; color: #6B7280; margin-bottom: 10px;">Si vous rencontrez le moindre souci pour installer ou utiliser l'application, envoyez-moi un petit message via <strong>WhatsApp</strong> au 0476 44 18 37 et je vous aiderai avec plaisir.</p>
    <p style="font-size: 14px; margin: 0;">À bientôt au bord du bassin !<br><strong>Jan — {{clubName}}</strong></p>
  </div>
  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">CalyCompta - Gestion pour clubs de plongée</p>
  </div>
</body>
</html>
`.trim();
