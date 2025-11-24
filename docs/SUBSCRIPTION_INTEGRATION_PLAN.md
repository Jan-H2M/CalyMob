# Subscription Integration Plan - CalyMob & CalyCompta

**Document Created:** November 21, 2025
**Version:** 1.0
**Status:** Ready for Implementation
**Related Documents:**
- [EVENT_SUBSCRIPTION_PAYMENT_PLAN.md](./EVENT_SUBSCRIPTION_PAYMENT_PLAN.md)
- CalyCompta: `/src/types/index.ts`, `/src/services/operationService.ts`

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Architecture Overview](#architecture-overview)
4. [Feature Specification](#feature-specification)
5. [Phase Breakdown](#phase-breakdown)
6. [Technical Implementation](#technical-implementation)
7. [Data Models](#data-models)
8. [Business Logic](#business-logic)
9. [UI/UX Design](#uiux-design)
10. [Testing Strategy](#testing-strategy)
11. [Deployment Plan](#deployment-plan)
12. [Success Metrics](#success-metrics)

---

## Executive Summary

### Project Objectives

Enable Calypso DC club members to manage their annual subscriptions (cotisations) through CalyMob mobile app with the same seamless payment experience as event registrations.

**Key Features:**
1. **View subscription status** - Active, expired, or payment pending
2. **Select subscription type** - Role-based tariffs (plongeur, apneiste, instructor, etc.)
3. **Pay subscriptions instantly** - Same Noda payment flow as events
4. **Track renewal dates** - Period tracking with expiry notifications
5. **Automatic status updates** - Member status tied to subscription payment
6. **Subscription history** - View past subscriptions and payment history

### Strategic Benefits

**For Members:**
- ✅ Pay subscriptions from mobile phone (no bank transfer needed)
- ✅ Instant payment confirmation
- ✅ Clear subscription status visibility
- ✅ Renewal reminders
- ✅ Multiple payment options support

**For Club Administrators:**
- ✅ Automated member status management
- ✅ Real-time subscription tracking
- ✅ Reduced manual reconciliation (80% time savings)
- ✅ Better cash flow (instant payments)
- ✅ Unified financial tracking (events + subscriptions)

**Technical Advantages:**
- ✅ Reuses 70% of event payment infrastructure
- ✅ Shared Cloud Functions and payment services
- ✅ Unified data model (Operation + ParticipantOperation)
- ✅ Same transaction reconciliation system
- ✅ Consistent UI/UX patterns

### Current Progress

| Component | Status | Notes |
|-----------|--------|-------|
| Backend Data Model | ✅ Complete | CalyCompta Operation type='cotisation' |
| Payment Infrastructure | ✅ 70% Complete | Shares event payment system |
| Cloud Functions | ❌ Missing | Needs subscription-specific logic |
| Mobile UI | ❌ Missing | Subscription screens to create |
| Member Status Automation | ❌ Missing | Link payment → member status |
| Renewal Workflows | ❌ Missing | Notifications and reminders |
| Tariff Selection UI | ❌ Missing | Role-based pricing display |

### Timeline & Effort

- **Total Duration:** 2-3 weeks (10-15 development days)
- **Effort Required:** 30-40 developer-hours
- **Dependencies:** Event payment system (Phase 1-2 from EVENT_SUBSCRIPTION_PAYMENT_PLAN.md)
- **Team:** 1-2 Flutter developers + 1 Backend developer

### Budget Estimate

- **Development:** 30-40 hours × €50-75/hour = €1,500-3,000
- **Infrastructure:** Reuses existing Firebase + Noda (no additional cost)
- **Testing:** Included in development

---

## Current State Analysis

### What's Already Built (CalyCompta Web App)

#### 1. **Subscription Data Model** ✅

**Operation Interface with Subscription Support:**
```typescript
interface Operation {
  type: 'cotisation';           // Subscription type
  titre: string;                // "Cotisation Annuelle 2025"
  periode_debut: Date;          // 2025-01-01
  periode_fin: Date;            // 2025-12-31
  tarifs: Record<string, number>; // {plongeur: 130, apneiste: 80, instructeur: 50}
  montant_prevu: number;        // Budget planning
  statut: 'brouillon' | 'ouvert' | 'ferme' | 'annule';
}
```

**Payment Tracking (ParticipantOperation):**
```typescript
interface ParticipantOperation {
  id: string;
  operation_id: string;         // Links to subscription operation
  operation_type: 'cotisation';
  membre_id: string;
  prix: number;                 // Tariff amount (e.g., 130€)
  paye: boolean;                // Payment status
  date_paiement?: Date;         // Payment timestamp
  date_inscription: Date;       // Enrollment date
  lifras_id?: string;           // Member LIFRAS ID for quick lookup
}
```

**Member Status Fields:**
```typescript
interface Membre {
  member_status: 'active' | 'inactive' | 'archived';
  is_diver: boolean;
  has_lifras: boolean;
  date_adhesion?: Date;         // First membership date
  anciennete?: number;          // Years in club
}
```

#### 2. **Financial Integration** ✅

**Account Codes for Subscriptions:**
- `730-00-712`: Cotisations plongeurs (Revenue)
- `730-00-713`: Cotisations instructeurs (Revenue)
- `730-00-714`: Cotisations administrateurs (Revenue)
- `730-00-715`: Cotisations autres (Revenue)
- `730-00-711`: LIFRAS cotisations membres (Revenue)

**Categorization Rules:**
- Auto-categorizes subscription transactions
- Links bank transactions to subscription records
- Reconciliation with confidence scoring

#### 3. **Services Layer** ✅

**OperationService:**
- `createOperation(type: 'cotisation')` - Create subscription
- `getCotisations()` - Retrieve all subscriptions
- `validateOperation()` - Validates subscription fields

**InscriptionService:**
- `linkTransactionToParticipant()` - Link bank payment to subscription
- Fuzzy matching by name, amount, date
- Split transaction support

**MembreService:**
- `getMembres(filters)` - Filter by member_status
- `updateMembre()` - Update member status
- `grantAppAccess()` / `revokeAppAccess()` - Control access

### What's Missing

#### 1. **Mobile Subscription Screens** ❌

```
MISSING IN CalyMob:
- SubscriptionDashboardScreen: View current subscription status
- SubscriptionSelectionScreen: Choose subscription type/tariff
- SubscriptionPaymentScreen: Pay for subscription
- SubscriptionHistoryScreen: View past subscriptions
- RenewalReminderScreen: Handle renewal notifications
```

#### 2. **Subscription-Specific Cloud Functions** ❌

```
MISSING IN functions/:
- createSubscriptionPayment(): Handle subscription payment creation
- processSubscriptionWebhook(): Update member status on payment
- checkSubscriptionExpiry(): Background job for expiry checks
- sendRenewalReminders(): Notification service
- getMemberSubscriptionStatus(): Query current status
```

#### 3. **Member Status Automation** ❌

```
MISSING BUSINESS LOGIC:
- Auto-activate member on subscription payment
- Auto-deactivate member on subscription expiry
- Grace period handling (e.g., 30 days after expiry)
- Renewal reminder triggers (e.g., 30 days before expiry)
- Status transition rules (active → expired → inactive)
```

#### 4. **Tariff Management** ❌

```
MISSING IN CalyMob:
- Tariff model (DiveLocation-independent)
- TariffCalculator service (role-based pricing)
- Tariff selection UI with role detection
- Tariff explanation (why this price?)
- Support for multiple concurrent subscriptions (rare)
```

#### 5. **Renewal Workflows** ❌

```
MISSING:
- Renewal notification system
- Automatic renewal suggestion
- Past-due subscription handling
- Subscription history display per member
- Exemption management (who's exempt?)
```

---

## Architecture Overview

### System Architecture

```
┌───────────────────────────────────────────────────────��─────┐
│                    CalyMob App (Flutter)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Subscription Dashboard Screen (NEW)                  │   │
│  │  ├─ Current subscription status card                  │   │
│  │  ├─ Renewal reminder banner                           │   │
│  │  ├─ "Renew Subscription" button                       │   │
│  │  └─ Subscription history list                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↓                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Subscription Selection Screen (NEW)                  │   │
│  │  ├─ Tariff options list (Plongeur, Apneiste, etc.)  │   │
│  │  ├─ Price display per tariff                         │   │
│  │  ├─ Period display (2025-01-01 to 2025-12-31)       │   │
│  │  └─ "Continue to Payment" button                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↓                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Payment Screen (SHARED with Events)                  │   │
│  │  ├─ Amount confirmation                               │   │
│  │  ├─ "Pay Now" button                                  │   │
│  │  ├─ Noda payment flow                                 │   │
│  │  └─ Success/Error handling                            │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↓                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SubscriptionProvider (NEW State Management)          │   │
│  │  ├─ getCurrentSubscription()                          │   │
│  │  ├─ getAvailableSubscriptions()                       │   │
│  │  ├─ enrollInSubscription()                            │   │
│  │  ├─ checkExpiryStatus()                               │   │
│  │  └─ getSubscriptionHistory()                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↓                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SubscriptionService (NEW Business Logic)             │   │
│  │  ├─ Cloud Functions: createSubscriptionPayment       │   │
│  │  ├─ Cloud Functions: getMemberSubscriptionStatus     │   │
│  │  ├─ calculateExpiryDays()                             │   │
│  │  └─ selectAppropriateTariff()                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↓ HTTPS
┌─────────────────────────────────────────────────────────────┐
│          Firebase Cloud Functions (EXTENDED)                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  createSubscriptionPayment() (NEW)                    │   │
│  │  ├─ Validates member eligibility                      │   │
│  │  ├─ Checks for existing active subscription           │   │
│  │  ├─ Creates ParticipantOperation record               │   │
│  │  ├─ Calls Noda API (reuses createNodaPayment)        │   │
│  │  └─ Returns payment URL                               │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  processSubscriptionWebhook() (NEW)                   │   │
│  │  ├─ Receives Noda webhook (payment completed)        │   │
│  │  ├─ Updates ParticipantOperation (paye = true)       │   │
│  │  ├─ Updates Member (member_status = 'active')        │   │
│  │  ├─ Records subscription period start/end            │   │
│  │  └─ Sends confirmation notification                  │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  checkSubscriptionExpiry() (NEW - Scheduled)          │   │
│  │  ├─ Runs daily (Cloud Scheduler)                      │   │
│  │  ├─ Finds subscriptions expiring soon                │   │
│  │  ├─ Sends renewal reminders (30 days before)         │   │
│  │  ├─ Auto-deactivates expired members                 │   │
│  │  └─ Updates member_status accordingly                │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  getMemberSubscriptionStatus() (NEW)                  │   │
│  │  ├─ Queries current active subscription               │   │
│  │  ├─ Calculates days until expiry                      │   │
│  │  ├─ Returns subscription details + status             │   │
│  │  └─ Includes renewal eligibility                      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ↓ Firestore
┌─────────────────────────────────────────────────────────────┐
│          Firebase Firestore (EXTENDED)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  clubs/{clubId}/operations                            │   │
│  │  ├─ type: 'cotisation'                                │   │
│  │  ├─ titre: "Cotisation Annuelle 2025"                 │   │
│  │  ├─ periode_debut: 2025-01-01                         │   │
│  │  ├─ periode_fin: 2025-12-31                           │   │
│  │  ├─ tarifs: {plongeur: 130, apneiste: 80}            │   │
│  │  └─ statut: 'ouvert'                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  clubs/{clubId}/participants (ParticipantOperation)   │   │
│  │  ├─ operation_id: ref to cotisation operation         │   │
│  │  ├─ operation_type: 'cotisation'                      │   │
│  │  ├─ membre_id: user ID                                │   │
│  │  ├─ prix: 130 (selected tariff)                       │   │
│  │  ├─ paye: true (after payment)                        │   │
│  │  ├─ date_paiement: timestamp                          │   │
│  │  ├─ paymentId: Noda payment ID                        │   │
│  │  └─ subscription_period_end: 2025-12-31 (NEW)        │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  clubs/{clubId}/members (EXTENDED)                    │   │
│  │  ├─ member_status: 'active' (updated by webhook)     │   │
│  │  ├─ current_subscription_id: ref to participant (NEW) │   │
│  │  ├─ subscription_expiry: 2025-12-31 (NEW)            │   │
│  │  ├─ subscription_status: 'active' | 'expired' (NEW)  │   │
│  │  └─ last_subscription_payment: timestamp (NEW)       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Shared vs. Subscription-Specific Components

#### Shared with Event Payment System:
- ✅ PaymentProvider (state management)
- ✅ PaymentService (Noda API calls)
- ✅ Operation model (type='cotisation' vs 'evenement')
- ✅ ParticipantOperation model (payment tracking)
- ✅ Cloud Function: createNodaPayment (generic)
- ✅ Cloud Function: nodaWebhook (generic with type routing)
- ✅ Payment UI components (button, status, confirmation)

#### Subscription-Specific:
- 🆕 SubscriptionProvider (subscription state management)
- 🆕 SubscriptionService (subscription business logic)
- 🆕 Tariff model (role-based pricing)
- 🆕 TariffCalculator (price calculation)
- 🆕 Cloud Function: checkSubscriptionExpiry (scheduled job)
- 🆕 Cloud Function: sendRenewalReminders (notifications)
- 🆕 Cloud Function: getMemberSubscriptionStatus (query)
- 🆕 Subscription UI screens (dashboard, selection, history)
- 🆕 Member status automation logic
- 🆕 Renewal notification system

### Data Flow: Subscription Payment

**Happy Path:**
1. Member opens app → Dashboard shows "Subscription Expired" banner
2. Member taps "Renew Subscription" → SubscriptionSelectionScreen
3. Member sees tariff options: Plongeur (€130), Apneiste (€80), etc.
4. Member selects "Plongeur" → System auto-detects member's role
5. Member taps "Continue to Payment" → PaymentScreen
6. PaymentProvider calls SubscriptionService.enrollInSubscription()
7. SubscriptionService calls Cloud Function: createSubscriptionPayment()
8. Cloud Function:
   - Validates no active subscription exists
   - Creates Operation record (type='cotisation') if needed
   - Creates ParticipantOperation record (paye=false)
   - Calls Noda API for payment URL
   - Returns payment URL to client
9. PaymentProvider opens payment URL in browser
10. Member completes payment in bank app
11. Noda sends webhook → processSubscriptionWebhook()
12. Cloud Function:
    - Updates ParticipantOperation (paye=true, date_paiement=now)
    - Updates Membre (member_status='active', subscription_expiry=2025-12-31)
    - Sends confirmation notification
13. App UI updates via Firestore stream → "✅ Subscription Active"

---

## Feature Specification

### Feature 1: Subscription Dashboard

**User Story:**
> As a club member, I want to see my current subscription status at a glance, so I know if I need to renew.

**Acceptance Criteria:**
- [ ] Display current subscription status: Active, Expiring Soon, Expired, or Not Subscribed
- [ ] Show subscription period (e.g., "Valid until 31/12/2025")
- [ ] Show days remaining until expiry (e.g., "45 days remaining")
- [ ] Display renewal reminder banner 30 days before expiry
- [ ] Show "Renew Now" button when renewal eligible
- [ ] Display subscription type/tariff (e.g., "Plongeur - €130")
- [ ] Link to subscription history
- [ ] Show payment status if pending

**UI Elements:**
- Status card with color coding:
  - Green: Active (>30 days remaining)
  - Orange: Expiring soon (<30 days)
  - Red: Expired
  - Grey: No subscription
- Progress indicator for subscription period
- Action buttons: "Renew", "View History", "Payment Status"

**Technical Requirements:**
- Real-time Firestore stream for subscription status
- Calculate days remaining client-side
- Cache status for offline viewing
- Push notification support for expiry reminders

---

### Feature 2: Subscription Selection & Enrollment

**User Story:**
> As a club member, I want to select the appropriate subscription type for my role, so I pay the correct amount.

**Acceptance Criteria:**
- [ ] Display all available subscription tariffs from current open cotisation operation
- [ ] Auto-suggest tariff based on member's role (e.g., instructor → Instructeur tariff)
- [ ] Show clear pricing for each tariff option
- [ ] Display subscription period dates (start and end)
- [ ] Explain what's included in subscription (if available)
- [ ] Prevent enrollment if active subscription already exists
- [ ] Show confirmation dialog before payment
- [ ] Handle edge cases (no open subscriptions, all subscriptions closed)

**UI Elements:**
- Tariff selection cards/list:
  - Tariff name (e.g., "Plongeur")
  - Price (€130)
  - "Recommended for you" badge if auto-suggested
  - Description (if available)
- Period display: "Valid from 01/01/2025 to 31/12/2025"
- Confirmation dialog with summary
- Error messages for edge cases

**Technical Requirements:**
- Query Firestore for open cotisation operations (statut='ouvert')
- Parse tarifs object: `{plongeur: 130, apneiste: 80, instructeur: 50}`
- Auto-detect member role from Membre.is_diver, role fields, etc.
- Validate no overlapping active subscription
- Create ParticipantOperation record on enrollment

**Business Rules:**
- Only one active subscription per member per period
- Must select tariff before payment
- Subscription must be in 'ouvert' status
- Tariff must exist in tarifs object
- Price must be > 0

---

### Feature 3: Subscription Payment

**User Story:**
> As a club member, I want to pay my subscription instantly via mobile payment, so I don't have to do a bank transfer.

**Acceptance Criteria:**
- [ ] Reuses existing PaymentProvider and PaymentService
- [ ] Show payment summary: Subscription type, amount, period
- [ ] "Pay Now" button triggers Noda payment flow
- [ ] Opens Noda payment URL in browser/in-app
- [ ] Polls payment status every 3 seconds
- [ ] Shows loading state while payment in progress
- [ ] Shows success confirmation when payment complete
- [ ] Shows error message with retry option if payment fails
- [ ] Updates member status to 'active' immediately on payment success
- [ ] Updates subscription expiry date in member record

**UI Elements:**
- Payment summary card (same as event payments)
- "Pay €130 - Cotisation Plongeur 2025" button
- Loading indicator with status text
- Success screen with checkmark and confirmation
- Error screen with retry button

**Technical Requirements:**
- Call createSubscriptionPayment Cloud Function
- Pass operation_type='cotisation' to payment service
- Handle webhook response for subscription-specific updates
- Update Membre.member_status and Membre.subscription_expiry
- Send push notification on successful payment
- Link payment to accounting category 730-00-712 (or appropriate)

**Integration with Existing Payment System:**
```dart
// Reuses existing PaymentProvider.createPayment()
// But passes subscription-specific metadata:
await paymentProvider.createPayment(
  clubId: clubId,
  operationId: subscriptionOperationId,
  participantId: participantId,
  amount: selectedTariffPrice,
  description: "Cotisation ${tariffName} 2025",
  metadata: {
    'operation_type': 'cotisation',
    'tariff_name': tariffName,
    'period_start': '2025-01-01',
    'period_end': '2025-12-31',
  },
);
```

---

### Feature 4: Member Status Automation

**User Story:**
> As a club administrator, I want member status to automatically update based on subscription payment, so I don't have to manually manage access.

**Acceptance Criteria:**
- [ ] Member status changes to 'active' immediately on subscription payment
- [ ] Member status changes to 'inactive' when subscription expires (grace period optional)
- [ ] Member.subscription_expiry field stores expiry date
- [ ] Member.current_subscription_id links to active ParticipantOperation
- [ ] Member.subscription_status shows 'active', 'expired', or 'none'
- [ ] Daily Cloud Scheduler job checks for expiring subscriptions
- [ ] Renewal reminders sent 30 days before expiry (configurable)
- [ ] Grace period support (e.g., 30 days after expiry before deactivation)
- [ ] Audit log records all status changes

**Business Rules:**

**Status Transition Rules:**
```
Member Status Lifecycle:

1. No Subscription:
   member_status = 'inactive'
   subscription_status = 'none'
   subscription_expiry = null

2. Subscription Paid:
   member_status = 'active'
   subscription_status = 'active'
   subscription_expiry = operation.periode_fin (e.g., 2025-12-31)
   current_subscription_id = participant_id

3. Subscription Expiring (30 days before expiry):
   member_status = 'active' (still active)
   subscription_status = 'expiring'
   Send renewal reminder notification

4. Subscription Expired (grace period: 0-30 days after expiry):
   member_status = 'active' (grace period)
   subscription_status = 'expired'
   Show "Expired - Renew Now" banner

5. After Grace Period (>30 days after expiry):
   member_status = 'inactive'
   subscription_status = 'expired'
   Revoke app access (optional)
```

**Technical Requirements:**
- Extend Membre interface with new fields:
  ```typescript
  interface Membre {
    // Existing fields...
    member_status: 'active' | 'inactive' | 'archived';

    // NEW subscription fields:
    subscription_status?: 'active' | 'expiring' | 'expired' | 'none';
    subscription_expiry?: Date;
    current_subscription_id?: string;
    last_subscription_payment?: Date;
    subscription_grace_period_days?: number; // Default: 30
  }
  ```

- Cloud Function: processSubscriptionWebhook()
  ```javascript
  async function processSubscriptionWebhook(webhookData) {
    const { payment_id, status, metadata } = webhookData;
    const { clubId, operationId, participantId } = metadata;

    if (status === 'completed') {
      // 1. Update ParticipantOperation
      await updateParticipant(participantId, {
        paye: true,
        date_paiement: now(),
      });

      // 2. Get operation to retrieve period
      const operation = await getOperation(operationId);

      // 3. Update Member status
      const participant = await getParticipant(participantId);
      await updateMember(participant.membre_id, {
        member_status: 'active',
        subscription_status: 'active',
        subscription_expiry: operation.periode_fin,
        current_subscription_id: participantId,
        last_subscription_payment: now(),
      });

      // 4. Send confirmation notification
      await sendNotification(participant.membre_id, {
        title: 'Subscription Activated',
        body: `Your subscription is now active until ${operation.periode_fin}`,
      });
    }
  }
  ```

- Cloud Scheduler Function: checkSubscriptionExpiry()
  ```javascript
  // Runs daily at 00:00 UTC
  async function checkSubscriptionExpiry() {
    const today = new Date();
    const in30Days = addDays(today, 30);
    const gracePeriodEnd = subtractDays(today, 30);

    // 1. Find expiring subscriptions (30 days warning)
    const expiring = await findMembers({
      subscription_expiry: { between: [today, in30Days] },
      subscription_status: 'active',
    });

    for (const member of expiring) {
      await updateMember(member.id, { subscription_status: 'expiring' });
      await sendRenewalReminder(member.id);
    }

    // 2. Find expired subscriptions (past expiry date)
    const expired = await findMembers({
      subscription_expiry: { lessThan: today },
      subscription_status: { in: ['active', 'expiring'] },
    });

    for (const member of expired) {
      await updateMember(member.id, { subscription_status: 'expired' });
      await sendExpiryNotification(member.id);
    }

    // 3. Deactivate members past grace period
    const deactivate = await findMembers({
      subscription_expiry: { lessThan: gracePeriodEnd },
      member_status: 'active',
    });

    for (const member of deactivate) {
      await updateMember(member.id, {
        member_status: 'inactive',
        subscription_status: 'expired',
      });
      await sendDeactivationNotification(member.id);
    }
  }
  ```

---

### Feature 5: Renewal Reminders & Notifications

**User Story:**
> As a club member, I want to receive timely reminders to renew my subscription, so I don't lose access to club events.

**Acceptance Criteria:**
- [ ] First reminder: 30 days before expiry (push notification)
- [ ] Second reminder: 7 days before expiry (push notification + email)
- [ ] Final reminder: On expiry date (push notification + email)
- [ ] In-app banner shows renewal reminder when subscription expiring
- [ ] Direct link from notification to subscription renewal screen
- [ ] Notification includes expiry date and renewal instructions
- [ ] Email notification includes payment link (deep link to app)
- [ ] Grace period notification: "Your subscription expired X days ago"

**Notification Templates:**

**30-Day Reminder:**
```
Title: "Subscription Expiring Soon"
Body: "Your Calypso DC subscription expires on 31/12/2025. Renew now to continue enjoying club events."
Action: [Renew Now] → Opens SubscriptionSelectionScreen
```

**7-Day Reminder:**
```
Title: "Subscription Expires in 7 Days"
Body: "Don't forget to renew your subscription before 31/12/2025 to avoid interruption."
Action: [Renew Now] → Opens SubscriptionSelectionScreen
```

**Expiry Notification:**
```
Title: "Subscription Expired"
Body: "Your subscription expired today. Renew now to continue accessing club events."
Action: [Renew Now] → Opens SubscriptionSelectionScreen
```

**Grace Period Notification:**
```
Title: "Subscription Expired - Grace Period Active"
Body: "Your subscription expired 15 days ago. You have 15 days left to renew before your access is suspended."
Action: [Renew Now] → Opens SubscriptionSelectionScreen
```

**Technical Requirements:**
- Firebase Cloud Messaging (FCM) for push notifications
- SendGrid/Firebase Email for email notifications
- Deep links for direct navigation to renewal screen
- Notification history in Firestore (prevent duplicate notifications)
- Configurable reminder schedule (admin can adjust timing)

---

### Feature 6: Subscription History

**User Story:**
> As a club member, I want to view my subscription history, so I can track my payments and membership periods.

**Acceptance Criteria:**
- [ ] Display list of all past subscriptions
- [ ] Show subscription period, tariff, amount, payment date
- [ ] Show payment status (paid, pending, failed)
- [ ] Filter by year or status
- [ ] Link to payment receipt (future)
- [ ] Show total amount paid over time
- [ ] Export history to PDF (optional)

**UI Elements:**
- List of subscription cards:
  - Period: "2024-01-01 to 2024-12-31"
  - Tariff: "Plongeur"
  - Amount: "€130"
  - Status: "✅ Paid on 15/12/2023"
- Filter dropdown: "All", "2025", "2024", "2023"
- Summary card: "Total paid: €390 (3 subscriptions)"

**Technical Requirements:**
- Query ParticipantOperation where operation_type='cotisation'
- Order by date_inscription DESC
- Cache for offline viewing
- Support pagination for long histories

---

## Phase Breakdown

### Phase 1: Backend Infrastructure (3-4 days)

**Objective:** Extend Cloud Functions to support subscription payments and member status automation

**Deliverables:**
- ✅ Extended Cloud Functions for subscription-specific logic
- ✅ Scheduled job for expiry checking
- ✅ Member status update logic in webhook
- ✅ Notification service for reminders

**Key Tasks:**
1. Extend createNodaPayment to handle subscriptions
2. Create getMemberSubscriptionStatus Cloud Function
3. Extend nodaWebhook to update member status
4. Create checkSubscriptionExpiry scheduled function
5. Create sendRenewalReminders notification service
6. Unit tests for all functions
7. Integration tests with emulator

**Estimated Effort:** 12-15 hours

---

### Phase 2: Data Model Extensions (1-2 days)

**Objective:** Extend Membre model with subscription fields

**Deliverables:**
- ✅ Membre interface extended with subscription fields
- ✅ Migration script for existing members
- ✅ Firestore security rules updated
- ✅ Index creation for efficient queries

**Key Tasks:**
1. Add subscription fields to Membre interface
2. Create Firestore migration script
3. Update security rules for new fields
4. Create composite indexes for queries
5. Test data integrity

**Estimated Effort:** 4-6 hours

---

### Phase 3: Flutter Services & Providers (3-4 days)

**Objective:** Create subscription-specific services and state management

**Deliverables:**
- ✅ SubscriptionService (business logic)
- ✅ SubscriptionProvider (state management)
- ✅ TariffCalculator (pricing logic)
- ✅ Integration with existing PaymentService

**Key Tasks:**
1. Create SubscriptionService
2. Create SubscriptionProvider
3. Create TariffCalculator
4. Integrate with PaymentService
5. Unit tests for all services
6. Integration tests

**Estimated Effort:** 12-15 hours

---

### Phase 4: Mobile UI Screens (4-5 days)

**Objective:** Build subscription management screens in CalyMob

**Deliverables:**
- ✅ SubscriptionDashboardScreen
- ✅ SubscriptionSelectionScreen
- ✅ SubscriptionHistoryScreen
- ✅ Renewal reminder banner component
- ✅ Navigation integration

**Key Tasks:**
1. Build SubscriptionDashboardScreen
2. Build SubscriptionSelectionScreen
3. Build SubscriptionHistoryScreen
4. Build renewal reminder banner
5. Integrate with navigation
6. UI/UX polish
7. Responsive design testing

**Estimated Effort:** 16-20 hours

---

### Phase 5: Notification System (2-3 days)

**Objective:** Implement push and email notifications for renewals

**Deliverables:**
- ✅ FCM push notification setup
- ✅ Email notification templates
- ✅ Notification scheduling logic
- ✅ Deep link handling
- ✅ Notification history tracking

**Key Tasks:**
1. Configure FCM in Firebase Console
2. Implement push notification service
3. Create email templates
4. Implement notification scheduling
5. Set up deep links
6. Test notification delivery
7. Handle notification permissions

**Estimated Effort:** 8-12 hours

---

### Phase 6: Testing & Validation (2-3 days)

**Objective:** Comprehensive testing of subscription system

**Deliverables:**
- ✅ Unit tests (>80% coverage)
- ✅ Integration tests
- ✅ End-to-end tests
- ✅ User acceptance testing

**Key Tasks:**
1. Unit test all services and providers
2. Integration test Cloud Functions
3. End-to-end subscription flow testing
4. Test expiry and renewal workflows
5. Test notifications
6. UAT with club members
7. Bug fixes

**Estimated Effort:** 10-12 hours

---

### Phase 7: Deployment (1-2 days)

**Objective:** Deploy subscription system to production

**Deliverables:**
- ✅ Cloud Functions deployed
- ✅ Cloud Scheduler configured
- ✅ Mobile app updated and released
- ✅ Monitoring configured

**Key Tasks:**
1. Deploy Cloud Functions to production
2. Configure Cloud Scheduler job
3. Build and release mobile app
4. Configure monitoring and alerts
5. Create admin documentation
6. Train administrators
7. Phased rollout

**Estimated Effort:** 6-8 hours

---

## Technical Implementation

### Phase 1: Backend Implementation Details

#### Task 1.1: Extend createNodaPayment for Subscriptions

**Location:** `functions/src/payment/createPayment.js`

**Changes:**
```javascript
exports.createNodaPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated');

  const { clubId, operationId, participantId, amount, description, metadata } = data;

  // NEW: Check operation type
  const operation = await admin.firestore()
    .doc(`clubs/${clubId}/operations/${operationId}`)
    .get();

  if (!operation.exists) {
    throw new functions.https.HttpsError('not-found', 'Operation not found');
  }

  const operationType = operation.data().type; // 'evenement' or 'cotisation'

  // NEW: If subscription, check for existing active subscription
  if (operationType === 'cotisation') {
    const existingSubscription = await admin.firestore()
      .collection(`clubs/${clubId}/participants`)
      .where('membre_id', '==', context.auth.uid)
      .where('operation_type', '==', 'cotisation')
      .where('paye', '==', true)
      .get();

    // Check if any existing subscription is still valid
    const now = new Date();
    for (const doc of existingSubscription.docs) {
      const subscriptionEnd = doc.data().subscription_period_end?.toDate();
      if (subscriptionEnd && subscriptionEnd > now) {
        throw new functions.https.HttpsError(
          'already-exists',
          'You already have an active subscription'
        );
      }
    }
  }

  // Verify participant exists and not already paid
  const participant = await admin.firestore()
    .doc(`clubs/${clubId}/participants/${participantId}`)
    .get();

  if (!participant.exists) {
    throw new functions.https.HttpsError('not-found', 'Participant record not found');
  }

  if (participant.data().paye === true) {
    throw new functions.https.HttpsError('already-exists', 'Payment already completed');
  }

  // Call Noda API (unchanged)
  const nodaResponse = await axios.post(
    'https://api.noda.live/v1/payments',
    {
      amount: amount,
      currency: 'EUR',
      description: description,
      reference: `${clubId}_${operationId}_${participantId}`,
      webhook_url: functions.config().noda.webhook_url,
      metadata: {
        clubId,
        operationId,
        participantId,
        operationType, // NEW: Pass operation type to webhook
        ...metadata,
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${functions.config().noda.api_key}`,
        'Content-Type': 'application/json'
      }
    }
  );

  // Store payment reference (add subscription period if cotisation)
  const updateData = {
    paymentId: nodaResponse.data.payment_id,
    paymentStatus: 'pending',
    paymentInitiatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // NEW: Store subscription period for subscriptions
  if (operationType === 'cotisation') {
    updateData.subscription_period_start = operation.data().periode_debut;
    updateData.subscription_period_end = operation.data().periode_fin;
  }

  await admin.firestore()
    .doc(`clubs/${clubId}/participants/${participantId}`)
    .update(updateData);

  return {
    paymentId: nodaResponse.data.payment_id,
    paymentUrl: nodaResponse.data.payment_url,
    status: 'pending'
  };
});
```

**Estimated Time:** 2-3 hours

---

#### Task 1.2: Extend nodaWebhook for Subscription Status Updates

**Location:** `functions/src/payment/webhook.js`

**Changes:**
```javascript
exports.nodaWebhook = functions.https.onRequest(async (req, res) => {
  // Verify signature (unchanged)
  const signature = req.headers['x-noda-signature'];
  if (!verifySignature(req.body, signature, functions.config().noda.webhook_secret)) {
    return res.status(401).send('Unauthorized');
  }

  const { payment_id, status, metadata } = req.body;
  const { clubId, operationId, participantId, operationType } = metadata;

  if (status === 'completed') {
    // Update ParticipantOperation (unchanged)
    await admin.firestore()
      .doc(`clubs/${clubId}/participants/${participantId}`)
      .update({
        paye: true,
        datePaiement: admin.firestore.FieldValue.serverTimestamp(),
        paymentId: payment_id,
        paymentStatus: 'completed'
      });

    // NEW: If subscription, update member status
    if (operationType === 'cotisation') {
      await processSubscriptionPayment(clubId, operationId, participantId);
    }
  } else if (status === 'failed') {
    await admin.firestore()
      .doc(`clubs/${clubId}/participants/${participantId}`)
      .update({
        paymentStatus: 'failed'
      });
  }

  res.status(200).send({ received: true });
});

// NEW: Subscription-specific payment processing
async function processSubscriptionPayment(clubId, operationId, participantId) {
  // 1. Get participant record
  const participantDoc = await admin.firestore()
    .doc(`clubs/${clubId}/participants/${participantId}`)
    .get();

  if (!participantDoc.exists) return;

  const participant = participantDoc.data();
  const membreId = participant.membre_id;

  // 2. Get operation to retrieve subscription period
  const operationDoc = await admin.firestore()
    .doc(`clubs/${clubId}/operations/${operationId}`)
    .get();

  if (!operationDoc.exists) return;

  const operation = operationDoc.data();

  // 3. Update member status
  await admin.firestore()
    .doc(`clubs/${clubId}/members/${membreId}`)
    .update({
      member_status: 'active',
      subscription_status: 'active',
      subscription_expiry: operation.periode_fin,
      current_subscription_id: participantId,
      last_subscription_payment: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

  // 4. Log status change in audit log
  await admin.firestore()
    .collection(`clubs/${clubId}/members/${membreId}/audit_logs`)
    .add({
      action: 'subscription_activated',
      performed_by: 'system',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: {
        subscription_id: participantId,
        operation_id: operationId,
        period_start: operation.periode_debut,
        period_end: operation.periode_fin,
        amount: participant.prix,
      },
    });

  // 5. Send confirmation notification
  await sendNotification(membreId, {
    title: 'Subscription Activated',
    body: `Your subscription is now active until ${formatDate(operation.periode_fin)}`,
    data: {
      type: 'subscription_activated',
      subscription_id: participantId,
    },
  });

  // 6. Record notification sent
  await admin.firestore()
    .collection(`clubs/${clubId}/notifications`)
    .add({
      membre_id: membreId,
      type: 'subscription_activated',
      title: 'Subscription Activated',
      body: `Your subscription is now active until ${formatDate(operation.periode_fin)}`,
      sent_at: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
    });
}
```

**Estimated Time:** 3-4 hours

---

#### Task 1.3: Create checkSubscriptionExpiry Scheduled Function

**Location:** `functions/src/subscription/checkExpiry.js`

**New File:**
```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Runs daily at 00:00 UTC
exports.checkSubscriptionExpiry = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('Starting subscription expiry check...');

    const today = new Date();
    const in30Days = new Date(today);
    in30Days.setDate(today.getDate() + 30);

    const in7Days = new Date(today);
    in7Days.setDate(today.getDate() + 7);

    const gracePeriodEnd = new Date(today);
    gracePeriodEnd.setDate(today.getDate() - 30);

    const clubsSnapshot = await admin.firestore().collection('clubs').get();

    for (const clubDoc of clubsSnapshot.docs) {
      const clubId = clubDoc.id;

      // 1. Find expiring subscriptions (30 days warning - first reminder)
      await processExpiringSubscriptions(clubId, today, in30Days, 30);

      // 2. Find expiring subscriptions (7 days warning - second reminder)
      await processExpiringSubscriptions(clubId, today, in7Days, 7);

      // 3. Find expired subscriptions (today)
      await processExpiredSubscriptions(clubId, today);

      // 4. Deactivate members past grace period
      await deactivateExpiredMembers(clubId, gracePeriodEnd);
    }

    console.log('Subscription expiry check completed.');
    return null;
  });

async function processExpiringSubscriptions(clubId, today, futureDate, daysRemaining) {
  const membersSnapshot = await admin.firestore()
    .collection(`clubs/${clubId}/members`)
    .where('subscription_expiry', '>=', today)
    .where('subscription_expiry', '<=', futureDate)
    .where('subscription_status', '==', 'active')
    .get();

  console.log(`Found ${membersSnapshot.size} subscriptions expiring in ${daysRemaining} days for club ${clubId}`);

  for (const memberDoc of membersSnapshot.docs) {
    const memberId = memberDoc.id;
    const member = memberDoc.data();

    // Check if we already sent this reminder
    const notificationCheck = await admin.firestore()
      .collection(`clubs/${clubId}/notifications`)
      .where('membre_id', '==', memberId)
      .where('type', '==', `subscription_expiring_${daysRemaining}d`)
      .where('sent_at', '>=', today)
      .get();

    if (notificationCheck.size > 0) {
      console.log(`Reminder already sent to member ${memberId}`);
      continue;
    }

    // Update status to 'expiring' (only first time)
    if (daysRemaining === 30 && member.subscription_status === 'active') {
      await memberDoc.ref.update({
        subscription_status: 'expiring',
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Send renewal reminder
    const expiryDate = member.subscription_expiry.toDate();
    await sendNotification(memberId, {
      title: 'Subscription Expiring Soon',
      body: `Your subscription expires on ${formatDate(expiryDate)}. Renew now to continue enjoying club events.`,
      data: {
        type: 'subscription_expiring',
        days_remaining: daysRemaining.toString(),
        expiry_date: expiryDate.toISOString(),
      },
    });

    // Record notification
    await admin.firestore()
      .collection(`clubs/${clubId}/notifications`)
      .add({
        membre_id: memberId,
        type: `subscription_expiring_${daysRemaining}d`,
        title: 'Subscription Expiring Soon',
        body: `Your subscription expires in ${daysRemaining} days.`,
        sent_at: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });

    console.log(`Sent ${daysRemaining}-day reminder to member ${memberId}`);
  }
}

async function processExpiredSubscriptions(clubId, today) {
  const membersSnapshot = await admin.firestore()
    .collection(`clubs/${clubId}/members`)
    .where('subscription_expiry', '<', today)
    .where('subscription_status', 'in', ['active', 'expiring'])
    .get();

  console.log(`Found ${membersSnapshot.size} expired subscriptions for club ${clubId}`);

  for (const memberDoc of membersSnapshot.docs) {
    const memberId = memberDoc.id;
    const member = memberDoc.data();

    // Update status to 'expired'
    await memberDoc.ref.update({
      subscription_status: 'expired',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send expiry notification
    const expiryDate = member.subscription_expiry.toDate();
    const daysExpired = Math.floor((today - expiryDate) / (1000 * 60 * 60 * 24));

    await sendNotification(memberId, {
      title: 'Subscription Expired',
      body: `Your subscription expired ${daysExpired} days ago. Renew now to continue accessing club events.`,
      data: {
        type: 'subscription_expired',
        days_expired: daysExpired.toString(),
        expiry_date: expiryDate.toISOString(),
      },
    });

    // Record notification
    await admin.firestore()
      .collection(`clubs/${clubId}/notifications`)
      .add({
        membre_id: memberId,
        type: 'subscription_expired',
        title: 'Subscription Expired',
        body: `Your subscription expired ${daysExpired} days ago.`,
        sent_at: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });

    console.log(`Sent expiry notification to member ${memberId}`);
  }
}

async function deactivateExpiredMembers(clubId, gracePeriodEnd) {
  const membersSnapshot = await admin.firestore()
    .collection(`clubs/${clubId}/members`)
    .where('subscription_expiry', '<', gracePeriodEnd)
    .where('member_status', '==', 'active')
    .get();

  console.log(`Found ${membersSnapshot.size} members to deactivate for club ${clubId}`);

  for (const memberDoc of membersSnapshot.docs) {
    const memberId = memberDoc.id;
    const member = memberDoc.data();

    // Deactivate member
    await memberDoc.ref.update({
      member_status: 'inactive',
      subscription_status: 'expired',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Log status change
    await admin.firestore()
      .collection(`clubs/${clubId}/members/${memberId}/audit_logs`)
      .add({
        action: 'member_deactivated',
        performed_by: 'system',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        reason: 'subscription_expired',
        details: {
          subscription_expiry: member.subscription_expiry,
          grace_period_days: 30,
        },
      });

    // Send deactivation notification
    await sendNotification(memberId, {
      title: 'Membership Deactivated',
      body: 'Your membership has been deactivated due to expired subscription. Renew now to restore access.',
      data: {
        type: 'membership_deactivated',
        reason: 'subscription_expired',
      },
    });

    // Record notification
    await admin.firestore()
      .collection(`clubs/${clubId}/notifications`)
      .add({
        membre_id: memberId,
        type: 'membership_deactivated',
        title: 'Membership Deactivated',
        body: 'Your membership has been deactivated.',
        sent_at: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });

    console.log(`Deactivated member ${memberId}`);
  }
}

async function sendNotification(memberId, payload) {
  // Get FCM token for member
  const memberDoc = await admin.firestore()
    .doc(`users/${memberId}`)
    .get();

  if (!memberDoc.exists) return;

  const fcmToken = memberDoc.data().fcm_token;
  if (!fcmToken) {
    console.log(`No FCM token for member ${memberId}`);
    return;
  }

  // Send push notification
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
      android: {
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    });
    console.log(`Notification sent to member ${memberId}`);
  } catch (error) {
    console.error(`Failed to send notification to member ${memberId}:`, error);
  }
}

function formatDate(date) {
  if (!(date instanceof Date)) {
    date = date.toDate();
  }
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}
```

**Cloud Scheduler Setup:**
```bash
# Enable Cloud Scheduler API
gcloud services enable cloudscheduler.googleapis.com

# The function will automatically create the schedule via:
# functions.pubsub.schedule('0 0 * * *')

# To manually trigger for testing:
firebase functions:shell
> checkSubscriptionExpiry()
```

**Estimated Time:** 4-5 hours

---

#### Task 1.4: Create getMemberSubscriptionStatus Cloud Function

**Location:** `functions/src/subscription/getStatus.js`

**New File:**
```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.getMemberSubscriptionStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { clubId } = data;
  const membreId = context.auth.uid;

  // 1. Get member document
  const memberDoc = await admin.firestore()
    .doc(`clubs/${clubId}/members/${membreId}`)
    .get();

  if (!memberDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Member not found');
  }

  const member = memberDoc.data();

  // 2. Get current subscription if exists
  let currentSubscription = null;
  if (member.current_subscription_id) {
    const subscriptionDoc = await admin.firestore()
      .doc(`clubs/${clubId}/participants/${member.current_subscription_id}`)
      .get();

    if (subscriptionDoc.exists) {
      currentSubscription = {
        id: subscriptionDoc.id,
        ...subscriptionDoc.data(),
      };
    }
  }

  // 3. Calculate days until expiry
  let daysUntilExpiry = null;
  let daysExpired = null;
  if (member.subscription_expiry) {
    const expiryDate = member.subscription_expiry.toDate();
    const today = new Date();
    const diffTime = expiryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= 0) {
      daysUntilExpiry = diffDays;
    } else {
      daysExpired = Math.abs(diffDays);
    }
  }

  // 4. Get available subscriptions (open cotisation operations)
  const subscriptionsSnapshot = await admin.firestore()
    .collection(`clubs/${clubId}/operations`)
    .where('type', '==', 'cotisation')
    .where('statut', '==', 'ouvert')
    .get();

  const availableSubscriptions = subscriptionsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));

  // 5. Check renewal eligibility
  const renewalEligible =
    member.subscription_status === 'expiring' ||
    member.subscription_status === 'expired' ||
    member.subscription_status === 'none' ||
    (daysUntilExpiry !== null && daysUntilExpiry <= 60); // Allow early renewal

  // 6. Return comprehensive status
  return {
    member_status: member.member_status || 'inactive',
    subscription_status: member.subscription_status || 'none',
    subscription_expiry: member.subscription_expiry?.toDate().toISOString() || null,
    days_until_expiry: daysUntilExpiry,
    days_expired: daysExpired,
    current_subscription: currentSubscription,
    available_subscriptions: availableSubscriptions,
    renewal_eligible: renewalEligible,
    grace_period_active: daysExpired !== null && daysExpired <= 30,
    last_subscription_payment: member.last_subscription_payment?.toDate().toISOString() || null,
  };
});
```

**Usage in Flutter:**
```dart
final status = await SubscriptionService.getMemberSubscriptionStatus(clubId);

if (status.subscriptionStatus == 'expiring') {
  showRenewalBanner();
} else if (status.subscriptionStatus == 'expired') {
  showExpiredBanner();
}
```

**Estimated Time:** 2-3 hours

---

### Phase 3: Flutter Services Implementation

#### Task 3.1: Create SubscriptionService

**Location:** `lib/services/subscription_service.dart`

**New File:**
```dart
import 'package:cloud_functions/cloud_functions.dart';
import '../models/subscription_status.dart';
import '../models/operation.dart';
import '../models/participant_operation.dart';

class SubscriptionService {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

  /// Get current subscription status for authenticated member
  Future<SubscriptionStatus> getMemberSubscriptionStatus(String clubId) async {
    try {
      final result = await _functions.httpsCallable('getMemberSubscriptionStatus').call({
        'clubId': clubId,
      });

      return SubscriptionStatus.fromJson(result.data);
    } on FirebaseFunctionsException catch (e) {
      throw SubscriptionException(
        code: e.code,
        message: _getFriendlyErrorMessage(e.code),
        details: e.details,
      );
    } catch (e) {
      throw SubscriptionException(
        code: 'unknown',
        message: 'Failed to retrieve subscription status: $e',
      );
    }
  }

  /// Enroll member in subscription (create ParticipantOperation record)
  Future<ParticipantOperation> enrollInSubscription({
    required String clubId,
    required String operationId,
    required String tariffName,
    required double price,
  }) async {
    try {
      // This creates the ParticipantOperation record
      // Payment is handled separately via PaymentService

      final participantData = {
        'club_id': clubId,
        'operation_id': operationId,
        'operation_type': 'cotisation',
        'prix': price,
        'tariff_name': tariffName,
        'paye': false,
        'date_inscription': FieldValue.serverTimestamp(),
      };

      // Create participant record in Firestore
      final docRef = await FirebaseFirestore.instance
          .collection('clubs/$clubId/participants')
          .add(participantData);

      final doc = await docRef.get();
      return ParticipantOperation.fromFirestore(doc);
    } catch (e) {
      throw SubscriptionException(
        code: 'enrollment-failed',
        message: 'Failed to enroll in subscription: $e',
      );
    }
  }

  /// Get subscription history for member
  Future<List<ParticipantOperation>> getSubscriptionHistory(
    String clubId,
    String membreId,
  ) async {
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('clubs/$clubId/participants')
          .where('membre_id', isEqualTo: membreId)
          .where('operation_type', isEqualTo: 'cotisation')
          .orderBy('date_inscription', descending: true)
          .get();

      return snapshot.docs
          .map((doc) => ParticipantOperation.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw SubscriptionException(
        code: 'history-fetch-failed',
        message: 'Failed to retrieve subscription history: $e',
      );
    }
  }

  /// Get available subscription operations (open cotisations)
  Future<List<Operation>> getAvailableSubscriptions(String clubId) async {
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('clubs/$clubId/operations')
          .where('type', isEqualTo: 'cotisation')
          .where('statut', isEqualTo: 'ouvert')
          .get();

      return snapshot.docs
          .map((doc) => Operation.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw SubscriptionException(
        code: 'fetch-failed',
        message: 'Failed to retrieve available subscriptions: $e',
      );
    }
  }

  /// Calculate days until expiry
  int? calculateDaysUntilExpiry(DateTime? expiryDate) {
    if (expiryDate == null) return null;

    final now = DateTime.now();
    final difference = expiryDate.difference(now);
    return difference.inDays;
  }

  /// Check if member is in grace period
  bool isInGracePeriod(DateTime? expiryDate, {int gracePeriodDays = 30}) {
    if (expiryDate == null) return false;

    final now = DateTime.now();
    final daysSinceExpiry = now.difference(expiryDate).inDays;

    return daysSinceExpiry > 0 && daysSinceExpiry <= gracePeriodDays;
  }

  /// User-friendly error messages
  String _getFriendlyErrorMessage(String code) {
    switch (code) {
      case 'unauthenticated':
        return 'You must be logged in to view subscription status';
      case 'not-found':
        return 'Member profile not found';
      case 'already-exists':
        return 'You already have an active subscription';
      case 'unavailable':
        return 'Subscription service temporarily unavailable';
      default:
        return 'An error occurred while processing your subscription';
    }
  }
}

/// Subscription-specific exception
class SubscriptionException implements Exception {
  final String code;
  final String message;
  final dynamic details;

  SubscriptionException({
    required this.code,
    required this.message,
    this.details,
  });

  @override
  String toString() => 'SubscriptionException: $message (code: $code)';
}
```

**Estimated Time:** 3-4 hours

---

#### Task 3.2: Create SubscriptionProvider

**Location:** `lib/providers/subscription_provider.dart`

**New File:**
```dart
import 'package:flutter/foundation.dart';
import '../services/subscription_service.dart';
import '../models/subscription_status.dart';
import '../models/operation.dart';
import '../models/participant_operation.dart';

class SubscriptionProvider with ChangeNotifier {
  final SubscriptionService _subscriptionService = SubscriptionService();

  SubscriptionStatus? _currentStatus;
  List<Operation>? _availableSubscriptions;
  List<ParticipantOperation>? _subscriptionHistory;

  bool _isLoading = false;
  String? _errorMessage;

  // Getters
  SubscriptionStatus? get currentStatus => _currentStatus;
  List<Operation>? get availableSubscriptions => _availableSubscriptions;
  List<ParticipantOperation>? get subscriptionHistory => _subscriptionHistory;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;

  // Computed properties
  bool get hasActiveSubscription =>
      _currentStatus?.subscriptionStatus == 'active';

  bool get isExpiring =>
      _currentStatus?.subscriptionStatus == 'expiring';

  bool get isExpired =>
      _currentStatus?.subscriptionStatus == 'expired';

  bool get renewalEligible =>
      _currentStatus?.renewalEligible ?? false;

  int? get daysUntilExpiry => _currentStatus?.daysUntilExpiry;

  int? get daysExpired => _currentStatus?.daysExpired;

  bool get isInGracePeriod => _currentStatus?.gracePeriodActive ?? false;

  /// Load subscription status for member
  Future<void> loadSubscriptionStatus(String clubId) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _currentStatus = await _subscriptionService.getMemberSubscriptionStatus(clubId);
      _errorMessage = null;
    } on SubscriptionException catch (e) {
      _errorMessage = e.message;
      _currentStatus = null;
    } catch (e) {
      _errorMessage = 'Failed to load subscription status';
      _currentStatus = null;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Load available subscriptions
  Future<void> loadAvailableSubscriptions(String clubId) async {
    try {
      _availableSubscriptions = await _subscriptionService.getAvailableSubscriptions(clubId);
      notifyListeners();
    } on SubscriptionException catch (e) {
      _errorMessage = e.message;
      _availableSubscriptions = null;
      notifyListeners();
    }
  }

  /// Load subscription history
  Future<void> loadSubscriptionHistory(String clubId, String membreId) async {
    try {
      _subscriptionHistory = await _subscriptionService.getSubscriptionHistory(clubId, membreId);
      notifyListeners();
    } on SubscriptionException catch (e) {
      _errorMessage = e.message;
      _subscriptionHistory = null;
      notifyListeners();
    }
  }

  /// Enroll in subscription
  Future<ParticipantOperation?> enrollInSubscription({
    required String clubId,
    required String operationId,
    required String tariffName,
    required double price,
  }) async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final participant = await _subscriptionService.enrollInSubscription(
        clubId: clubId,
        operationId: operationId,
        tariffName: tariffName,
        price: price,
      );

      _errorMessage = null;
      _isLoading = false;
      notifyListeners();

      return participant;
    } on SubscriptionException catch (e) {
      _errorMessage = e.message;
      _isLoading = false;
      notifyListeners();
      return null;
    }
  }

  /// Refresh all subscription data
  Future<void> refresh(String clubId, String membreId) async {
    await Future.wait([
      loadSubscriptionStatus(clubId),
      loadAvailableSubscriptions(clubId),
      loadSubscriptionHistory(clubId, membreId),
    ]);
  }

  /// Clear error message
  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  /// Reset provider state
  void reset() {
    _currentStatus = null;
    _availableSubscriptions = null;
    _subscriptionHistory = null;
    _isLoading = false;
    _errorMessage = null;
    notifyListeners();
  }
}
```

**Register in main.dart:**
```dart
MultiProvider(
  providers: [
    ChangeNotifierProvider(create: (_) => AuthProvider()),
    ChangeNotifierProvider(create: (_) => OperationProvider()),
    ChangeNotifierProvider(create: (_) => PaymentProvider()),
    ChangeNotifierProvider(create: (_) => SubscriptionProvider()), // NEW
  ],
  child: MyApp(),
)
```

**Estimated Time:** 3-4 hours

---

### Phase 4: Mobile UI Implementation

#### Task 4.1: Create SubscriptionDashboardScreen

**Location:** `lib/screens/subscription/subscription_dashboard_screen.dart`

**New File:**
```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../providers/subscription_provider.dart';
import '../../providers/auth_provider.dart';
import 'subscription_selection_screen.dart';
import 'subscription_history_screen.dart';

class SubscriptionDashboardScreen extends StatefulWidget {
  final String clubId;

  const SubscriptionDashboardScreen({Key? key, required this.clubId}) : super(key: key);

  @override
  State<SubscriptionDashboardScreen> createState() => _SubscriptionDashboardScreenState();
}

class _SubscriptionDashboardScreenState extends State<SubscriptionDashboardScreen> {
  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final subscriptionProvider = context.read<SubscriptionProvider>();
    final authProvider = context.read<AuthProvider>();

    await subscriptionProvider.loadSubscriptionStatus(widget.clubId);
    await subscriptionProvider.loadAvailableSubscriptions(widget.clubId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Subscription'),
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => SubscriptionHistoryScreen(clubId: widget.clubId),
                ),
              );
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadData,
        child: Consumer<SubscriptionProvider>(
          builder: (context, provider, child) {
            if (provider.isLoading) {
              return const Center(child: CircularProgressIndicator());
            }

            if (provider.errorMessage != null) {
              return _buildErrorView(provider.errorMessage!);
            }

            return SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildStatusCard(provider),
                  const SizedBox(height: 16),
                  if (provider.renewalEligible) _buildRenewalBanner(),
                  if (provider.renewalEligible) const SizedBox(height: 16),
                  _buildSubscriptionDetails(provider),
                  const SizedBox(height: 24),
                  if (provider.renewalEligible) _buildRenewButton(),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildStatusCard(SubscriptionProvider provider) {
    final status = provider.currentStatus;
    if (status == null) return const SizedBox.shrink();

    Color statusColor;
    IconData statusIcon;
    String statusText;

    switch (status.subscriptionStatus) {
      case 'active':
        if (provider.daysUntilExpiry != null && provider.daysUntilExpiry! <= 30) {
          statusColor = Colors.orange;
          statusIcon = Icons.warning;
          statusText = 'Expiring Soon';
        } else {
          statusColor = Colors.green;
          statusIcon = Icons.check_circle;
          statusText = 'Active';
        }
        break;
      case 'expiring':
        statusColor = Colors.orange;
        statusIcon = Icons.warning;
        statusText = 'Expiring Soon';
        break;
      case 'expired':
        statusColor = Colors.red;
        statusIcon = Icons.error;
        statusText = 'Expired';
        break;
      case 'none':
      default:
        statusColor = Colors.grey;
        statusIcon = Icons.info;
        statusText = 'No Subscription';
    }

    return Card(
      color: statusColor.withOpacity(0.1),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: statusColor, width: 2),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Row(
              children: [
                Icon(statusIcon, color: statusColor, size: 40),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        statusText,
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (status.subscriptionExpiry != null)
                        Text(
                          'Valid until ${DateFormat('dd/MM/yyyy').format(DateTime.parse(status.subscriptionExpiry!))}',
                          style: TextStyle(
                            color: Colors.grey[700],
                            fontSize: 14,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            if (provider.daysUntilExpiry != null) ...[
              const SizedBox(height: 16),
              LinearProgressIndicator(
                value: provider.daysUntilExpiry! / 365,
                backgroundColor: Colors.grey[300],
                color: statusColor,
              ),
              const SizedBox(height: 8),
              Text(
                '${provider.daysUntilExpiry} days remaining',
                style: TextStyle(
                  color: Colors.grey[700],
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
            if (provider.daysExpired != null) ...[
              const SizedBox(height: 16),
              Text(
                'Expired ${provider.daysExpired} days ago',
                style: TextStyle(
                  color: statusColor,
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
              if (provider.isInGracePeriod)
                Text(
                  'Grace period: ${30 - provider.daysExpired!} days left',
                  style: TextStyle(
                    color: Colors.grey[700],
                    fontSize: 14,
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildRenewalBanner() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.orange[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.orange, width: 2),
      ),
      child: Row(
        children: [
          Icon(Icons.notifications_active, color: Colors.orange[700], size: 30),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Renewal Required',
                  style: TextStyle(
                    color: Colors.orange[900],
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'Renew your subscription to continue accessing club events',
                  style: TextStyle(
                    color: Colors.grey[700],
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSubscriptionDetails(SubscriptionProvider provider) {
    final status = provider.currentStatus;
    if (status == null || status.currentSubscription == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Icon(Icons.card_membership, size: 64, color: Colors.grey[400]),
              const SizedBox(height: 16),
              Text(
                'No Active Subscription',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w500,
                  color: Colors.grey[700],
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Subscribe now to access club events and activities',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey[600],
                ),
              ),
            ],
          ),
        ),
      );
    }

    final subscription = status.currentSubscription!;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Subscription Details',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Colors.grey[800],
              ),
            ),
            const Divider(height: 24),
            _buildDetailRow('Type', subscription.tariffName ?? 'Standard'),
            _buildDetailRow(
              'Amount',
              NumberFormat.currency(locale: 'fr_FR', symbol: '€').format(subscription.prix),
            ),
            if (subscription.datePaiement != null)
              _buildDetailRow(
                'Paid on',
                DateFormat('dd/MM/yyyy').format(subscription.datePaiement!),
              ),
            if (status.subscriptionExpiry != null)
              _buildDetailRow(
                'Valid until',
                DateFormat('dd/MM/yyyy').format(DateTime.parse(status.subscriptionExpiry!)),
              ),
            if (subscription.paye)
              _buildDetailRow(
                'Status',
                '✅ Paid',
                valueColor: Colors.green,
              )
            else
              _buildDetailRow(
                'Status',
                '⏳ Payment Pending',
                valueColor: Colors.orange,
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value, {Color? valueColor}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey[600],
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: valueColor ?? Colors.grey[800],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRenewButton() {
    return SizedBox(
      height: 56,
      child: ElevatedButton.icon(
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => SubscriptionSelectionScreen(clubId: widget.clubId),
            ),
          );
        },
        icon: const Icon(Icons.refresh, size: 24),
        label: const Text(
          'Renew Subscription',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.blue,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }

  Widget _buildErrorView(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 64, color: Colors.red[300]),
            const SizedBox(height: 16),
            Text(
              'Error Loading Subscription',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.grey[800],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _loadData,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
```

**Estimated Time:** 6-8 hours

---

#### Task 4.2: Create SubscriptionSelectionScreen

**Location:** `lib/screens/subscription/subscription_selection_screen.dart`

**New File:**
```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../providers/subscription_provider.dart';
import '../../providers/payment_provider.dart';
import '../../providers/auth_provider.dart';
import '../../models/operation.dart';

class SubscriptionSelectionScreen extends StatefulWidget {
  final String clubId;

  const SubscriptionSelectionScreen({Key? key, required this.clubId}) : super(key: key);

  @override
  State<SubscriptionSelectionScreen> createState() => _SubscriptionSelectionScreenState();
}

class _SubscriptionSelectionScreenState extends State<SubscriptionSelectionScreen> {
  Operation? _selectedOperation;
  String? _selectedTariffKey;
  double? _selectedTariffPrice;

  @override
  void initState() {
    super.initState();
    _loadSubscriptions();
  }

  Future<void> _loadSubscriptions() async {
    final provider = context.read<SubscriptionProvider>();
    await provider.loadAvailableSubscriptions(widget.clubId);

    // Auto-select first operation if available
    if (mounted && provider.availableSubscriptions?.isNotEmpty == true) {
      setState(() {
        _selectedOperation = provider.availableSubscriptions!.first;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Select Subscription'),
      ),
      body: Consumer<SubscriptionProvider>(
        builder: (context, provider, child) {
          if (provider.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (provider.availableSubscriptions == null || provider.availableSubscriptions!.isEmpty) {
            return _buildNoSubscriptionsView();
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildOperationSelector(provider.availableSubscriptions!),
                const SizedBox(height: 24),
                if (_selectedOperation != null) ...[
                  _buildPeriodCard(),
                  const SizedBox(height: 24),
                  _buildTariffSelection(),
                  const SizedBox(height: 32),
                  _buildContinueButton(),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildOperationSelector(List<Operation> operations) {
    if (operations.length == 1) {
      // Single subscription - show as info card
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Subscription Period',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey[800],
                ),
              ),
              const SizedBox(height: 8),
              Text(
                operations.first.titre,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w500),
              ),
            ],
          ),
        ),
      );
    }

    // Multiple subscriptions - show dropdown
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Select Subscription Period',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.grey[800],
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<Operation>(
              value: _selectedOperation,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
              items: operations.map((op) {
                return DropdownMenuItem(
                  value: op,
                  child: Text(op.titre),
                );
              }).toList(),
              onChanged: (value) {
                setState(() {
                  _selectedOperation = value;
                  _selectedTariffKey = null;
                  _selectedTariffPrice = null;
                });
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPeriodCard() {
    if (_selectedOperation == null) return const SizedBox.shrink();

    final startDate = _selectedOperation!.periodeDebut;
    final endDate = _selectedOperation!.periodeFin;

    return Card(
      color: Colors.blue[50],
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(Icons.calendar_today, color: Colors.blue[700], size: 32),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Validity Period',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: Colors.grey[700],
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${DateFormat('dd/MM/yyyy').format(startDate!)} - ${DateFormat('dd/MM/yyyy').format(endDate!)}',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.blue[900],
                    ),
                  ),
                  Text(
                    'Valid for ${endDate.difference(startDate).inDays} days',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTariffSelection() {
    if (_selectedOperation == null || _selectedOperation!.tarifs == null) {
      return const SizedBox.shrink();
    }

    final tarifs = _selectedOperation!.tarifs!;
    final tariffEntries = tarifs.entries.toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Select Subscription Type',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Colors.grey[800],
          ),
        ),
        const SizedBox(height: 12),
        ...tariffEntries.map((entry) => _buildTariffCard(
          tariffKey: entry.key,
          tariffName: _formatTariffName(entry.key),
          price: entry.value,
        )),
      ],
    );
  }

  Widget _buildTariffCard({
    required String tariffKey,
    required String tariffName,
    required double price,
  }) {
    final isSelected = _selectedTariffKey == tariffKey;
    final isRecommended = _isTariffRecommended(tariffKey);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isSelected ? Colors.blue : Colors.grey[300]!,
          width: isSelected ? 2 : 1,
        ),
      ),
      child: InkWell(
        onTap: () {
          setState(() {
            _selectedTariffKey = tariffKey;
            _selectedTariffPrice = price;
          });
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Radio<String>(
                value: tariffKey,
                groupValue: _selectedTariffKey,
                onChanged: (value) {
                  setState(() {
                    _selectedTariffKey = value;
                    _selectedTariffPrice = price;
                  });
                },
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          tariffName,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        if (isRecommended) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.green,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Text(
                              'Recommended',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _getTariffDescription(tariffKey),
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Text(
                NumberFormat.currency(locale: 'fr_FR', symbol: '€').format(price),
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: isSelected ? Colors.blue : Colors.grey[800],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildContinueButton() {
    final isEnabled = _selectedTariffKey != null && _selectedTariffPrice != null;

    return SizedBox(
      height: 56,
      child: ElevatedButton.icon(
        onPressed: isEnabled ? _handleContinue : null,
        icon: const Icon(Icons.payment, size: 24),
        label: Text(
          _selectedTariffPrice != null
              ? 'Continue to Payment - ${NumberFormat.currency(locale: 'fr_FR', symbol: '€').format(_selectedTariffPrice)}'
              : 'Select a subscription type',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.blue,
          disabledBackgroundColor: Colors.grey[300],
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
    );
  }

  Widget _buildNoSubscriptionsView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.card_membership, size: 80, color: Colors.grey[400]),
            const SizedBox(height: 24),
            Text(
              'No Subscriptions Available',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.grey[700],
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'There are currently no open subscriptions. Please contact club administrators.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey[600],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleContinue() async {
    if (_selectedOperation == null || _selectedTariffKey == null || _selectedTariffPrice == null) {
      return;
    }

    // Show confirmation dialog
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirm Subscription'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Subscription: ${_formatTariffName(_selectedTariffKey!)}'),
            const SizedBox(height: 8),
            Text('Period: ${DateFormat('dd/MM/yyyy').format(_selectedOperation!.periodeDebut!)} - ${DateFormat('dd/MM/yyyy').format(_selectedOperation!.periodeFin!)}'),
            const SizedBox(height: 8),
            Text(
              'Amount: ${NumberFormat.currency(locale: 'fr_FR', symbol: '€').format(_selectedTariffPrice)}',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            Text(
              'You will be redirected to complete payment.',
              style: TextStyle(fontSize: 13, color: Colors.grey[600]),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Continue to Payment'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    // Enroll in subscription
    final subscriptionProvider = context.read<SubscriptionProvider>();
    final authProvider = context.read<AuthProvider>();

    final participant = await subscriptionProvider.enrollInSubscription(
      clubId: widget.clubId,
      operationId: _selectedOperation!.id,
      tariffName: _formatTariffName(_selectedTariffKey!),
      price: _selectedTariffPrice!,
    );

    if (participant == null) {
      // Show error
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(subscriptionProvider.errorMessage ?? 'Failed to enroll in subscription'),
            backgroundColor: Colors.red,
          ),
        );
      }
      return;
    }

    // Proceed to payment
    _handlePayment(participant.id);
  }

  Future<void> _handlePayment(String participantId) async {
    final paymentProvider = context.read<PaymentProvider>();

    // Show loading dialog
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const AlertDialog(
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
      // Create payment
      final paymentUrl = await paymentProvider.createPayment(
        clubId: widget.clubId,
        operationId: _selectedOperation!.id,
        participantId: participantId,
        amount: _selectedTariffPrice!,
        description: 'Cotisation ${_formatTariffName(_selectedTariffKey!)} ${_selectedOperation!.titre}',
        metadata: {
          'operation_type': 'cotisation',
          'tariff_name': _selectedTariffKey,
        },
      );

      if (mounted) Navigator.pop(context); // Close loading dialog

      if (paymentUrl == null) {
        // Error
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(paymentProvider.errorMessage ?? 'Payment error'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      // Open payment URL
      final uri = Uri.parse(paymentUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);

        // Start polling for completion
        paymentProvider.startPaymentStatusPolling(
          paymentProvider.currentPaymentId!,
          (status) {
            if (status.isCompleted && mounted) {
              // Payment successful - return to dashboard
              Navigator.popUntil(context, (route) => route.isFirst);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('✅ Subscription activated successfully!'),
                  backgroundColor: Colors.green,
                ),
              );
            } else if (status.isFailed && mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Payment failed. Please try again.'),
                  backgroundColor: Colors.red,
                ),
              );
            }
          },
        );
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context); // Close loading dialog
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  String _formatTariffName(String key) {
    // Capitalize first letter
    return key[0].toUpperCase() + key.substring(1);
  }

  bool _isTariffRecommended(String tariffKey) {
    // TODO: Implement logic to auto-suggest tariff based on member role
    // For now, recommend "plongeur" by default
    return tariffKey.toLowerCase() == 'plongeur';
  }

  String _getTariffDescription(String tariffKey) {
    switch (tariffKey.toLowerCase()) {
      case 'plongeur':
        return 'For regular diving members';
      case 'apneiste':
        return 'For freediving members';
      case 'instructeur':
      case 'encadrant':
        return 'For instructors and supervisors';
      case 'junior':
        return 'For members under 18 years old';
      case 'etudiant':
        return 'For students with valid student card';
      case 'decouverte':
        return 'For trial/discovery membership';
      default:
        return 'Standard membership subscription';
    }
  }
}
```

**Estimated Time:** 8-10 hours

---

#### Task 4.3: Create SubscriptionHistoryScreen

**Location:** `lib/screens/subscription/subscription_history_screen.dart`

**New File:**
```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../providers/subscription_provider.dart';
import '../../providers/auth_provider.dart';
import '../../models/participant_operation.dart';

class SubscriptionHistoryScreen extends StatefulWidget {
  final String clubId;

  const SubscriptionHistoryScreen({Key? key, required this.clubId}) : super(key: key);

  @override
  State<SubscriptionHistoryScreen> createState() => _SubscriptionHistoryScreenState();
}

class _SubscriptionHistoryScreenState extends State<SubscriptionHistoryScreen> {
  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    final subscriptionProvider = context.read<SubscriptionProvider>();
    final authProvider = context.read<AuthProvider>();

    if (authProvider.currentUser != null) {
      await subscriptionProvider.loadSubscriptionHistory(
        widget.clubId,
        authProvider.currentUser!.id,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Subscription History'),
      ),
      body: Consumer<SubscriptionProvider>(
        builder: (context, provider, child) {
          if (provider.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (provider.subscriptionHistory == null || provider.subscriptionHistory!.isEmpty) {
            return _buildEmptyView();
          }

          return RefreshIndicator(
            onRefresh: _loadHistory,
            child: Column(
              children: [
                _buildSummaryCard(provider.subscriptionHistory!),
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: provider.subscriptionHistory!.length,
                    itemBuilder: (context, index) {
                      final subscription = provider.subscriptionHistory![index];
                      return _buildSubscriptionCard(subscription);
                    },
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSummaryCard(List<ParticipantOperation> history) {
    final paidSubscriptions = history.where((s) => s.paye).toList();
    final totalPaid = paidSubscriptions.fold<double>(0, (sum, s) => sum + s.prix);
    final pendingCount = history.where((s) => !s.paye).length;

    return Card(
      margin: const EdgeInsets.all(16),
      color: Colors.blue[50],
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildSummaryStat(
                  'Total Subscriptions',
                  history.length.toString(),
                  Icons.card_membership,
                ),
                _buildSummaryStat(
                  'Total Paid',
                  NumberFormat.currency(locale: 'fr_FR', symbol: '€').format(totalPaid),
                  Icons.euro,
                ),
              ],
            ),
            if (pendingCount > 0) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.orange[100],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.warning, size: 16, color: Colors.orange[700]),
                    const SizedBox(width: 8),
                    Text(
                      '$pendingCount subscription(s) with pending payment',
                      style: TextStyle(fontSize: 12, color: Colors.orange[900]),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryStat(String label, String value, IconData icon) {
    return Column(
      children: [
        Icon(icon, size: 32, color: Colors.blue[700]),
        const SizedBox(height: 8),
        Text(
          value,
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: Colors.blue[900],
          ),
        ),
        Text(
          label,
          style: TextStyle(fontSize: 12, color: Colors.grey[600]),
        ),
      ],
    );
  }

  Widget _buildSubscriptionCard(ParticipantOperation subscription) {
    final isPaid = subscription.paye;
    final statusColor = isPaid ? Colors.green : Colors.orange;
    final statusIcon = isPaid ? Icons.check_circle : Icons.hourglass_empty;
    final statusText = isPaid ? 'Paid' : 'Pending';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () => _showSubscriptionDetails(subscription),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          subscription.operationTitre ?? 'Subscription',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        if (subscription.tariffName != null)
                          Text(
                            subscription.tariffName!,
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.grey[600],
                            ),
                          ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        NumberFormat.currency(locale: 'fr_FR', symbol: '€').format(subscription.prix),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: statusColor.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(statusIcon, size: 14, color: statusColor),
                            const SizedBox(width: 4),
                            Text(
                              statusText,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: statusColor,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const Divider(height: 24),
              Row(
                children: [
                  Icon(Icons.date_range, size: 16, color: Colors.grey[600]),
                  const SizedBox(width: 8),
                  Text(
                    'Enrolled: ${DateFormat('dd/MM/yyyy').format(subscription.dateInscription)}',
                    style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                  ),
                ],
              ),
              if (isPaid && subscription.datePaiement != null) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.payment, size: 16, color: Colors.grey[600]),
                    const SizedBox(width: 8),
                    Text(
                      'Paid: ${DateFormat('dd/MM/yyyy').format(subscription.datePaiement!)}',
                      style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                    ),
                  ],
                ),
              ],
              if (subscription.subscriptionPeriodEnd != null) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.calendar_today, size: 16, color: Colors.grey[600]),
                    const SizedBox(width: 8),
                    Text(
                      'Valid until: ${DateFormat('dd/MM/yyyy').format(subscription.subscriptionPeriodEnd!)}',
                      style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history, size: 80, color: Colors.grey[400]),
            const SizedBox(height: 24),
            Text(
              'No Subscription History',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.grey[700],
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Your subscription history will appear here once you subscribe.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey[600],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showSubscriptionDetails(ParticipantOperation subscription) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        minChildSize: 0.4,
        maxChildSize: 0.9,
        expand: false,
        builder: (context, scrollController) => SingleChildScrollView(
          controller: scrollController,
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Subscription Details',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey[800],
                ),
              ),
              const SizedBox(height: 24),
              _buildDetailRow('Subscription', subscription.operationTitre ?? 'N/A'),
              if (subscription.tariffName != null)
                _buildDetailRow('Type', subscription.tariffName!),
              _buildDetailRow(
                'Amount',
                NumberFormat.currency(locale: 'fr_FR', symbol: '€').format(subscription.prix),
              ),
              _buildDetailRow(
                'Enrolled On',
                DateFormat('dd/MM/yyyy HH:mm').format(subscription.dateInscription),
              ),
              if (subscription.paye && subscription.datePaiement != null)
                _buildDetailRow(
                  'Paid On',
                  DateFormat('dd/MM/yyyy HH:mm').format(subscription.datePaiement!),
                ),
              if (subscription.subscriptionPeriodEnd != null)
                _buildDetailRow(
                  'Valid Until',
                  DateFormat('dd/MM/yyyy').format(subscription.subscriptionPeriodEnd!),
                ),
              _buildDetailRow(
                'Payment Status',
                subscription.paye ? '✅ Paid' : '⏳ Pending',
              ),
              if (subscription.paymentId != null)
                _buildDetailRow('Payment ID', subscription.paymentId!),
              if (subscription.commentaire != null && subscription.commentaire!.isNotEmpty)
                _buildDetailRow('Comment', subscription.commentaire!),
              const SizedBox(height: 24),
              if (!subscription.paye)
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      Navigator.pop(context);
                      // TODO: Implement retry payment
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Payment retry feature coming soon'),
                        ),
                      );
                    },
                    icon: const Icon(Icons.payment),
                    label: const Text('Complete Payment'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: Colors.grey[600],
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.grey[800],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
```

**Estimated Time:** 6-8 hours

---

## Data Models

### SubscriptionStatus Model

**Location:** `lib/models/subscription_status.dart`

```dart
class SubscriptionStatus {
  final String memberStatus;
  final String subscriptionStatus;
  final String? subscriptionExpiry;
  final int? daysUntilExpiry;
  final int? daysExpired;
  final ParticipantOperation? currentSubscription;
  final List<Operation> availableSubscriptions;
  final bool renewalEligible;
  final bool gracePeriodActive;
  final String? lastSubscriptionPayment;

  SubscriptionStatus({
    required this.memberStatus,
    required this.subscriptionStatus,
    this.subscriptionExpiry,
    this.daysUntilExpiry,
    this.daysExpired,
    this.currentSubscription,
    required this.availableSubscriptions,
    required this.renewalEligible,
    required this.gracePeriodActive,
    this.lastSubscriptionPayment,
  });

  factory SubscriptionStatus.fromJson(Map<String, dynamic> json) {
    return SubscriptionStatus(
      memberStatus: json['member_status'] as String,
      subscriptionStatus: json['subscription_status'] as String,
      subscriptionExpiry: json['subscription_expiry'] as String?,
      daysUntilExpiry: json['days_until_expiry'] as int?,
      daysExpired: json['days_expired'] as int?,
      currentSubscription: json['current_subscription'] != null
          ? ParticipantOperation.fromJson(json['current_subscription'])
          : null,
      availableSubscriptions: (json['available_subscriptions'] as List?)
              ?.map((e) => Operation.fromJson(e))
              .toList() ??
          [],
      renewalEligible: json['renewal_eligible'] as bool,
      gracePeriodActive: json['grace_period_active'] as bool,
      lastSubscriptionPayment: json['last_subscription_payment'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'member_status': memberStatus,
      'subscription_status': subscriptionStatus,
      'subscription_expiry': subscriptionExpiry,
      'days_until_expiry': daysUntilExpiry,
      'days_expired': daysExpired,
      'current_subscription': currentSubscription?.toJson(),
      'available_subscriptions': availableSubscriptions.map((e) => e.toJson()).toList(),
      'renewal_eligible': renewalEligible,
      'grace_period_active': gracePeriodActive,
      'last_subscription_payment': lastSubscriptionPayment,
    };
  }
}
```

### Extended Membre Model Fields

**Location:** Extend existing `lib/models/membre.dart`

```dart
// Add to existing Membre class
class Membre {
  // ... existing fields ...

  // NEW: Subscription-related fields
  final String? subscriptionStatus; // 'active', 'expiring', 'expired', 'none'
  final DateTime? subscriptionExpiry;
  final String? currentSubscriptionId;
  final DateTime? lastSubscriptionPayment;
  final int? subscriptionGracePeriodDays;

  // Constructor and methods updated accordingly
}
```

### Extended ParticipantOperation Model Fields

**Location:** Extend existing `lib/models/participant_operation.dart`

```dart
// Add to existing ParticipantOperation class
class ParticipantOperation {
  // ... existing fields ...

  // NEW: Subscription-specific fields
  final String? tariffName; // 'Plongeur', 'Apneiste', etc.
  final DateTime? subscriptionPeriodStart;
  final DateTime? subscriptionPeriodEnd;

  // Constructor and methods updated accordingly
}
```

---

## Testing Strategy

### Unit Tests

#### 1. SubscriptionService Tests

**Location:** `test/services/subscription_service_test.dart`

```dart
void main() {
  group('SubscriptionService', () {
    late SubscriptionService service;

    setUp(() {
      service = SubscriptionService();
    });

    test('getMemberSubscriptionStatus returns SubscriptionStatus', () async {
      // Mock Cloud Functions
      // Test successful retrieval
    });

    test('enrollInSubscription creates ParticipantOperation', () async {
      // Mock Firestore
      // Test enrollment
    });

    test('getAvailableSubscriptions filters by status ouvert', () async {
      // Mock Firestore
      // Verify only 'ouvert' subscriptions returned
    });

    test('calculateDaysUntilExpiry returns correct value', () {
      final futureDate = DateTime.now().add(const Duration(days: 45));
      final days = service.calculateDaysUntilExpiry(futureDate);
      expect(days, 45);
    });

    test('isInGracePeriod returns true when within grace period', () {
      final expiredDate = DateTime.now().subtract(const Duration(days: 15));
      expect(service.isInGracePeriod(expiredDate, gracePeriodDays: 30), true);
    });

    test('isInGracePeriod returns false when past grace period', () {
      final expiredDate = DateTime.now().subtract(const Duration(days: 35));
      expect(service.isInGracePeriod(expiredDate, gracePeriodDays: 30), false);
    });
  });
}
```

#### 2. SubscriptionProvider Tests

**Location:** `test/providers/subscription_provider_test.dart`

```dart
void main() {
  group('SubscriptionProvider', () {
    late SubscriptionProvider provider;

    setUp(() {
      provider = SubscriptionProvider();
    });

    test('loadSubscriptionStatus updates currentStatus', () async {
      // Mock service
      // Test state updates
      // Verify notifyListeners called
    });

    test('hasActiveSubscription returns true when active', () {
      // Set mock active status
      expect(provider.hasActiveSubscription, true);
    });

    test('renewalEligible returns true when expiring', () {
      // Set mock expiring status
      expect(provider.renewalEligible, true);
    });

    test('enrollInSubscription handles errors gracefully', () async {
      // Mock service error
      // Verify error message set
      // Verify notifyListeners called
    });
  });
}
```

#### 3. Cloud Functions Tests

**Location:** `functions/test/subscription.test.js`

```javascript
const test = require('firebase-functions-test')();
const admin = require('firebase-admin');

describe('Subscription Cloud Functions', () => {
  describe('getMemberSubscriptionStatus', () => {
    it('returns subscription status for authenticated user', async () => {
      // Mock Firestore data
      // Call function
      // Assert response structure
    });

    it('throws unauthenticated error when not authenticated', async () => {
      // Call without auth
      // Assert error thrown
    });
  });

  describe('processSubscriptionWebhook', () => {
    it('updates member status on subscription payment', async () => {
      // Mock webhook data
      // Call function
      // Assert member status updated to active
      // Assert subscription_expiry set
    });

    it('creates audit log entry', async () => {
      // Mock webhook data
      // Call function
      // Assert audit log created
    });
  });

  describe('checkSubscriptionExpiry', () => {
    it('sends renewal reminders for expiring subscriptions', async () => {
      // Mock members with expiring subscriptions
      // Run scheduled function
      // Assert notifications sent
    });

    it('deactivates members past grace period', async () => {
      // Mock members past grace period
      // Run scheduled function
      // Assert members deactivated
    });
  });
});
```

### Integration Tests

#### 1. End-to-End Subscription Flow

**Location:** `integration_test/subscription_flow_test.dart`

```dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Subscription Flow E2E', () {
    testWidgets('Complete subscription enrollment and payment', (tester) async {
      // 1. Launch app
      // 2. Navigate to subscription dashboard
      // 3. Tap "Renew Subscription"
      // 4. Select tariff
      // 5. Proceed to payment
      // 6. Mock payment completion
      // 7. Verify status updated to active
      // 8. Verify expiry date set
    });

    testWidgets('Shows renewal banner when expiring', (tester) async {
      // 1. Mock member with expiring subscription
      // 2. Launch app
      // 3. Navigate to dashboard
      // 4. Verify renewal banner shown
    });

    testWidgets('Displays subscription history correctly', (tester) async {
      // 1. Mock subscription history
      // 2. Launch app
      // 3. Navigate to history screen
      // 4. Verify all subscriptions displayed
      // 5. Verify paid/pending status correct
    });
  });
}
```

### User Acceptance Testing (UAT) Checklist

**Test with 5-10 club members:**

- [ ] View current subscription status
- [ ] Navigate to subscription selection
- [ ] Select appropriate tariff (test multiple types)
- [ ] Complete payment flow (sandbox environment)
- [ ] Verify payment confirmation notification
- [ ] Verify member status changed to active
- [ ] View subscription history
- [ ] Test renewal reminder notifications (mock expiry date)
- [ ] Test expired subscription UI
- [ ] Test grace period behavior
- [ ] Verify subscription details accuracy

**Edge Cases to Test:**

- [ ] No available subscriptions (admin hasn't created one)
- [ ] Multiple concurrent subscriptions (should prevent)
- [ ] Payment failure handling
- [ ] Payment timeout
- [ ] App crash during payment (verify webhook completes)
- [ ] Offline mode behavior
- [ ] Multiple devices (status sync)

---

## Deployment Plan

### Pre-Deployment Checklist

**Backend:**
- [ ] All Cloud Functions unit tests pass
- [ ] Cloud Scheduler configured for daily expiry check
- [ ] Webhook URL configured in Noda dashboard
- [ ] Production Firebase project configured
- [ ] Firestore indexes created
- [ ] Security rules updated for subscription fields
- [ ] Notification templates tested

**Mobile:**
- [ ] All unit tests pass (>80% coverage)
- [ ] Integration tests pass
- [ ] UI polish complete
- [ ] Deep links configured
- [ ] Push notifications tested on iOS and Android
- [ ] App icons and assets updated
- [ ] Version number incremented

**Data:**
- [ ] Migration script for existing members (add subscription fields)
- [ ] Backup of Firestore database
- [ ] Rollback plan documented

### Deployment Steps

#### Stage 1: Backend Deployment (Day 1)

```bash
# 1. Deploy Cloud Functions
cd functions
npm run build
firebase deploy --only functions

# 2. Verify functions deployed
firebase functions:list

# 3. Configure Cloud Scheduler (if not auto-created)
gcloud scheduler jobs list

# 4. Test functions in production
# Use Firebase Console to trigger test

# 5. Monitor logs
firebase functions:log --only checkSubscriptionExpiry
```

#### Stage 2: Data Migration (Day 1)

```bash
# Run migration script to add subscription fields to existing members
node scripts/migrate-member-subscription-fields.js

# Verify migration
# Check random sample of members in Firestore Console
```

#### Stage 3: Mobile App Build (Day 2)

```bash
# iOS
cd ios
pod install
cd ..
flutter build ios --release

# Android
flutter build appbundle --release

# Verify builds
flutter doctor -v
```

#### Stage 4: App Store Submission (Day 2-3)

**iOS (App Store Connect):**
1. Upload IPA via Xcode or Transporter
2. Fill release notes
3. Submit for review
4. Wait for approval (1-2 days typically)

**Android (Google Play Console):**
1. Upload AAB
2. Fill release notes
3. Start phased rollout: 10% → 25% → 50% → 100%
4. Monitor crash reports

#### Stage 5: Monitoring (Ongoing)

**Set up alerts for:**
- Cloud Function error rate > 5%
- Payment failure rate > 10%
- Notification delivery failure rate > 5%
- App crash rate > 1%

**Monitor dashboards:**
- Firebase Console: Performance, Crashlytics
- Noda Dashboard: Payment success rate
- Cloud Scheduler logs: Expiry check execution

---

## Success Metrics

### Technical KPIs

**Within 1 week of launch:**
- [ ] Subscription payment success rate > 95%
- [ ] Cloud Function response time < 5 seconds (p95)
- [ ] App crash rate < 0.5%
- [ ] Notification delivery rate > 98%
- [ ] Zero payment reconciliation errors

**Within 1 month:**
- [ ] Automated expiry checks running daily without errors
- [ ] Member status automation 100% accurate
- [ ] Zero manual status corrections needed

### Business KPIs

**Within 1 month:**
- [ ] 50%+ of renewals done via mobile app
- [ ] Admin time for subscription management reduced by 70%
- [ ] Average subscription payment time < 2 minutes
- [ ] Member satisfaction score > 4/5

**Within 3 months:**
- [ ] 80%+ of renewals done via mobile app
- [ ] Manual bank transfer reconciliation reduced by 90%
- [ ] Zero expired subscriptions with unpaid renewals (grace period working)

### User Experience KPIs

**Target metrics:**
- [ ] Time to complete subscription payment < 3 minutes
- [ ] Subscription status clarity score > 4.5/5
- [ ] Renewal reminder effectiveness > 80% (members renew before expiry)
- [ ] Payment retry success rate > 70%

---

## Risk Management

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cloud Scheduler fails | Low | High | Manual backup script + monitoring alerts |
| Webhook delivery fails | Medium | High | Polling backup + manual reconciliation |
| Payment status desync | Low | High | Daily reconciliation job |
| Member status incorrect | Low | Medium | Audit log for all changes + admin override |
| Notification spam | Low | Medium | Rate limiting + deduplication |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Members don't use mobile payment | Medium | Medium | User training + clear benefits communication |
| Grace period too short/long | Medium | Low | Configurable grace period (admin can adjust) |
| Tariff confusion | Medium | Low | Clear descriptions + recommended badges |
| Renewal reminder timing wrong | Low | Low | Configurable reminder schedule |

---

## Appendix

### A. Configuration Variables

**Firebase Cloud Functions config:**
```bash
firebase functions:config:set \
  noda.api_key="sk_live_xxx" \
  noda.webhook_secret="whsec_xxx" \
  subscription.grace_period_days="30" \
  subscription.renewal_reminder_days="30,7,0" \
  notification.fcm_server_key="xxx"
```

### B. Firestore Security Rules

```javascript
// Add to firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Member subscription fields
    match /clubs/{clubId}/members/{memberId} {
      allow read: if request.auth != null &&
                     (request.auth.uid == memberId ||
                      isClubAdmin(clubId, request.auth.uid));

      allow update: if request.auth != null &&
                       (request.auth.uid == memberId ||
                        isClubAdmin(clubId, request.auth.uid)) &&
                       // Members can't self-update subscription status
                       (!request.resource.data.diff(resource.data).affectedKeys()
                         .hasAny(['subscription_status', 'subscription_expiry', 'member_status']));
    }

    // Subscription operations
    match /clubs/{clubId}/operations/{operationId} {
      allow read: if request.auth != null;
      allow create, update: if isClubAdmin(clubId, request.auth.uid);
    }

    // Participant operations (subscription enrollments)
    match /clubs/{clubId}/participants/{participantId} {
      allow read: if request.auth != null &&
                     (resource.data.membre_id == request.auth.uid ||
                      isClubAdmin(clubId, request.auth.uid));

      allow create: if request.auth != null &&
                       request.resource.data.membre_id == request.auth.uid;

      // Only Cloud Functions can update payment status
      allow update: if false;
    }

    // Notifications
    match /clubs/{clubId}/notifications/{notificationId} {
      allow read: if request.auth != null &&
                     resource.data.membre_id == request.auth.uid;
      allow write: if false; // Only Cloud Functions can write
    }

    // Helper function
    function isClubAdmin(clubId, userId) {
      return exists(/databases/$(database)/documents/clubs/$(clubId)/members/$(userId)) &&
             get(/databases/$(database)/documents/clubs/$(clubId)/members/$(userId)).data.role == 'admin';
    }
  }
}
```

### C. Firestore Indexes

```json
{
  "indexes": [
    {
      "collectionGroup": "members",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "subscription_expiry", "order": "ASCENDING" },
        { "fieldPath": "subscription_status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "participants",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "membre_id", "order": "ASCENDING" },
        { "fieldPath": "operation_type", "order": "ASCENDING" },
        { "fieldPath": "date_inscription", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "operations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "statut", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

## Next Steps

### Immediate Actions (This Week)

1. **Review this plan** with development team
2. **Clarify questions**:
   - Grace period duration (30 days OK?)
   - Renewal reminder timing (30d, 7d, 0d OK?)
   - Which tariffs to support initially?
   - Should we prevent duplicate active subscriptions strictly?
3. **Set up development environment**:
   - Firebase project
   - Noda sandbox account
   - Cloud Scheduler enable

### Week 1: Backend Development

1. Extend Cloud Functions (Phase 1)
2. Create scheduled expiry job
3. Add member status fields (Phase 2)
4. Unit test all functions
5. Deploy to staging environment

### Week 2: Mobile Development

1. Create subscription services (Phase 3)
2. Build UI screens (Phase 4)
3. Integrate with payment system
4. Set up notifications (Phase 5)
5. Manual testing on emulators

### Week 3: Testing & Deployment

1. Integration testing (Phase 6)
2. UAT with club members
3. Bug fixes and polish
4. Production deployment (Phase 7)
5. Monitor and iterate

---

## Questions & Clarifications

Before starting implementation, please confirm:

**1. Grace Period Settings**
- [ ] 30-day grace period acceptable?
- [ ] Should members retain access during grace period?
- [ ] After grace period, auto-deactivate or manual review?

**2. Renewal Reminder Timing**
- [ ] 30 days before expiry (first reminder)?
- [ ] 7 days before expiry (second reminder)?
- [ ] On expiry date (final reminder)?
- [ ] Additional reminders during grace period?

**3. Tariff Types**
- [ ] Which tariffs to support: Plongeur, Apneiste, Instructeur, Junior, Etudiant?
- [ ] Any others?
- [ ] Should tariffs auto-suggest based on member role?

**4. Multiple Subscriptions**
- [ ] Strictly prevent overlapping active subscriptions?
- [ ] Or allow (e.g., member pays for next year early)?

**5. Payment Options**
- [ ] Only Noda Open Banking, or add manual payment option?
- [ ] Cash payment recording needed?

**6. Deployment Timeline**
- [ ] Target launch date?
- [ ] Any blockers or dependencies?
- [ ] Phased rollout strategy preferred?

---

## Document History

- **Version 1.0** - November 21, 2025 - Initial comprehensive plan created
- **Status**: ✅ Ready for Review
- **Next Review**: After stakeholder approval

---

**End of Document**

*This subscription integration plan builds on the existing event payment infrastructure (70% reusable) and adds subscription-specific features including member status automation, renewal workflows, and tariff-based pricing.*
