# Mollie Payment Integration - CalyMob

**Datum**: 16 december 2025
**Status**: Geïmplementeerd en gedeployed
**Commit**: `eff38fe`

---

## Overzicht

Mollie is geïntegreerd als primaire betaalprovider voor CalyMob, waarmee leden hun evenement-inschrijvingen kunnen betalen via Belgische betaalmethodes. De integratie volgt het bestaande Noda payment pattern en houdt legacy Ponto code voor backward compatibility.

### Ondersteunde Betaalmethodes

| Methode | Code | Beschrijving |
|---------|------|--------------|
| Bancontact | `bancontact` | Meest populair in België |
| KBC/CBC | `kbc` | KBC Payment Button |
| Belfius | `belfius` | Belfius Direct Net |
| Credit/Debit Cards | `creditcard` | Visa, Mastercard |
| Apple Pay | `applepay` | Contactloos betalen |

---

## Credentials

### Sandbox/Test

| Parameter | Waarde |
|-----------|--------|
| Test API Key | `test_KmcCG7eVBTuJMrEUrfCS5FcMtJAa5V` |
| Profile ID | `pfl_7q2dbDLGu9` |
| API Base URL | `https://api.mollie.com/v2` |
| Webhook URL | `https://europe-west1-calycompta.cloudfunctions.net/mollieWebhook` |

### Productie

Voor productie moet `MOLLIE_API_KEY` environment variable geconfigureerd worden:
```bash
# Via Firebase Functions config
firebase functions:config:set mollie.api_key="live_xxxxx"

# Of via .env file in functions/
MOLLIE_API_KEY=live_xxxxx
```

---

## Architectuur

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CalyMob Flutter App                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ PaymentService  │  │ PaymentProvider │  │ OperationDetail     │  │
│  │                 │  │                 │  │ Screen              │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘  │
└───────────┼─────────────────────┼─────────────────────┼─────────────┘
            │                     │                     │
            │  Firebase Functions │                     │
            │         ▼           │                     │
┌───────────┴─────────────────────┴─────────────────────┴─────────────┐
│                        Cloud Functions (europe-west1)               │
│  ┌──────────────────┐  ┌────────────────────┐  ┌─────────────────┐  │
│  │createMolliePayment│  │checkMolliePayment  │  │ mollieWebhook   │  │
│  │    (onCall)       │  │Status (onCall)     │  │ (onRequest)     │  │
│  └────────┬──────────┘  └─────────┬──────────┘  └────────┬────────┘  │
└───────────┼──────────────────────┼──────────────────────┼───────────┘
            │                      │                      │
            ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Mollie API v2                              │
│                    https://api.mollie.com/v2                        │
└─────────────────────────────────────────────────────────────────────┘
            │                      │
            ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Firestore Database                            │
│  clubs/{clubId}/operation_participants/{participantId}              │
│    - payment_provider: 'mollie'                                     │
│    - payment_id: 'mol_xxx'                                          │
│    - mollie_payment_id: 'tr_xxx'                                    │
│    - payment_status: 'open' | 'paid' | 'failed' | ...              │
│    - paye: boolean                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Geïmplementeerde Bestanden

### Cloud Functions (functions/)

#### 1. functions/src/utils/mollie-client.js
Mollie API client utility met axios.

```javascript
class MollieClient {
  constructor(apiKey)              // Bearer token auth
  async createPayment(paymentData) // POST /v2/payments
  async getPaymentStatus(paymentId) // GET /v2/payments/{id}
  async getPaymentMethods(options)  // GET /v2/methods
}
```

#### 2. functions/src/payment/createMolliePayment.js
Firebase `onCall` function om betalingen aan te maken.

**Parameters**:
```javascript
{
  clubId: string,           // 'calypso'
  operationId: string,      // Event ID
  participantId: string,    // Participant document ID
  amount: number,           // Bedrag in EUR (0-10000)
  description: string,      // 'Inscription: {event titel}'
  method?: string,          // 'bancontact' | 'kbc' | 'belfius' | etc.
  locale?: string           // 'nl_BE' (default)
}
```

**Response**:
```javascript
{
  paymentId: string,        // Internal ID: 'mol_xxx'
  molliePaymentId: string,  // Mollie ID: 'tr_xxx'
  paymentUrl: string,       // Checkout URL
  status: string,           // 'open'
  method: string | null,
  expiresAt: string | null,
  provider: 'mollie'
}
```

**Validaties**:
- Gebruiker moet ingelogd zijn
- Participant moet bestaan en niet al betaald hebben
- Participant moet van de ingelogde gebruiker zijn
- Bedrag moet tussen 0 en 10000 EUR

#### 3. functions/src/payment/checkMollieStatus.js
Firebase `onCall` function om payment status te checken.

