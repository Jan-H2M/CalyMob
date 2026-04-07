/**
 * Default HTML template for event payment emails
 * (EPC QR code payment for CalyMob events)
 */

/**
 * Default template for "event_payment" type
 * Sent when a member registers for an event and chooses "Pay now"
 */
export const DEFAULT_EVENT_PAYMENT_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #F3F4F6;">

  <!-- Header with gradient (Marine theme) -->
  <div style="background: linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%); color: white; padding: 40px 30px; border-radius: 8px 8px 0 0; text-align: center;">
    {{#if logoUrl}}
    <img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 180px; height: auto; margin-bottom: 20px;">
    {{/if}}
    <h1 style="margin: 0; font-size: 26px;">Paiement de votre inscription</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.95; font-size: 16px;">{{eventTitle}}</p>
  </div>

  <!-- Body -->
  <div style="background: white; padding: 40px 30px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour <strong>{{recipientName}}</strong>,</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Vous êtes inscrit(e) à l'événement <strong>{{eventTitle}}</strong>{{#if eventDate}} du <strong>{{eventDate}}</strong>{{/if}}.
    </p>

    <p style="font-size: 16px; margin-bottom: 25px;">
      Pour faciliter votre paiement, scannez le QR code ci-dessous avec votre application bancaire :
    </p>

    <!-- QR Code Box -->
    <div style="text-align: center; margin: 30px 0;">
      <div style="display: inline-block; background: #F9FAFB; border: 2px solid #E5E7EB; border-radius: 12px; padding: 25px;">
        <img src="{{qrCodeImage}}" alt="QR Code de paiement EPC" style="width: 200px; height: 200px; display: block;">
        <p style="margin: 15px 0 0 0; font-size: 32px; font-weight: bold; color: #1E40AF;">{{amountFormatted}}</p>
      </div>
    </div>

    <!-- Payment Details Box -->
    <div style="background: #EFF6FF; border-left: 4px solid #3B82F6; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #1E40AF;">
        Ou effectuez un virement manuel :
      </p>
      <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6B7280; width: 120px;">Bénéficiaire :</td>
          <td style="padding: 8px 0; font-weight: 500;">{{beneficiaryName}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">IBAN :</td>
          <td style="padding: 8px 0; font-family: 'Courier New', monospace; font-weight: 500;">{{ibanFormatted}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Montant :</td>
          <td style="padding: 8px 0; font-weight: 600; color: #1E40AF;">{{amountFormatted}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280; vertical-align: top;">Communication :</td>
          <td style="padding: 8px 0; font-weight: 500; word-break: break-word;">{{paymentReference}}</td>
        </tr>
      </table>
    </div>

    <!-- Important Notice -->
    <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 20px; margin: 30px 0; border-radius: 4px;">
      <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: 600; color: #92400E;">
        Important
      </p>
      <p style="margin: 0; font-size: 14px; color: #78350F; line-height: 1.5;">
        Veuillez utiliser la communication exacte ci-dessus pour que votre paiement soit correctement identifié.
      </p>
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 35px 0;">

    <p style="font-size: 14px; color: #6B7280; margin-bottom: 10px;">
      Si vous avez des questions concernant votre inscription ou le paiement, n'hésitez pas à contacter l'organisateur de l'événement.
    </p>

    <p style="font-size: 14px; margin: 0;">
      À bientôt,<br>
      <strong>{{clubName}}</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      QR Code EPC · Virement SEPA
    </p>
  </div>
</body>
</html>
`.trim();

/**
 * Default email subject for event_payment emails
 */
export const DEFAULT_EVENT_PAYMENT_SUBJECT = 'Paiement pour {{eventTitle}} - {{amountFormatted}}';
