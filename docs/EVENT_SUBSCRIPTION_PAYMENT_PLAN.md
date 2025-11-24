# Event Subscription & Payment Implementation Plan - CalyMob

**Document Created:** November 21, 2025
**Version:** 1.0
**Status:** Ready for Implementation
**Author:** Development Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Feature Overview](#feature-overview)
4. [Phase Breakdown](#phase-breakdown)
5. [Detailed Implementation Tasks](#detailed-implementation-tasks)
6. [Technical Architecture](#technical-architecture)
7. [Data Models & Integration](#data-models--integration)
8. [Testing Strategy](#testing-strategy)
9. [Deployment Plan](#deployment-plan)
10. [Risk Management](#risk-management)
11. [Success Criteria](#success-criteria)

---

## Executive Summary

### Project Objectives

Enable Calypso DC club members to:
1. **Browse events** in an enhanced calendar/list view
2. **View detailed event information** including pricing, location, capacity, and participants
3. **Register for events** with immediate pricing calculation
4. **Pay instantly** through in-app payment (Noda Open Banking)
5. **Track payment status** in real-time
6. **Manage subscriptions** (for annual memberships and cotisations)

### Current Progress

**Excellent News**: 70% of infrastructure is already implemented!

| Component | Status | Location |
|-----------|--------|----------|
| Event Model | ✅ Complete | `lib/models/operation.dart` |
| Event Service | ✅ Complete | `lib/services/operation_service.dart` |
| Registration Tracking | ✅ Complete | `lib/models/participant_operation.dart` |
| Payment Models | ✅ Complete | `lib/models/payment_response.dart` |
| Payment Service | ✅ Complete | `lib/services/payment_service.dart` |
| Payment Provider | ✅ Complete | `lib/providers/payment_provider.dart` |
| Implementation Guide | ✅ Complete | `docs/NODA_INTEGRATION_PLAN.md` |
| **Cloud Functions Backend** | ❌ Missing | `functions/` (to create) |
| **Payment UI** | ❌ Missing | `operation_detail_screen.dart` (to enhance) |
| **Calendar View** | ⚠️ Partial | List-only, needs enhancement |
| **Pricing Configuration** | ⚠️ Partial | Basic only, needs location/tariff system |

### Timeline & Effort

- **Total Duration**: 3-4 weeks (15-20 days actual development)
- **Effort Required**: ~40-50 developer-hours
- **Team Composition**: 1-2 Flutter developers + 1 Backend developer

### Budget Estimate

- **Development**: 40-50 hours × €50-75/hour = €2,000-3,750
- **Infrastructure**: Firebase (Free Tier) + Noda (0.5% per transaction)
- **Testing**: Included in development

---

## Current State Analysis

### What's Already Built

#### 1. **Event/Operation System**
```
✅ Operation Model (type: 'evenement')
   - Title, description, location
   - Start/end dates
   - Capacity management
   - Member pricing (prix_membre)
   - Non-member pricing (prix_non_membre)
   - Status tracking (brouillon, ouvert, ferme, annule)

✅ OperationService
   - Create, read, update, delete operations
   - Real-time stream of open events
   - Participant count tracking
   - Capacity checking

✅ UI Screens
   - OperationsListScreen: Browse events
   - OperationDetailScreen: View details + Register
```

#### 2. **Registration System**
```
✅ ParticipantOperation Model
   - Registration tracking
   - Pricing per participant
   - Payment status (paye: true/false)
   - Payment date tracking
   - User comments

✅ OperationProvider
   - Registration state management
   - Real-time updates via Firestore streams
   - Duplicate registration prevention
```

#### 3. **Payment Infrastructure**
```
✅ PaymentResponse Model
   - Noda payment ID
   - Payment URL
   - Status tracking
   - Expiration date

✅ PaymentStatus Model
   - Status (pending, completed, failed, cancelled)
   - Completion timestamp
   - Failure reasons

✅ PaymentService
   - Calls Firebase Cloud Function: createNodaPayment()
   - Checks payment status: checkNodaPaymentStatus()
   - Error handling with friendly messages

✅ PaymentProvider
   - State management for payment process
   - Payment creation with URL return
   - Status polling (every 3 seconds, max 5 minutes)
   - Error message display
   - Automatic cleanup
```

### What's Missing

#### 1. **Cloud Functions Backend** ❌
```
MISSING:
- functions/src/payment/createPayment.js
- functions/src/payment/webhook.js
- functions/src/payment/checkStatus.js
- functions/src/utils/noda-client.js
- Firebase configuration for payment functions
```

#### 2. **Payment UI Integration** ❌
```
MISSING IN operation_detail_screen.dart:
- PaymentProvider registration in MultiProvider
- "Pay Now" button implementation
- Payment confirmation UI
- Success/error message display
- Status polling UI feedback
```

#### 3. **Enhanced Event Features** ⚠️
```
INCOMPLETE:
- Calendar view (only list view exists)
- Event filtering by date range
- Event filtering by location
- Event search functionality
- Capacity/availability indicators
- Participant list display (if allowed)
- Location display with address/distance
```

#### 4. **Pricing Integration** ⚠️
```
INCOMPLETE:
- Location-based pricing
- Member role-based pricing (diver, instructor, student, etc.)
- Automatic pricing from CalyCompta tariff system
- Price breakdown explanation to user
- Subscription/cotisation support
```

---

## Feature Overview

### Feature 1: Enhanced Event Calendar & Details

**User Experience**:
1. User taps "Events" tab
2. Sees list/calendar of upcoming events
3. Can filter by date, location, type
4. Taps event to see details
5. Views: Title, description, location, date, price, spots available, participant count
6. Sees if they're already registered

**Technical Implementation**:
- Enhance [operation_detail_screen.dart](lib/screens/operations/operation_detail_screen.dart)
- Add optional calendar view (TableCalendar or similar)
- Add filtering UI
- Display location with pricing info
- Real-time capacity tracking

### Feature 2: Intelligent Pricing Display

**User Experience**:
1. User sees event price clearly displayed
2. If member → shows member price
3. If non-member → shows non-member price
4. Price breakdown shown (base + location adjustment if applicable)
5. Multiple pricing options for different roles (if applicable)

**Technical Implementation**:
- Extend Operation model with location reference
- Integrate DiveLocation tariff system from CalyCompta
- Create PricingCalculator service
- Display pricing logic to user

### Feature 3: Instant In-App Payment

**User Experience**:
1. User taps "Pay Now" button in event details
2. Sees confirmation dialog with amount and event details
3. Clicks "Continue to Payment"
4. Opens bank selection screen (Noda)
5. Selects their bank
6. Authenticates with banking app
7. Confirms payment
8. Returns to CalyMob
9. Sees "✅ Payment Confirmed" badge in real-time

**Technical Implementation**:
- Register PaymentProvider in main.dart
- Add payment UI section to operation_detail_screen.dart
- Implement payment button with confirmation dialog
- Status polling with real-time UI updates
- Webhook handler for payment confirmation
- Firestore updates (`paye = true, datePaiement = timestamp`)

### Feature 4: Payment History & Tracking

**User Experience**:
1. User can see list of their registrations
2. Each registration shows status: "Not Paid", "Pending", or "✅ Paid"
3. Can see payment date if paid
4. Can retry payment if failed
5. Can see payment receipt (future)

**Technical Implementation**:
- List all participant operations for user
- Display payment status with icons
- Link to payment details
- Retry payment functionality

---

## Phase Breakdown

### Phase 1: Backend Infrastructure Setup (4-5 days)

**Objective**: Create Firebase Cloud Functions for payment processing

**Deliverables**:
- ✅ Cloud Functions project initialized
- ✅ Noda API integration
- ✅ Payment creation function
- ✅ Webhook handler
- ✅ Status checking function
- ✅ Local testing complete

**Key Tasks**:
1. Initialize Firebase Cloud Functions
2. Set up Noda credentials (sandbox)
3. Implement createNodaPayment function
4. Implement nodaWebhook function
5. Implement checkNodaPaymentStatus function
6. Unit tests for all functions
7. Integration tests with Firebase emulator
8. Manual testing with Noda sandbox

**Effort**: 20-25 hours

---

### Phase 2: Payment UI Integration (4-5 days)

**Objective**: Add payment button and flow to event detail screen

**Deliverables**:
- ✅ Payment button in operation_detail_screen.dart
- ✅ Confirmation dialog
- ✅ Payment status polling UI
- ✅ Error handling with retry
- ✅ Success confirmation display
- ✅ PaymentProvider registered in main.dart

**Key Tasks**:
1. Register PaymentProvider in main.dart
2. Add payment section to operation_detail_screen.dart
3. Implement payment confirmation dialog
4. Implement loading states
5. Implement error states with retry
6. Implement success state
7. Polish UI/UX
8. Manual testing on iOS and Android emulators

**Effort**: 15-20 hours

---

### Phase 3: Enhanced Event Features (3-4 days)

**Objective**: Improve event discovery and information display

**Deliverables**:
- ✅ Event filtering by date range
- ✅ Event filtering by location
- ✅ Event search functionality
- ✅ Capacity indicators
- ✅ Better location display
- ✅ Optional: Calendar view

**Key Tasks**:
1. Add event search to operations_list_screen.dart
2. Add date range filter UI
3. Add location filter UI
4. Add capacity percentage indicator
5. Display location with address
6. Optional: Integrate TableCalendar or similar
7. Enhance event detail display

**Effort**: 12-15 hours

---

### Phase 4: Pricing Integration (2-3 days)

**Objective**: Support location-based and role-based pricing

**Deliverables**:
- ✅ DiveLocation model integration
- ✅ Tariff/pricing system
- ✅ Automatic role-based pricing
- ✅ Price display with breakdown
- ✅ Support for multiple tariff categories

**Key Tasks**:
1. Create DiveLocation model in Flutter
2. Create Tariff model
3. Create PricingCalculator service
4. Integrate with Operation model
5. Display price breakdown in UI
6. Auto-select appropriate tariff based on user role
7. Show price explanation to user

**Effort**: 10-12 hours

---

### Phase 5: Testing & Validation (3-4 days)

**Objective**: Comprehensive testing before production

**Deliverables**:
- ✅ Unit tests for all services (>80% coverage)
- ✅ Integration tests with Firebase emulator
- ✅ End-to-end testing
- ✅ User acceptance testing
- ✅ Edge case testing

**Key Tasks**:
1. Write unit tests for PaymentService
2. Write unit tests for PaymentProvider
3. Write unit tests for PricingCalculator
4. Write integration tests
5. End-to-end payment flow testing
6. Test on iOS and Android real devices
7. Test error scenarios
8. UAT with club members

**Effort**: 12-15 hours

---

### Phase 6: Production Deployment (2-3 days)

**Objective**: Deploy to production safely

**Deliverables**:
- ✅ Production Noda credentials configured
- ✅ Cloud Functions deployed to production
- ✅ App submitted to App Store and Google Play
- ✅ Release notes published
- ✅ Monitoring configured

**Key Tasks**:
1. Configure production Noda API keys
2. Configure Firebase for production
3. Deploy Cloud Functions to production
4. Test production payment flow
5. Build production app (iOS & Android)
6. Create release notes
7. Submit to App Store and Google Play
8. Set up monitoring (Firebase Performance, Crashlytics)
9. Rollout strategy (10% → 25% → 50% → 100%)

**Effort**: 8-10 hours

---

## Detailed Implementation Tasks

### Phase 1: Backend Implementation

#### Task 1.1: Initialize Firebase Cloud Functions

**Location**: Create `functions/` directory

```bash
# Commands to run
firebase init functions
cd functions
npm install
mkdir -p src/payment src/utils
```

**Deliverable**: `functions/package.json` with dependencies:
```json
{
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0",
    "axios": "^1.6.0",
    "express": "^4.18.0"
  }
}
```

**Estimated Time**: 1 hour

---

#### Task 1.2: Implement createNodaPayment Function

**Location**: `functions/src/payment/createPayment.js`

**Responsibilities**:
- Validate user authentication
- Validate request parameters
- Check participant exists and not already paid
- Call Noda API to create payment
- Store payment ID in Firestore
- Return payment URL to client

**Key Code Section**:
```javascript
// Pseudo-code structure
exports.createNodaPayment = functions.https.onCall(async (data, context) => {
  // 1. Auth check
  if (!context.auth) throw error('unauthenticated');

  // 2. Validate data: clubId, operationId, participantId, amount

  // 3. Verify participant exists and not paid
  const participant = await admin.firestore()
    .doc(`clubs/${clubId}/operation_participants/${participantId}`)
    .get();

  if (participant.data().paye === true) {
    throw error('already-exists', 'Payment already completed');
  }

  // 4. Call Noda API
  const nodaResponse = await axios.post(
    'https://api.noda.live/v1/payments',
    {
      amount: amount,
      currency: 'EUR',
      description: `Event: ${description}`,
      reference: `${clubId}_${operationId}_${participantId}`,
      webhook_url: '...',
      metadata: { clubId, operationId, participantId }
    },
    {
      headers: {
        'Authorization': `Bearer ${functions.config().noda.api_key}`,
        'Content-Type': 'application/json'
      }
    }
  );

  // 5. Store payment reference in Firestore
  await admin.firestore()
    .doc(`clubs/${clubId}/operation_participants/${participantId}`)
    .update({
      paymentId: nodaResponse.data.payment_id,
      paymentStatus: 'pending',
      paymentInitiatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

  // 6. Return payment URL
  return {
    paymentId: nodaResponse.data.payment_id,
    paymentUrl: nodaResponse.data.payment_url,
    status: 'pending'
  };
});
```

**Testing**:
- Test with Firebase emulator
- Mock Noda API responses
- Test with invalid data
- Test with already-paid participant

**Estimated Time**: 4-5 hours

---

#### Task 1.3: Implement Webhook Handler

**Location**: `functions/src/payment/webhook.js`

**Responsibilities**:
- Verify Noda webhook signature
- Parse webhook payload
- Update Firestore based on payment status
- Handle completed, failed, and cancelled payments

**Key Code Section**:
```javascript
// Pseudo-code structure
exports.nodaWebhook = functions.https.onRequest(async (req, res) => {
  // 1. Verify signature
  const signature = req.headers['x-noda-signature'];
  if (!verifySignature(req.body, signature)) {
    return res.status(401).send('Unauthorized');
  }

  // 2. Parse payload
  const { payment_id, status, metadata } = req.body;
  const { clubId, operationId, participantId } = metadata;

  // 3. Update Firestore based on status
  if (status === 'completed') {
    await admin.firestore()
      .doc(`clubs/${clubId}/operation_participants/${participantId}`)
      .update({
        paye: true,
        datePaiement: admin.firestore.FieldValue.serverTimestamp(),
        paymentId: payment_id,
        paymentStatus: 'completed'
      });
  } else if (status === 'failed') {
    await admin.firestore()
      .doc(`clubs/${clubId}/operation_participants/${participantId}`)
      .update({
        paymentStatus: 'failed'
      });
  }

  // 4. Respond to Noda
  res.status(200).send({ received: true });
});

function verifySignature(payload, signature, secret) {
  // HMAC-SHA256 verification
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(computedSignature)
  );
}
```

**Testing**:
- Simulate webhook with correct signature
- Test with invalid signature (should reject)
- Test all status types (completed, failed, cancelled)
- Verify Firestore updates correctly

**Estimated Time**: 3-4 hours

---

#### Task 1.4: Implement Status Checking Function

**Location**: `functions/src/payment/checkStatus.js`

**Responsibilities**:
- Accept payment ID
- Call Noda API to get current status
- Return status to client

**Code**:
```javascript
exports.checkNodaPaymentStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw error('unauthenticated');

  const { paymentId } = data;

  const response = await axios.get(
    `https://api.noda.live/v1/payments/${paymentId}`,
    {
      headers: {
        'Authorization': `Bearer ${functions.config().noda.api_key}`
      }
    }
  );

  return {
    status: response.data.status,
    completedAt: response.data.completed_at,
    failureReason: response.data.failure_reason
  };
});
```

**Estimated Time**: 1-2 hours

---

#### Task 1.5: Configure Noda Credentials

**Steps**:
1. Create Noda merchant account at https://noda.live
2. Get sandbox API keys from Noda Hub
3. Store in Firebase:
   ```bash
   firebase functions:config:set noda.api_key_sandbox="sk_sandbox_xxx"
   firebase functions:config:set noda.webhook_secret="whsec_sandbox_xxx"
   ```

**Testing**:
- Verify functions can read config
- Test API calls with sandbox key
- Test webhook signature verification

**Estimated Time**: 2 hours

---

#### Task 1.6: Local Testing

**Steps**:
```bash
# Start emulator
firebase emulators:start --only functions

# Test createNodaPayment
# Use Firebase emulator UI to call function

# Simulate webhook
curl -X POST http://localhost:5001/PROJECT_ID/us-central1/nodaWebhook \
  -H "Content-Type: application/json" \
  -d '{...}'
```

**Testing Scenarios**:
- ✅ Create payment with valid data
- ✅ Reject without authentication
- ✅ Reject if participant not found
- ✅ Reject if already paid
- ✅ Receive webhook and update Firestore
- ✅ Check payment status

**Estimated Time**: 2-3 hours

---

### Phase 2: Flutter Payment UI Implementation

#### Task 2.1: Register PaymentProvider in main.dart

**Location**: `lib/main.dart`

**Change**:
```dart
MultiProvider(
  providers: [
    ChangeNotifierProvider(create: (_) => AuthProvider()),
    ChangeNotifierProvider(create: (_) => OperationProvider()),
    ChangeNotifierProvider(create: (_) => ExpenseProvider()),
    ChangeNotifierProvider(create: (_) => PaymentProvider()), // ← ADD THIS
  ],
  child: MyApp(),
)
```

**Estimated Time**: 0.5 hours

---

#### Task 2.2: Add Payment UI Section to operation_detail_screen.dart

**Location**: `lib/screens/operations/operation_detail_screen.dart`

**Implementation**:

Create `_buildPaymentSection()` widget that returns:
- If `participant.paye == true`:
  - Green success box with checkmark and "✅ Payment Complete"
  - Show payment date
- If `participant.paye == false`:
  - Orange info box: "Your registration will be confirmed after payment"
  - Large blue "Pay Now - €45.00" button
  - Security message: "Secure payment via Noda (Open Banking)"

**Code Structure**:
```dart
Widget _buildPaymentSection() {
  final participant = context.watch<OperationProvider>()
      .getCurrentUserParticipant(widget.operationId);

  if (participant == null) return SizedBox.shrink();

  if (participant.paye) {
    // Show success state
    return _buildPaidBadge(participant);
  } else {
    // Show payment button
    return _buildPaymentButton(participant);
  }
}

Widget _buildPaidBadge(ParticipantOperation participant) {
  return Container(
    padding: EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.green.withOpacity(0.1),
      border: Border.all(color: Colors.green, width: 2),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      children: [
        Icon(Icons.check_circle, color: Colors.green, size: 28),
        SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Payment Completed',
              style: TextStyle(color: Colors.green, fontSize: 18, fontWeight: FontWeight.bold)
            ),
            if (participant.datePaiement != null)
              Text(DateFormat('dd/MM/yyyy HH:mm').format(participant.datePaiement!))
          ],
        ),
      ],
    ),
  );
}

Widget _buildPaymentButton(ParticipantOperation participant) {
  final isProcessing = context.watch<PaymentProvider>().isProcessing;

  return Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      // Info box
      Container(
        padding: EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.orange.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(Icons.info_outline, color: Colors.orange),
            SizedBox(width: 8),
            Expanded(
              child: Text('Your registration will be confirmed after payment',
                style: TextStyle(fontSize: 14)
              ),
            ),
          ],
        ),
      ),
      SizedBox(height: 16),

      // Pay button
      SizedBox(
        height: 56,
        child: ElevatedButton.icon(
          onPressed: isProcessing ? null : () => _handlePayment(participant),
          icon: Icon(Icons.payment),
          label: Text(
            'Pay Now - ${NumberFormat.currency(locale: 'fr_FR', symbol: '€').format(participant.prix)}',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.blue,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ),
      SizedBox(height: 8),

      // Security message
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.lock, size: 16, color: Colors.grey),
          SizedBox(width: 4),
          Text('Secure payment via Noda (Open Banking)',
            style: TextStyle(color: Colors.grey[600], fontSize: 12)
          ),
        ],
      ),
    ],
  );
}
```

**Handler Method**:
```dart
Future<void> _handlePayment(ParticipantOperation participant) async {
  final paymentProvider = context.read<PaymentProvider>();
  final operation = context.read<OperationProvider>().selectedOperation;

  if (operation == null) return;

  // 1. Show loading dialog
  showDialog(
    context: context,
    barrierDismissible: false,
    builder: (_) => AlertDialog(
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 16),
          Text('Preparing payment...'),
        ],
      ),
    ),
  );

  try {
    // 2. Create payment
    final paymentUrl = await paymentProvider.createPayment(
      clubId: widget.clubId,
      operationId: widget.operationId,
      participantId: participant.id,
      amount: participant.prix,
      description: operation.titre,
    );

    if (mounted) Navigator.pop(context); // Close dialog

    if (paymentUrl == null) {
      // Error
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(paymentProvider.errorMessage ?? 'Payment error'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    // 3. Open payment URL
    final uri = Uri.parse(paymentUrl);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);

      // 4. Start polling for completion
      paymentProvider.startPaymentStatusPolling(
        paymentProvider.currentPaymentId!,
        (status) {
          if (status.isCompleted && mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('✅ Payment successful!'),
                backgroundColor: Colors.green,
              ),
            );
          } else if (status.isFailed && mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Payment failed. Try again.'),
                backgroundColor: Colors.red,
              ),
            );
          }
        },
      );
    }
  } catch (e) {
    if (mounted) {
      Navigator.pop(context); // Close dialog
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
      );
    }
  }
}
```

**Integration in build()**:
```dart
@override
Widget build(BuildContext context) {
  return Scaffold(
    // ... existing code ...
    body: SingleChildScrollView(
      child: Column(
        children: [
          // ... event details ...
          Padding(
            padding: EdgeInsets.all(16),
            child: _buildPaymentSection(), // ← ADD HERE
          ),
        ],
      ),
    ),
  );
}
```

**Estimated Time**: 5-6 hours

---

#### Task 2.3: Error Handling & Retry Logic

**Implementation**:
- Show friendly error messages
- Provide "Retry" button when payment fails
- Handle network errors gracefully
- Handle app crash during payment (webhook updates Firestore, UI syncs on restart)

**Error Messages**:
```dart
String _getFriendlyErrorMessage(String code) {
  switch (code) {
    case 'unauthenticated':
      return 'You must be logged in to pay';
    case 'already-exists':
      return 'This payment has already been completed';
    case 'invalid-argument':
      return 'Invalid payment data';
    case 'unavailable':
      return 'Payment service temporarily unavailable. Try again later.';
    case 'network':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Payment error. Please contact support.';
  }
}
```

**Estimated Time**: 2-3 hours

---

#### Task 2.4: UI Polish & Testing

**Tasks**:
- Test on iOS simulator
- Test on Android emulator
- Test with various screen sizes
- Test dark mode / light mode
- Verify loading states
- Verify error states
- Verify success states

**Estimated Time**: 2-3 hours

---

### Phase 3: Enhanced Event Features

#### Task 3.1: Event Filtering

**Location**: `lib/screens/operations/operations_list_screen.dart`

**Features**:
- Date range picker
- Location filter dropdown
- Event type filter (optional)
- Search by title

**UI**:
```dart
// Add filter bar above list
Container(
  padding: EdgeInsets.all(16),
  child: Column(
    children: [
      // Date range picker
      Row(
        children: [
          Expanded(
            child: TextField(
              decoration: InputDecoration(
                hintText: 'From: DD/MM/YYYY',
                prefixIcon: Icon(Icons.calendar_today),
              ),
              onTap: () => _selectStartDate(),
            ),
          ),
          SizedBox(width: 8),
          Expanded(
            child: TextField(
              decoration: InputDecoration(
                hintText: 'To: DD/MM/YYYY',
                prefixIcon: Icon(Icons.calendar_today),
              ),
              onTap: () => _selectEndDate(),
            ),
          ),
        ],
      ),
      SizedBox(height: 12),

      // Location filter
      DropdownButton(
        items: locations.map((loc) => DropdownMenuItem(
          value: loc.id,
          child: Text(loc.name),
        )).toList(),
        onChanged: (value) => setState(() => selectedLocation = value),
      ),
    ],
  ),
)
```

**Estimated Time**: 3-4 hours

---

#### Task 3.2: Capacity Indicators

**Implementation**:
- Show "5 / 12 spots available"
- Progress bar showing capacity usage
- Indicator if full (red) or nearly full (orange)

```dart
// In event list item
Row(
  children: [
    Expanded(
      child: LinearProgressIndicator(
        value: operation.participants.length / (operation.capaciteMax ?? 1),
        color: operation.participants.length >= operation.capaciteMax!
          ? Colors.red
          : Colors.green,
      ),
    ),
    SizedBox(width: 8),
    Text('${operation.participants.length}/${operation.capaciteMax}'),
  ],
)
```

**Estimated Time**: 1-2 hours

---

#### Task 3.3: Optional Calendar View

**Implementation** (optional):
- Use `table_calendar` package
- Show events on calendar grid
- Tap date to see events for that day
- Or keep as feature for Phase 2

**Estimated Time**: 4-5 hours (if implemented)

---

### Phase 4: Pricing Integration

#### Task 4.1: Create Pricing Models

**Location**: `lib/models/`

**Files to Create**:
- `dive_location.dart`
- `tariff.dart`
- `pricing_calculator.dart`

```dart
// dive_location.dart
class DiveLocation {
  final String id;
  final String name;
  final String country;
  final String? address;
  final List<Tariff> tariffs;
}

