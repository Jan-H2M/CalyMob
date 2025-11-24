# 🔄 VPDive → Caly Events & Subscriptions Migration Analysis

**Document Date**: November 2025
**Project**: CalyBase/CalyCompta
**Scope**: Dual-system migration strategy for events and subscriptions
**Goal**: Move all event inscriptions and communication to CalyMob mobile app

---

## 📋 Executive Summary

CalyBase currently imports events and subscriptions from VPdive (external diving management system). The goal is to implement a dual-system strategy that allows VPdive imports to coexist with native Caly events during migration, ultimately moving all inscriptions and communication to CalyMob mobile app.

### Key Findings
- ✅ **VPdive import infrastructure exists** and is functional
- ✅ **Database schema supports multi-source events** via Operations collection
- ⚠️ **CalyMob mobile app NOT FOUND** in current codebase (may be separate repository)
- ✅ **Web UI fully supports event management** with import/export capabilities
- ✅ **Deduplication system in place** using source hashes

---

## 1. 📚 DOCUMENTATION REVIEW

### Existing Documentation Found
- `README.md` - Basic project overview, no migration strategy mentioned
- `docs/reports/COMPLETE_OVERZICHT.md` - References CalyMob mobile app as "100% complete" for expense tracking
- **No existing VPdive migration documentation found**
- **No CalyMob source code in this repository**

### Key Insights from Documentation
1. CalyMob was developed for expense submission with photo support
2. Events/inscriptions listed as "Phase 2 - Enhancements" in CalyMob roadmap
3. Firebase/Firestore used as shared backend between web and mobile
4. Budget-conscious solution required (non-profit diving club)

---

## 2. 🔄 VPDIVE IMPORT ANALYSIS

### Current Import Flow
```
VPdive Excel (.xls) → Parser → Operation (type='evenement') → Firestore
                              ↓
                    ParticipantOperations → Auto-match transactions
```

### Key Components

#### VPDiveParser (`src/services/vpDiveParser.ts`)
- **Handles**: Excel file parsing with SheetJS
- **Extracts**: Event details, participants, payment status
- **Features**:
  - Duplicate detection via `vp_dive_source_hash`
  - Automatic participant → member matching (LIFRAS ID)
  - Phone number formatting for Belgian numbers
  - Contact urgency information extraction

#### VPDiveImportModal (`src/components/operations/VPDiveImportModal.tsx`)
- **Supports**: Single and batch imports
- **Duplicate handling**: Warning dialog with override option
- **Auto-matching**: Links bank transactions to inscriptions
- **Storage**:
  - Events → `/clubs/{clubId}/operations` (type='evenement')
  - Participants → `/clubs/{clubId}/operation_participants`

### Import Frequency
- **Manual trigger** via UI (no scheduled imports found)
- **No webhooks** configured for real-time sync

---

## 3. 💾 DATABASE SCHEMA REVIEW

### Current Schema Structure

#### Operations Collection (Events)
```typescript
interface Operation {
  id: string;
  type: 'evenement' | 'cotisation' | 'caution' | 'vente' | 'subvention' | 'autre';

  // Common fields
  titre: string;
  montant_prevu: number;
  statut: 'brouillon' | 'ouvert' | 'ferme' | 'annule';

  // Event-specific
  date_debut?: Date;
  date_fin?: Date;
  lieu?: string;
  prix_membre?: number;
  prix_non_membre?: number;
  vp_dive_source_hash?: string;  // ✅ Already exists for deduplication
}
```

#### Required Schema Additions for Migration
```typescript
interface OperationMigration {
  // New fields needed
  source: 'vpdive' | 'caly';        // Track data origin
  vpdiveId?: string;                // External reference
  lastSyncedAt?: Date;              // Last VPdive sync
  migratedAt?: Date;                // Conversion timestamp
  isEditable: boolean;              // Lock VPdive events during transition
  syncStatus?: 'pending' | 'synced' | 'error';
}
```

### Existing Deduplication
- ✅ `vp_dive_source_hash` prevents duplicate imports
- Uses combination of: titre + date_debut + lieu + source_filename

---

## 4. 📱 CALYMOB MOBILE APP ANALYSIS

### ⚠️ Critical Finding: CalyMob NOT in Current Repository

**Evidence**:
- No `calycompta_mobile`, `CalyMob`, or Flutter directories found
- Documentation references CalyMob as complete but separate
- Likely in different repository or not yet integrated

### Referenced CalyMob Capabilities (from docs)
- ✅ Expense submission with photos
- ✅ Real-time Firestore sync
- ✅ User authentication
- ❌ Event viewing (planned Phase 2)
- ❌ Event subscription (planned Phase 2)
- ❌ Communication features (not implemented)

### Required CalyMob Development for Migration
1. **Event List View**
   - Display both VPdive and Caly events
   - Visual differentiation (badges/colors)
   - Filter by source

2. **Subscription Flow**
   - Native inscription form
   - Payment integration
   - QR code for on-site registration