**Parameters**:
```javascript
{
  clubId: string,
  participantId: string
}
```

**Response**:
```javascript
{
  paymentId: string,
  molliePaymentId: string,
  status: string,           // 'open' | 'pending' | 'paid' | 'failed' | 'canceled' | 'expired'
  paye: boolean,
  method: string | null,
  updatedAt: string,
  provider: 'mollie'
}
```

#### 4. functions/src/payment/mollieWebhook.js
Firebase `onRequest` HTTP handler voor Mollie webhooks.

**Endpoint**: `POST https://europe-west1-calycompta.cloudfunctions.net/mollieWebhook`

**Werking**:
1. Mollie stuurt `{ id: "tr_xxx" }` naar webhook
2. Function haalt volledige payment data op via Mollie API
3. Update Firestore participant met nieuwe status
4. Log naar `payment_logs` collection
5. Retourneer altijd 200 OK (zelfs bij errors)

#### 5. functions/index.js
Export van alle Mollie functions:
```javascript
exports.createMolliePayment = createMolliePayment;
exports.mollieWebhook = mollieWebhook;
exports.checkMolliePaymentStatus = checkMolliePaymentStatus;
```

---

### Flutter App (lib/)

#### 1. lib/models/payment_response.dart
Data models voor payment responses.

**PaymentResponse** - Response van createPayment:
- `paymentId` - Internal payment ID
- `molliePaymentId` - Mollie's tr_xxx ID
- `paymentUrl` - Checkout URL
- `status` - Current status
- `provider` - 'mollie'
- `method` - Payment method used

**PaymentStatus** - Response van checkStatus:
- Status helpers: `isPending`, `isCompleted`, `isFailed`, `isCancelled`, `isExpired`, `isFinal`
- Ondersteunt zowel Mollie als legacy Ponto/Noda statussen

#### 2. lib/services/payment_service.dart
Service voor API calls naar Cloud Functions.

```dart
enum MolliePaymentMethod {
  bancontact,
  kbc,
  belfius,
  creditcard,
  applepay,
}

Future<PaymentResponse> createMolliePayment({
  required String clubId,
  required String operationId,
  required String participantId,
  required double amount,
  required String description,
  MolliePaymentMethod? method,
  String locale = 'nl_BE',
})

Future<PaymentStatus> checkMolliePaymentStatus({
  required String clubId,
  required String participantId,
})
```

#### 3. lib/providers/payment_provider.dart
State management voor payments.

```dart
String? get currentMolliePaymentId;
String? get currentProvider;

Future<String?> createMolliePayment({...})
Future<PaymentStatus?> checkMolliePaymentStatus({...})
void startMolliePaymentStatusPolling({
  required String clubId,
  required String participantId,
  required Function(PaymentStatus) onStatusUpdate,
})
```

#### 4. lib/screens/operations/operation_detail_screen.dart
UI integratie voor betalingen.

**Gewijzigd**:
- `_handlePayment()` gebruikt nu `createMolliePayment()` ipv legacy Ponto
- Nieuw: `_showMolliePaymentStatusDialog()` voor Mollie-specifieke polling

---

## Payment Flow

### Stap 1: Gebruiker klikt "Payer"
```
operation_detail_screen.dart → _handlePayment(amount)
```

### Stap 2: Payment aanmaken
```dart
paymentProvider.createMolliePayment(
  clubId: 'calypso',
  operationId: operation.id,
  participantId: participant.id,
  amount: 25.00,
  description: 'Inscription: Plongee Zeeland',
)
```

### Stap 3: Cloud Function verwerkt
```javascript
// createMolliePayment.js
1. Valideer auth en parameters
2. Check participant bestaat en niet betaald
3. Call Mollie API: POST /v2/payments
4. Update Firestore participant document
5. Return paymentUrl
```

### Stap 4: Redirect naar Mollie
```dart
launchUrl(paymentUrl, mode: LaunchMode.externalApplication);
```

### Stap 5: Gebruiker betaalt
- Mollie checkout pagina opent
- Gebruiker kiest betaalmethode
- Betaling wordt verwerkt

### Stap 6: Status polling
```dart
paymentProvider.startMolliePaymentStatusPolling(
  onStatusUpdate: (status) {
    if (status.isCompleted) {
      // Succes!
    } else if (status.isFailed) {
      // Error handling
    }
  }
)
```

### Stap 7: Webhook update (async)
```
Mollie → POST /mollieWebhook
mollieWebhook.js:
  1. Ontvang { id: "tr_xxx" }
  2. GET /v2/payments/tr_xxx
  3. Update Firestore: paye = true
```

---

## Mollie API Reference