// tariff.dart
enum TariffCategory {
  membre,      // Regular member
  nonMembre,   // Non-member
  encadrant,   // Instructor
  junior,      // Under 18
  etudiant,    // Student
  decouverte,  // Discovery
}

class Tariff {
  final String id;
  final String label;
  final TariffCategory category;
  final double price;
  final bool isDefault;
  final int displayOrder;
}

// pricing_calculator.dart
class PricingCalculator {
  static double calculatePrice({
    required Operation operation,
    required Membre user,
    DiveLocation? location,
  }): double {
    // 1. Check if location has custom tariffs
    if (location != null && location.tariffs.isNotEmpty) {
      final tariff = _selectTariffForUser(user, location.tariffs);
      return tariff.price;
    }

    // 2. Fall back to member/non-member pricing
    if (user.isMember) {
      return operation.prixMembre ?? 0.0;
    } else {
      return operation.prixNonMembre ?? operation.prixMembre ?? 0.0;
    }
  }

  static Tariff _selectTariffForUser(Membre user, List<Tariff> tariffs) {
    // 1. If instructor → encadrant price
    // 2. If student → etudiant price
    // 3. If junior → junior price
    // 4. Default → membre or nonMembre

    if (user.hasRole('encadrant')) {
      return tariffs.firstWhere(
        (t) => t.category == TariffCategory.encadrant,
        orElse: () => tariffs.first,
      );
    }
    // ... more logic
  }
}
```

**Estimated Time**: 3 hours

---

#### Task 4.2: Integrate with Operation Detail Screen

**Changes**:
- Display location name and address
- Show applicable tariff/pricing category
- Display price breakdown
- Auto-select appropriate price for user

```dart
// In operation_detail_screen.dart
Widget _buildPricingSection() {
  final operation = context.watch<OperationProvider>().selectedOperation;
  final user = context.watch<AuthProvider>().currentUser;

  final price = PricingCalculator.calculatePrice(
    operation: operation!,
    user: user!,
    location: operation.location, // Fetched from Firestore
  );

  return Card(
    child: Padding(
      padding: EdgeInsets.all(16),
      child: Column(
        children: [
          // Location
          if (operation.lieu != null)
            Row(
              children: [
                Icon(Icons.location_on),
                SizedBox(width: 8),
                Text(operation.lieu!),
              ],
            ),
          SizedBox(height: 16),

          // Pricing breakdown
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Price (${user.memberStatus}):'),
              Text(
                NumberFormat.currency(locale: 'fr_FR', symbol: '€').format(price),
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}
```

**Estimated Time**: 2-3 hours

---

### Phase 5: Testing

#### Unit Tests

**Files to Create**:
- `test/services/payment_service_test.dart`
- `test/providers/payment_provider_test.dart`
- `test/services/pricing_calculator_test.dart`

**Examples**:
```dart
// payment_service_test.dart
void main() {
  group('PaymentService', () {
    test('createPayment returns PaymentResponse', () async {
      // Mock CloudFunctions
      // Call service
      // Assert response structure
    });

    test('throws PaymentException on error', () async {
      // Mock error response
      // Assert exception thrown
    });
  });
}

// pricing_calculator_test.dart
void main() {
  group('PricingCalculator', () {
    test('returns member price for members', () {
      final price = PricingCalculator.calculatePrice(
        operation: mockOperation,
        user: mockMember,
      );
      expect(price, 45.0);
    });

    test('returns location tariff if available', () {
      // Test with location having tariffs
    });
  });
}
```

**Estimated Time**: 6-8 hours

---

#### Integration Tests

**Firebase Emulator**:
- Test Cloud Functions with emulator
- Test Firestore updates
- Test webhook handling

**End-to-End Tests**:
- Register for event
- Click "Pay Now"
- Simulate Noda payment flow
- Verify UI updates
- Verify Firestore updated

**Estimated Time**: 5-6 hours

---

#### User Acceptance Testing

**With Club Members**:
- Test on real phones (iOS & Android)
- Test with real bank (sandbox accounts)
- Collect feedback on UI/UX
- Identify edge cases

**Estimated Time**: 4-6 hours

---

### Phase 6: Deployment

#### Production Configuration

**Cloud Functions**:
```bash
# Set production Noda API key
firebase functions:config:set noda.api_key="sk_live_PRODUCTION"
firebase functions:config:set noda.webhook_secret="whsec_PRODUCTION"

# Deploy functions
firebase deploy --only functions
```

**Flutter App**:
```bash
# iOS
flutter build ios --release

# Android
flutter build appbundle --release
```

**App Store & Google Play**:
- Create release notes
- Upload to App Store Connect (iOS)
- Upload to Google Play Console (Android)
- Set up phased rollout (10% → 25% → 50% → 100%)

**Estimated Time**: 5-6 hours

---

## Technical Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    CalyMob App (Flutter)             │
│  ┌────────────────────────────────────────────────┐ │
│  │  Operation Detail Screen                        │ │
│  │  ├─ Event Info                                 │ │
│  │  ├─ Registration Button                        │ │
│  │  └─ Payment Section (NEW)                      │ │
│  └────────────────────────────────────────────────┘ │
│              ↓                                        │
│  ┌────────────────────────────────────────────────┐ │
│  │  PaymentProvider (State Management)             │ │
│  │  ├─ createPayment()                            │ │
│  │  ├─ startPaymentStatusPolling()               │ │
│  │  └─ errorHandling()                            │ │
│  └────────────────────────────────────────────────┘ │
│              ↓                                        │
│  ┌────────────────────────────────────────────────┐ │
│  │  PaymentService (Business Logic)               │ │
│  │  ├─ Cloud Functions: createNodaPayment        │ │
│  │  ├─ Cloud Functions: checkNodaPaymentStatus   │ │
│  │  └─ Error handling                             │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
              ↓ HTTPS
┌─────────────────────────────────────────────────────┐
│          Firebase Cloud Functions                    │
│  ┌────────────────────────────────────────────────┐ │
│  │  createNodaPayment()                           │ │
│  │  ├─ Validate authentication                    │ │
│  │  ├─ Check participant exists                   │ │
│  │  ├─ Call Noda API                              │ │
│  │  ├─ Store payment_id in Firestore             │ │
│  │  └─ Return payment_url                         │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │  nodaWebhook()                                 │ │
│  │  ├─ Verify webhook signature                   │ │
│  │  ├─ Update Firestore: paye = true             │ │
│  │  ├─ Update Firestore: datePaiement            │ │
│  │  └─ Return 200 OK                              │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │  checkNodaPaymentStatus()                      │ │
│  │  ├─ Call Noda API GET /payments/{id}          │ │
│  │  └─ Return status                              │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
              ↓ HTTPS
┌─────────────────────────────────────────────────────┐
│          Firebase Firestore                          │
│  ┌────────────────────────────────────────────────┐ │
│  │  clubs/{clubId}/operation_participants        │ │
│  │  ├─ id, operationId, memberId                 │ │
│  │  ├─ prix, paye, datePaiement                  │ │
│  │  ├─ paymentId (from Noda)                     │ │
│  │  ├─ paymentStatus (pending→completed)        │ │
│  │  └─ paymentInitiatedAt                        │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
              ↓ REST API
┌─────────────────────────────────────────────────────┐
│          Noda API (noda.live)                        │
│  ├─ POST /v1/payments                              │ │
│  ├─ GET /v1/payments/{id}                          │ │
│  └─ Webhooks (POST to Cloud Functions)             │ │
└─────────────────────────────────────────────────────┘
```

### Data Flow

**Happy Path** (Successful Payment):
1. User taps "Pay Now" button → calls `PaymentProvider.createPayment()`
2. PaymentProvider calls `PaymentService.createPayment()`
3. PaymentService calls Cloud Function `createNodaPayment`
4. Cloud Function validates and calls Noda API
5. Noda returns `payment_url` and `payment_id`
6. Cloud Function stores `paymentId` and `paymentStatus: 'pending'` in Firestore
7. PaymentProvider receives `paymentUrl` and opens it in browser
8. User selects bank, authenticates, confirms payment
9. Noda processes payment and sends webhook to Cloud Function
10. Cloud Function receives webhook, verifies signature
11. Cloud Function updates Firestore: `paye: true`, `datePaiement: timestamp`
12. PaymentProvider's polling detects status change or Firestore stream updates UI
13. UI shows "✅ Payment Complete"

**Error Path** (Failed Payment):
1. User receives error message with "Retry" button
2. Taps "Retry" → goes back to step 1
3. Or user can dismiss and try again later

---

## Data Models & Integration

### Enhanced ParticipantOperation Model

**Current Fields** (already exist):
```dart
class ParticipantOperation {
  final String id;
  final String operationId;
  final String membreId;
  final double prix;
  final bool paye;
  final DateTime? datePaiement;
  final DateTime dateInscription;
  final String? commentaire;
}
```

**New Fields** (added by payment flow):
```dart
class ParticipantOperation {
  // ... existing fields ...

  // Payment tracking fields
  final String? paymentId;           // Noda payment ID (pay_xxx)
  final String? paymentStatus;       // pending, completed, failed, cancelled
  final DateTime? paymentInitiatedAt; // When payment was started
  final String? paymentMethod;       // noda_open_banking

  // Metadata
  final DateTime? updatedAt;         // Last update timestamp
}
```

**Firestore Collection Structure**:
```
clubs/{clubId}/operation_participants/{participantId}
├─ id: string
├─ operationId: string
├─ operationTitre: string (denormalized)
├─ membreId: string
├─ membreNom: string
├─ membrePrenom: string
├─ prix: number
├─ paye: boolean ← Updated by webhook
├─ datePaiement: timestamp ← Updated by webhook
├─ dateInscription: timestamp
├─ paymentId: string ← Set by Cloud Function
├─ paymentStatus: string ← Updated by webhook
├─ paymentInitiatedAt: timestamp ← Set by Cloud Function
├─ paymentMethod: string
├─ commentaire: string
└─ updatedAt: timestamp
```

### Integration with CalyCompta

**Current Mismatch**:
- CalyMob uses generic `Operation` type
- CalyCompta has specialized types: evenement, cotisation, caution, etc.

**Solution** (Phase 2):
- Create unified `Operation` model in both
- Ensure CalyCompta exports operation data with proper fields
- Mobile reads from shared Firestore collection
- Both apps update same collection

**Pricing Integration**:
- CalyCompta defines `DiveLocation` → Mobile queries it
- CalyCompta defines `Tariff` for each location → Mobile uses for pricing
- Mobile respects pricing rules from CalyCompta

---

## Testing Strategy

### Unit Tests (80% coverage)

**Payment Service**:
- ✅ Successful payment creation
- ✅ Error handling (invalid data, auth, network)
- ✅ Exception types

**Payment Provider**:
- ✅ State management
- ✅ Error message display
- ✅ Polling logic
- ✅ Cleanup

**Pricing Calculator**:
- ✅ Member vs non-member pricing
- ✅ Location-based tariffs
- ✅ Role-based pricing

**Operation Service**:
- ✅ Event queries
- ✅ Real-time streams
- ✅ Filtering logic

### Integration Tests

**Firebase Emulator**:
- ✅ Cloud Function invocation
- ✅ Firestore read/write
- ✅ Security rules validation

**End-to-End**:
- ✅ Full payment flow from UI
- ✅ Webhook processing
- ✅ UI updates after payment

### Manual Testing

**Sandbox Environment**:
- Test with Noda sandbox accounts
- Use 0.01€ test payments (free)
- Test all error scenarios
- Test with different payment amounts

**Real Devices**:
- iOS iPhone (real device)
- Android phone (real device)
- Test on WiFi and mobile data
- Test landscape/portrait rotation

**User Testing**:
- 5-10 club members
- Different mobile types
- Different banks
- Collect feedback

---

## Deployment Plan

### Pre-Deployment Checklist

```
Code & Tests:
☐ All unit tests pass (>80% coverage)
☐ All integration tests pass
☐ End-to-end tests pass
☐ Code review completed
☐ No console warnings/errors

Documentation:
☐ Code documented
☐ API documentation updated
☐ Release notes written
☐ User guide created
☐ Admin guide created

Infrastructure:
☐ Noda production account activated
☐ API keys obtained and stored securely
☐ Firebase configured for production
☐ Cloud Functions tested in staging
☐ Webhook URL configured in Noda
☐ Firestore backup completed

App Store / Google Play:
☐ Versioning updated (e.g., 1.1.0)
☐ Release notes prepared
☐ App screenshots updated
☐ Privacy policy reviewed
☐ Terms of service reviewed
```

### Deployment Steps

**Stage 1: Cloud Functions (Day 1)**
```bash
# Verify production config
firebase functions:config:get

# Deploy functions
firebase deploy --only functions

# Monitor logs
firebase functions:log
```

**Stage 2: Staging App Testing (Day 1-2)**
- Build staging version with production Firebase project
- Internal testing with team
- Verify payments work end-to-end

**Stage 3: Production App (Day 2-3)**
- Build production app
- Create release on App Store Connect (iOS)
- Create release on Google Play Console (Android)

**Stage 4: Phased Rollout (Days 3-7)**
- 10% rollout → Monitor for 24 hours
- 25% rollout → Monitor for 24 hours
- 50% rollout → Monitor for 24 hours
- 100% rollout → Full release

**Monitoring During Rollout**:
- Firebase Crashlytics: Check for payment-related crashes
- Cloud Functions dashboard: Monitor error rates
- Noda dashboard: Monitor payment success rate
- User feedback: Collect issues from early adopters

### Rollback Plan

**If Critical Issues Detected**:

1. **Immediate** (within 1 hour):
   - Disable payment feature via Firebase Remote Config
   - Show maintenance message to users
   - Pause app rollout

2. **Quick Fix** (within 4 hours):
   - Fix the issue
   - Deploy hotfix to Cloud Functions
   - Re-enable feature
   - Resume rollout

3. **Full Rollback** (if necessary):
   - Revert Cloud Functions to previous version
   - Yank problematic app version from stores
   - Release new version with feature disabled

---

## Risk Management

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Noda API unavailable | Low | High | Retry logic + fallback to manual payment |
| Webhook not received | Medium | High | Polling backup + manual verification |
| Payment timeout | Medium | Medium | 10-minute timeout + retry option |
| Double payment | Low | High | Server-side check (already-exists error) |
| App crash during payment | Medium | Low | Webhook continues process, UI syncs on restart |
| Firestore update failure | Low | Medium | Retry logic in Cloud Function |

**Mitigation Strategies**:
- ✅ Robust error handling in all services
- ✅ Comprehensive logging for debugging
- ✅ Retry logic with exponential backoff
- ✅ Fallback to manual payment entry
- ✅ Admin dashboard for manual updates
- ✅ Regular monitoring and alerting

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| User confusion on payment flow | Medium | Medium | Clear UI messaging + in-app guide |
| Resistance to change | Low | Low | Communication + smooth experience |
| Security concerns (banking) | Low | High | Emphasize Noda security + PSD2 compliance |
| Support burden | Medium | Medium | FAQ + clear error messages |

### Regulatory Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| GDPR compliance | Low | High | Noda handles data, no storage of banking info |
| PSD2 compliance | Very Low | Very High | Noda is FCA-regulated, compliant |
| Regional payment restrictions | Low | Medium | Support multiple payment methods |

---

## Success Criteria

### Technical Success

- ✅ Payment success rate > 95%
- ✅ Payment processing time < 30 seconds
- ✅ Zero payment-related crashes
- ✅ Webhook delivery rate > 99%
- ✅ Cloud Function response time < 5 seconds

### Business Success

- ✅ 50%+ of event registrations include payment
- ✅ User satisfaction score > 4/5
- ✅ Admin time for payment processing reduced by 80%
- ✅ Zero manual payment reconciliation needed
- ✅ Cost per transaction reduced (0.5% vs 2.5%)

### User Experience Success

- ✅ Payment flow completes in <1 minute
- ✅ Clear success/error messages
- ✅ No payment confirmation emails needed (in-app confirmation)
- ✅ Users can retry easily if payment fails
- ✅ Registration status visible in real-time

---

## Timeline Summary

| Phase | Duration | Start Date | End Date | Status |
|-------|----------|-----------|----------|--------|
| Phase 1: Backend | 4-5 days | Week 1, Day 1 | Week 1, Day 5 | ⏳ Ready |
| Phase 2: Payment UI | 4-5 days | Week 2, Day 1 | Week 2, Day 5 | ⏳ Ready |
| Phase 3: Enhanced Events | 3-4 days | Week 2, Day 3 | Week 3, Day 2 | ⏳ Ready |
| Phase 4: Pricing | 2-3 days | Week 2, Day 5 | Week 3, Day 2 | ⏳ Ready |
| Phase 5: Testing | 3-4 days | Week 3, Day 1 | Week 3, Day 4 | ⏳ Ready |
| Phase 6: Deployment | 2-3 days | Week 3, Day 5 | Week 4, Day 2 | ⏳ Ready |
| **Total** | **18-24 days** | **Week 1** | **Week 4** | ✅ Ready |

---

## Next Steps

### Week 1 (Backend Setup)

**Day 1: Setup**
- [ ] Initialize Firebase Cloud Functions
- [ ] Set up Noda merchant account (sandbox)
- [ ] Get API keys
- [ ] Review Noda API documentation

**Day 2-3: Implementation**
- [ ] Implement createNodaPayment function
- [ ] Implement nodaWebhook function
- [ ] Implement checkStatus function
- [ ] Unit tests

**Day 4-5: Testing**
- [ ] Local Firebase emulator testing
- [ ] Noda sandbox API testing
- [ ] Integration tests
- [ ] Manual webhook simulation

### Week 2 (UI & Features)

**Day 1-3: Payment UI**
- [ ] Register PaymentProvider in main.dart
- [ ] Add payment section to operation_detail_screen.dart
- [ ] Error handling and retry logic
- [ ] UI Polish

**Day 4-5: Enhanced Features**
- [ ] Event filtering (date, location)
- [ ] Capacity indicators
- [ ] Optional: Calendar view
- [ ] Pricing integration

### Week 3 (Testing & Deployment)

**Day 1-2: Testing**
- [ ] Unit tests (>80% coverage)
- [ ] Integration tests with emulator
- [ ] End-to-end testing
- [ ] Manual testing on real devices

**Day 3-4: User Testing**
- [ ] UAT with club members
- [ ] Feedback collection
- [ ] Bug fixes

**Day 5+: Production**
- [ ] Configuration for production
- [ ] Cloud Functions deployment
- [ ] App builds and submission
- [ ] Phased rollout

---

## Document Version & Status

- **Version**: 1.0
- **Created**: November 21, 2025
- **Last Updated**: November 21, 2025
- **Status**: ✅ Ready for Implementation
- **Next Review**: After Phase 1 completion

---

## Questions & Clarifications Needed

Before starting implementation, please provide answers to:

1. **Pricing Strategy**
   - [ ] Use simple member/non-member pricing only?
   - [ ] Implement full location-based tariff system?
   - [ ] Support role-based pricing (diver, instructor, student)?

2. **Event Features**
   - [ ] Required: Calendar view, or list-only is OK?
   - [ ] Required: Event search, or filters are enough?
   - [ ] Required: View participant list, or capacity only?

3. **Noda Setup**
   - [ ] Do you have Noda merchant account?
   - [ ] Do you have API keys (sandbox)?
   - [ ] Should I create account or will you?

4. **Deployment Priority**
   - [ ] Start with backend (Cloud Functions)?
   - [ ] Start with UI (Payment button)?
   - [ ] Do both in parallel?

5. **Timeline Flexibility**
   - [ ] Can you allocate 1-2 weeks?
   - [ ] Or do you prefer longer phases?
   - [ ] Any hard deadline?

---

## Contact & Support

- **Technical Questions**: Review NODA_INTEGRATION_PLAN.md (already exists)
- **Implementation Help**: Code examples provided for each phase
- **Testing Support**: Test scenarios documented in Phase 5
- **Deployment Help**: Step-by-step guide in Phase 6

---

**End of Document**

---

*This plan builds on the excellent foundation already in CalyMob. Most infrastructure is ready—we're primarily connecting the pieces and adding the UI layer.*