3. **Communication Module**
   - Push notifications
   - WhatsApp integration
   - Event updates/reminders

---

## 5. 🖥️ UI/UX IMPACT

### Current Web Components

#### Event Management
- `OperationsPage.tsx` - Main operations/events listing
- `VPDiveImportModal.tsx` - Import interface
- `OperationDetailView.tsx` - Event details and participants
- `EventFormModal.tsx` - Create/edit native events

#### Visual Differentiation Strategy
```typescript
// Proposed UI indicators
const eventSourceBadge = {
  vpdive: {
    color: 'orange',
    icon: 'import',
    text: 'VPDive Import',
    editable: false
  },
  caly: {
    color: 'green',
    icon: 'check',
    text: 'Native Event',
    editable: true
  }
};
```

---

## 6. 🔌 API ENDPOINTS

### Current API Structure
- **Vercel Serverless Functions**: `/api/activate-user.js`, `/api/reset-password.js`
- **Firebase Functions**: User activation, automated tasks
- **No dedicated event API** - Direct Firestore access from frontend

### Required API Endpoints for Migration
```typescript
// Proposed API structure
POST   /api/events/sync-vpdive     // Trigger VPdive sync
GET    /api/events?source=vpdive   // Filter by source
POST   /api/events/migrate/:id     // Convert VPdive → Caly
POST   /api/subscriptions          // Native subscription
PATCH  /api/subscriptions/:id      // Update subscription
POST   /api/notifications/event    // Send event notifications
```

---

## 7. 📬 COMMUNICATION FLOW

### Current State
- **No integrated communication system** found
- Email templates exist but no event-specific messaging
- No WhatsApp or push notification infrastructure

### Required Communication Infrastructure
1. **Notification Service**
   - Firebase Cloud Messaging for push
   - WhatsApp Business API integration
   - Email via SendGrid/similar

2. **Event Communication Triggers**
   - New event published
   - Inscription confirmed
   - Payment received
   - Event reminder (24h before)
   - Event cancelled/modified

---

## 8. ⚠️ DEPENDENCIES & RISKS

### Technical Dependencies
- **SheetJS (xlsx)**: Excel parsing for VPdive imports
- **Firebase/Firestore**: Shared backend
- **React/TypeScript**: Web frontend
- **Flutter (missing)**: Mobile app development needed

### Identified Risks

#### High Priority
1. **CalyMob not ready** - Mobile app needs significant development
2. **Data consistency** - Dual-source events may conflict
3. **User confusion** - Two systems during transition

#### Medium Priority
1. **VPdive API changes** - Excel format may change
2. **Performance** - Large event imports may slow system
3. **Training** - Users need guidance on new system

#### Low Priority
1. **Storage costs** - Duplicate data during migration
2. **Rollback complexity** - Hard to revert after partial migration

---

## 9. 🚀 COEXISTENCE STRATEGY

### Phase 1: Preparation (2-4 weeks)
```typescript
// 1. Update Operation schema
interface Operation {
  // ... existing fields ...
  source: 'vpdive' | 'caly';
  isEditable: boolean;
  lastSyncedAt?: Date;
}

// 2. Add source filtering to UI
const filterBySource = (ops: Operation[], source: string) =>
  ops.filter(op => op.source === source || source === 'all');

// 3. Lock VPdive events from editing
const canEdit = (op: Operation) =>
  op.source === 'caly' || userRole === 'admin';
```

### Phase 2: CalyMob Development (4-8 weeks)
1. **Build event viewing** in CalyMob
2. **Implement subscription flow**
3. **Add communication features**
4. **Test with small group**

### Phase 3: Parallel Running (2-3 months)
- Continue VPdive imports (mark as `source: 'vpdive'`)
- Create new events as Caly native
- Allow inscriptions via CalyMob for both types
- Monitor usage and issues

### Phase 4: Migration Tools (2 weeks)
```typescript
// Migration function
async function migrateVPDiveEvent(eventId: string) {
  const event = await getEvent(eventId);
  if (event.source !== 'vpdive') throw new Error('Not a VPdive event');

  return updateEvent(eventId, {
    source: 'caly',
    isEditable: true,
    migratedAt: new Date(),
    vpdiveId: event.id  // Keep reference
  });
}
```

### Phase 5: Cutover (1 week)
1. Final VPdive import
2. Convert remaining events
3. Disable VPdive import UI
4. Archive VPdive integration code

---

## 10. 📋 IMPLEMENTATION CHECKLIST

### Database Changes
- [ ] Add `source` field to Operations
- [ ] Add `isEditable` field
- [ ] Add `lastSyncedAt` timestamp
- [ ] Add `migratedAt` timestamp
- [ ] Update Firestore security rules
- [ ] Create migration scripts

### Backend Development
- [ ] Build sync API endpoint
- [ ] Implement migration endpoint
- [ ] Add source-based filtering
- [ ] Create notification service
- [ ] Setup WhatsApp integration
- [ ] Implement audit logging

