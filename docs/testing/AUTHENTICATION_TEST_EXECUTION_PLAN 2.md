# Authentication Test Execution Plan
**Status: DRAFT - To be revised before execution**

## Overview
This document outlines the execution plan for testing the CalyCompta authentication system. This plan will need to be adjusted based on the actual system state and requirements before execution.

---

## Phase 1: Pre-Execution Review & Adjustments
**Duration: 1-2 days**
**Status: NOT STARTED**

### 1.1 System Assessment
- [ ] Review current Firebase configuration
- [ ] Verify API endpoints are deployed and accessible
- [ ] Check if test users exist or need to be created
- [ ] Confirm Firebase emulator is properly configured
- [ ] Validate that all authentication components are in place

### 1.2 Plan Adjustments Needed
```
TO BE DETERMINED:
- Actual test user emails and passwords
- Specific Firebase project details
- API endpoint URLs (production vs staging)
- Actual permission configurations in Firebase
- Current Firestore security rules
- Session timeout settings currently in use
```

### 1.3 Test Data Preparation
- [ ] Document existing test users (if any)
- [ ] Identify data that needs to be created
- [ ] Prepare test transaction data
- [ ] Prepare test expense claims
- [ ] Prepare test events

---

## Phase 2: Environment Setup
**Duration: 1 day**
**Status: NOT STARTED**

### 2.1 Development Environment
```bash
# Commands to be verified and adjusted
firebase emulators:start  # May need specific ports
npm run dev              # May need environment variables
```

### 2.2 Test Environment Variables
```env
# TO BE CONFIRMED:
VITE_FIREBASE_API_KEY=?
VITE_FIREBASE_AUTH_DOMAIN=?
VITE_FIREBASE_PROJECT_ID=?
VITE_USE_FIREBASE_PROD=?
VITE_CLUB_ID=?
```

### 2.3 Required Adjustments
- [ ] Confirm actual environment variable names
- [ ] Verify Firebase project configuration
- [ ] Check API deployment status
- [ ] Validate CORS settings

---

## Phase 3: Test User Creation
**Duration: 1 day**
**Status: NOT STARTED**

### 3.1 Users to Create/Verify

| Role | Planned Email | Actual Email | Password | Firebase UID | Status |
|------|--------------|--------------|----------|--------------|--------|
| membre | membre@test.com | TBD | N/A | TBD | NOT CREATED |
| user | user@test.com | TBD | TBD | TBD | NOT CREATED |
| validateur | validator@test.com | TBD | TBD | TBD | NOT CREATED |
| admin | admin@test.com | TBD | TBD | TBD | NOT CREATED |
| superadmin | superadmin@test.com | TBD | TBD | TBD | NOT CREATED |

### 3.2 Creation Process
```javascript
// DRAFT - To be adjusted based on actual system
// Step 1: Create in Firestore
// Step 2: Activate via API (if has_app_access: true)
// Step 3: Set custom claims
// Step 4: Document credentials
```

### 3.3 Adjustments Needed
- [ ] Confirm user creation process
- [ ] Verify role assignment method
- [ ] Check custom claims structure
- [ ] Validate member collection path

---

## Phase 4: Core Authentication Tests
**Duration: 2 days**
**Status: NOT STARTED**

### 4.1 Priority Test Cases

#### High Priority (Day 1)
- [ ] Basic login/logout for each role
- [ ] Permission checking for critical operations
- [ ] Firebase Auth integration
- [ ] Session creation and validation

#### Medium Priority (Day 2)
- [ ] Password reset flows
- [ ] Idle timeout scenarios
- [ ] Multi-tab synchronization
- [ ] Error handling

#### Low Priority (If time permits)
- [ ] Performance benchmarks
- [ ] Edge cases
- [ ] Network failure scenarios

### 4.2 Test Execution Order
1. **USER role tests first** (most restrictive)
2. **VALIDATEUR tests** (operational access)
3. **ADMIN tests** (user management)
4. **SUPERADMIN tests** (full access)
5. **MEMBRE tests** (no access verification)

### 4.3 Known Issues to Watch For
```
TO BE IDENTIFIED:
- Current bugs in authentication
- Known permission issues
- API endpoint problems
- Firestore rule conflicts
- Session management quirks
```

---

## Phase 5: API & Firebase Communication Tests
**Duration: 1 day**
**Status: NOT STARTED**

### 5.1 API Endpoints to Test

#### /api/activate-user
```javascript
// DRAFT Test Request
POST /api/activate-user
Headers: {
  Authorization: 'Bearer [ADMIN_TOKEN]'
}
Body: {
  userId: '[MEMBER_ID]',
  clubId: 'calypso',  // TO CONFIRM
  role: 'user'
}
```

#### /api/reset-password
```javascript
// DRAFT Test Request
POST /api/reset-password
Headers: {
  Authorization: 'Bearer [ADMIN_TOKEN]'
}
Body: {
  userId: '[USER_ID]',
  clubId: 'calypso',  // TO CONFIRM
  newPassword: '[TEMP_PASSWORD]',
  requirePasswordChange: true
}
```

### 5.2 Firebase Admin SDK Tests
- [ ] Verify service account configuration
- [ ] Test custom claims setting
- [ ] Validate token verification
- [ ] Check user creation via Admin SDK

### 5.3 Adjustments Needed
- [ ] Confirm actual API URLs
- [ ] Verify request/response formats
- [ ] Check authentication header format
- [ ] Validate error response structure

