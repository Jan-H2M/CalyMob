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
    <h1 style="margin: 0; font-size: 28px;">🎉 Bienvenue !</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 16px;">Votre compte a été activé</p>
  </div>

  <!-- Body -->
  <div style="background: white; padding: 40px 30px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour <strong>{{recipientName}}</strong>,</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Votre compte pour <strong>{{clubName}}</strong> a été activé avec succès ! Vous pouvez maintenant accéder à l'application CalyCompta.
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

    <!-- Instructions -->
    <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 15px 0; font-size: 15px; font-weight: 600; color: #92400E;">
        ⚠️ Important - Première connexion
      </p>
      <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #78350F;">
        <li style="margin-bottom: 8px;">Connectez-vous avec le mot de passe temporaire ci-dessus</li>
        <li style="margin-bottom: 8px;">Vous <strong>devrez obligatoirement</strong> créer un nouveau mot de passe sécurisé</li>
        <li style="margin-bottom: 8px;">Choisissez un mot de passe fort et unique (minimum 8 caractères)</li>
        <li>Conservez vos identifiants en lieu sûr</li>
      </ol>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 35px 0;">
      <a href="{{appUrl}}" style="display: inline-block; background: {{buttonColor}}; color: {{buttonTextColor}}; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        🔐 Accéder à l'application
      </a>
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 35px 0;">

    <p style="font-size: 14px; color: #6B7280; margin-bottom: 10px;">
      Si vous rencontrez des difficultés pour vous connecter, n'hésitez pas à contacter l'administrateur de votre club.
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
    <h1 style="margin: 0; font-size: 28px;">🔑 Réinitialisation de mot de passe</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 16px;">Votre mot de passe a été réinitialisé</p>
  </div>

  <!-- Body -->
  <div style="background: white; padding: 40px 30px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour <strong>{{recipientName}}</strong>,</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Votre mot de passe pour <strong>{{clubName}}</strong> a été réinitialisé par un administrateur. Vous pouvez maintenant vous reconnecter avec le nouveau mot de passe temporaire.
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