### Web UI Updates
- [ ] Add source badges to event cards
- [ ] Implement read-only mode for VPdive events
- [ ] Create migration button for admins
- [ ] Add source filter to list view
- [ ] Build migration dashboard
- [ ] Update help documentation

### CalyMob Development (PRIORITY)
- [ ] Setup Flutter project if not exists
- [ ] Build event list screen
- [ ] Implement event detail view
- [ ] Create subscription form
- [ ] Add payment integration
- [ ] Implement push notifications
- [ ] Build communication preferences
- [ ] Add offline support
- [ ] Implement QR code scanning

### Testing & Validation
- [ ] Unit tests for migration functions
- [ ] Integration tests for dual-source
- [ ] Load testing for large imports
- [ ] User acceptance testing
- [ ] Rollback procedures
- [ ] Data integrity checks

---

## 11. 📊 EFFORT ESTIMATES

| Component | Complexity | Duration | Priority |
|-----------|------------|----------|----------|
| Database Schema | Small | 1 week | High |
| Migration API | Medium | 2 weeks | High |
| CalyMob Events | Large | 6-8 weeks | Critical |
| Communication System | Large | 3-4 weeks | High |
| Web UI Updates | Small | 1 week | Medium |
| Testing & QA | Medium | 2 weeks | High |
| Documentation | Small | 1 week | Low |
| **TOTAL** | **Large** | **16-20 weeks** | - |

---

## 12. 🔄 ROLLBACK PLAN

### Scenario: Critical Issues During Migration

1. **Immediate Actions**
   ```typescript
   // Disable Caly event creation
   setFeatureFlag('native_events', false);

   // Revert schema changes
   await revertMigration('add_source_fields');

   // Restore VPdive as primary
   setConfig('event_source', 'vpdive_only');
   ```

2. **Data Recovery**
   - Backup before each migration phase
   - Keep VPdive exports for 6 months
   - Maintain audit log of all changes

3. **Communication**
   - Notify users immediately
   - Provide timeline for resolution
   - Document lessons learned

---

## 13. 💰 BUDGET CONSIDERATIONS

### Cost-Effective Approach (Recommended for Calypso)
1. **Phased rollout** - Reduce risk and spread costs
2. **Open-source tools** - Flutter, Firebase free tier
3. **Community testing** - Engage diving club members
4. **Gradual feature release** - Start with viewing, add features incrementally

### Potential Cost Savings
- Eliminate VPdive subscription (if paid)
- Reduce manual data entry
- Improve payment collection rate
- Streamline communication (reduce phone calls)

---

## 14. 🎯 SUCCESS METRICS

### Technical Metrics
- Zero data loss during migration
- < 2s page load for event lists
- 99.9% uptime during transition
- < 1% error rate on inscriptions

### Business Metrics
- 80% inscriptions via CalyMob within 3 months
- 50% reduction in admin time for events
- 95% user satisfaction score
- 30% increase in event participation

---

## 15. 📝 RECOMMENDATIONS

### Immediate Actions (This Week)
1. **Locate CalyMob source code** or initiate new mobile project
2. **Create feature flag system** for gradual rollout
3. **Implement source field** in database
4. **Setup development environment** for mobile

### Short-term (Next Month)
1. **Build MVP of CalyMob events** module
2. **Create migration dashboard** for admins
3. **Document VPdive data mappings**
4. **Setup communication infrastructure**

### Long-term (3-6 Months)
1. **Complete CalyMob feature parity**
2. **Migrate 50% of events** to native
3. **Phase out VPdive imports**
4. **Full production rollout**

---

## 16. ⚠️ CRITICAL GAPS

### Must Address Before Migration
1. **CalyMob mobile app** - Does not exist in current codebase
2. **Communication system** - No WhatsApp/push infrastructure
3. **Payment integration** - No mobile payment solution
4. **User training materials** - No documentation for new flow
5. **Data migration tools** - Manual process only

---

## 17. 🏁 CONCLUSION

The migration from VPdive to native Caly events is **technically feasible** but requires **significant development effort**, particularly for the CalyMob mobile app. The existing infrastructure provides a solid foundation with:

- ✅ Working VPdive import system
- ✅ Flexible database schema (Operations)
- ✅ Deduplication mechanisms
- ✅ Transaction matching capabilities

However, achieving the goal of "all inscriptions via CalyMob" requires:

- 🚧 Complete CalyMob event module development
- 🚧 Communication system implementation
- 🚧 Payment integration
- 🚧 Comprehensive testing and training

### Recommended Next Steps
1. **Verify CalyMob location** - Check if separate repository exists
2. **Create technical spike** - Prototype CalyMob event viewing
3. **Engage stakeholders** - Get user feedback on proposed flow
4. **Establish timeline** - Based on resource availability
5. **Begin incremental migration** - Start with read-only event viewing

---

**Document prepared by**: AI Analysis System
**Review required by**: Technical Lead, Product Owner
**Approval needed from**: Calypso Diving Club Board