### Create Payment
```
POST https://api.mollie.com/v2/payments
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "amount": { "currency": "EUR", "value": "25.00" },
  "description": "Inscription Plongee Zeeland",
  "redirectUrl": "https://calycompta.vercel.app/payment/return",
  "webhookUrl": "https://europe-west1-calycompta.cloudfunctions.net/mollieWebhook",
  "method": "bancontact", // optional - let customer choose if null
  "locale": "nl_BE",
  "metadata": {
    "clubId": "calypso",
    "operationId": "xxx",
    "participantId": "xxx"
  }
}
```

### Response
```json
{
  "id": "tr_xxx",
  "status": "open",
  "_links": {
    "checkout": { "href": "https://www.mollie.com/checkout/..." }
  }
}
```

---

## Mollie Status Mapping

| Mollie Status | Betekenis | paye | UI Actie |
|---------------|-----------|------|----------|
| `open` | Wacht op klant | false | Polling doorgaan |
| `pending` | Betaling in verwerking | false | Polling doorgaan |
| `paid` | Betaling gelukt | true | Succes melding |
| `failed` | Betaling gefaald | false | Error melding |
| `canceled` | Geannuleerd door klant | false | Error melding |
| `expired` | Niet op tijd betaald | false | Error melding |

---

## Firestore Document Updates

### operation_participants/{id}

**Na createMolliePayment**:
```javascript
{
  payment_id: 'mol_1702745123456_abc123',
  mollie_payment_id: 'tr_xxxxxxxx',
  payment_provider: 'mollie',
  payment_status: 'open',
  payment_method: null,  // of 'bancontact' etc.
  payment_initiated_at: Timestamp,
  updated_at: Timestamp
}
```

**Na succesvolle betaling (webhook)**:
```javascript
{
  payment_status: 'paid',
  payment_method: 'bancontact',
  paye: true,
  date_paiement: Timestamp,
  updated_at: Timestamp
}
```

---

## Testing

### Sandbox Testkaarten

| Type | Nummer | Resultaat |
|------|--------|-----------|
| Bancontact | N/A | Simulatie scherm |
| Credit Card (succes) | 4242 4242 4242 4242 | Betaling gelukt |
| Credit Card (fail) | 4000 0000 0000 0002 | Betaling gefaald |

### Test Flow
1. Maak inschrijving voor een event
2. Klik op "Payer" knop
3. Selecteer Bancontact in Mollie checkout
4. Klik "Paid" in simulatie scherm
5. Wacht op redirect terug naar app
6. Verifieer dat status polling "paid" detecteert
7. Check Firestore: `paye: true`

### Testing Checklist
- [ ] Create payment in sandbox mode
- [ ] Redirect to Mollie checkout works
- [ ] Complete test payment (simulate paid)
- [ ] Status polling detects completion
- [ ] Firestore updated with paye=true
- [ ] Webhook receives notification
- [ ] Error handling (failed, canceled, expired)
- [ ] UI shows correct status messages

---

## Deployment

### Cloud Functions deployen
```bash
cd /Users/jan/Documents/GitHub/CalyMob/functions
npm install
firebase deploy --only functions:createMolliePayment,functions:checkMolliePaymentStatus,functions:mollieWebhook
```

### Alle functions deployen
```bash
firebase deploy --only functions
```

---

## Backward Compatibility

De legacy payment code is behouden:

| Provider | Create Method | Status Method |
|----------|--------------|---------------|
| **Mollie** (primary) | `createMolliePayment()` | `checkMolliePaymentStatus()` |
| Ponto (legacy) | `createPayment()` | `checkPaymentStatus()` |
| Noda (legacy) | via Cloud Functions | `checkNodaPaymentStatus()` |

Mollie is nu de **default provider** voor nieuwe betalingen in `operation_detail_screen.dart`.

---

## Bekende Limitaties

1. **Redirect URL**: Momenteel wijst naar CalyCompta web app (`calycompta.vercel.app`). Voor deep linking naar de Flutter app zou een custom URL scheme nodig zijn.

2. **Webhook betrouwbaarheid**: Als webhook faalt, detecteert de app dit alsnog via polling. Polling stopt na 5 minuten (100 ticks × 3 seconden).

3. **Methode selectie**: Momenteel laat de code de klant kiezen (`method: null`). Om een specifieke methode te forceren, geef `MolliePaymentMethod.bancontact` mee.

---

## Referenties

- [Mollie API Documentatie](https://docs.mollie.com/)
- [Mollie Payment Status](https://docs.mollie.com/payments/status-changes)
- [Firebase Cloud Functions v2](https://firebase.google.com/docs/functions)

---

## Versie Historie

| Datum | Commit | Beschrijving |
|-------|--------|--------------|
| 16 dec 2025 | `eff38fe` | Initiële Mollie integratie |
| 16 dec 2025 | `1fa264a` | Documentatie toegevoegd |