---

## Phase 6: Permission & Security Rules Tests
**Duration: 2 days**
**Status: NOT STARTED**

### 6.1 Firestore Rules to Verify

```javascript
// TO BE CONFIRMED - Current rules structure
// Users collection access
// Transactions blocking for USER role
// Expense claims scoping
// Event access restrictions
```

### 6.2 Permission Matrix Validation
- [ ] Each role's default permissions
- [ ] Custom permission overrides
- [ ] Rule enforcement (BLOCKED/SCOPED)
- [ ] Hierarchy enforcement

### 6.3 Security Tests
- [ ] Token expiry and refresh
- [ ] Rate limiting
- [ ] CORS validation
- [ ] XSS/injection prevention

---

## Phase 7: Integration & End-to-End Tests
**Duration: 1 day**
**Status: NOT STARTED**

### 7.1 Critical User Journeys

#### Journey 1: New User Onboarding
```
1. Admin creates member
2. Admin activates user
3. User receives credentials
4. User logs in first time
5. Password change forced
6. User accesses application
```

#### Journey 2: Expense Approval Flow
```
1. User creates expense claim
2. Validateur reviews claim
3. Approval process (<100€ vs >100€)
4. Transaction linking
5. Reimbursement marking
```

#### Journey 3: Session Timeout
```
1. User logs in
2. User goes idle
3. Warning appears
4. Countdown begins
5. Auto-logout or refresh
```

### 7.2 Adjustments Needed
- [ ] Confirm actual user flows
- [ ] Verify approval thresholds
- [ ] Check timeout settings
- [ ] Validate email notifications

---

## Phase 8: Test Result Documentation
**Duration: 1 day**
**Status: NOT STARTED**

### 8.1 Results to Capture

#### Per Test Case
- Test ID
- Execution date/time
- Pass/Fail status
- Actual vs Expected
- Screenshots/recordings
- Error messages
- Performance metrics

#### Summary Report
- Total tests run
- Pass rate by category
- Critical failures
- Performance bottlenecks
- Security vulnerabilities
- Recommended fixes

### 8.2 Documentation Format
```markdown
## Test Execution Report
Date: [TBD]
Version: [TBD]
Environment: [TBD]

### Summary
- Total Tests: X
- Passed: X
- Failed: X
- Blocked: X

### Critical Issues
[To be documented during testing]

### Recommendations
[To be compiled after testing]
```

---

## Risks & Mitigation

### Identified Risks
1. **Test users might affect production data**
   - Mitigation: Use Firebase emulator or separate test project

2. **API endpoints might not be deployed**
   - Mitigation: Verify deployment before testing

3. **Firestore rules might block legitimate tests**
   - Mitigation: Review rules before testing

4. **Session timeouts might interfere with testing**
   - Mitigation: Adjust timeout settings for test environment

### Unknown Factors
```
TO BE IDENTIFIED:
- Third-party service dependencies
- Rate limiting thresholds
- Caching behaviors
- Browser-specific issues
- Mobile app considerations
```

---

## Tools & Resources Needed

### Required Tools
- [ ] Chrome DevTools
- [ ] Postman or similar API client
- [ ] Firebase Console access
- [ ] Git repository access
- [ ] Terminal/Command line
- [ ] Screen recording software

### Access Requirements
- [ ] Firebase project admin access
- [ ] Vercel deployment access
- [ ] GitHub repository write access
- [ ] Test email accounts

---

## Communication Plan

### Stakeholders
- Development team
- Project manager
- System administrator
- End users (for UAT)

### Reporting Schedule
- Daily progress updates during testing
- Immediate notification of critical issues
- Final report within 2 days of completion

---

## Contingency Plans

### If Critical Blockers Found
1. Document thoroughly
2. Attempt workaround
3. Escalate to development team
4. Adjust test plan accordingly
5. Re-test after fixes

### If Time Constraints
1. Focus on high-priority tests
2. Document untested areas
3. Schedule follow-up testing
4. Provide risk assessment

---

## Post-Testing Actions

### Immediate Actions
- [ ] Disable test users (if in production)
- [ ] Clean up test data
- [ ] Document all findings
- [ ] Create bug tickets

### Follow-up Actions
- [ ] Schedule fixes for issues found
- [ ] Plan regression testing
- [ ] Update documentation
- [ ] Create automated test suite

---

## Approval & Sign-off

### Pre-Execution Approval
- Reviewer: _____________
- Date: _____________
- Approved with modifications: [ ]
- Modifications required: _____________

### Post-Execution Sign-off
- Tester: _____________
- Date: _____________
- Test completion: ____%
- Recommendation: PASS [ ] FAIL [ ] CONDITIONAL [ ]

---

## Notes & Assumptions

### Current Assumptions
1. Firebase project is properly configured
2. API endpoints are deployed to Vercel
3. Test can be done in development environment
4. No real user data will be affected
5. Rollback is possible if issues found

### Notes for Revision
```
This plan needs to be reviewed and updated with:
1. Actual system configuration
2. Real endpoint URLs
3. Correct environment variables
4. Existing test user information
5. Current permission settings
6. Active Firestore rules
7. Production considerations
```

---

**Document Status: DRAFT**
**Last Updated: [Current Date]**
**Next Review Required Before: Test Execution Start**

## Revision History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | [Current] | AI Assistant | Initial draft |
| 0.2 | TBD | TBD | Pre-execution review |
| 1.0 | TBD | TBD | Final approved version |