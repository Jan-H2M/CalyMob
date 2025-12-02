# CalyMob Component Analysis Report

**Date:** November 25, 2025
**Version:** 1.0.4+6

---

## Complete Component Inventory

### 1. Configuration Layer

| Component | File | Purpose | Status | Notes |
|-----------|------|---------|--------|-------|
| FirebaseConfig | `lib/config/firebase_config.dart` | Firebase project settings | OK | Hardcoded club ID |
| FirebaseOptions | `lib/firebase_options.dart` | Platform-specific Firebase config | OK | Auto-generated |
| AccountCodes | `lib/config/account_codes.dart` | Expense account codes | OK | Business logic |
| AppColors | `lib/config/app_colors.dart` | Color constants | OK | Centralized theming |

---

### 2. Models

| Model | File | Purpose | Firestore Compatible | Issues |
|-------|------|---------|---------------------|--------|
| ExpenseClaim | `lib/models/expense_claim.dart` | Expense reimbursement requests | Yes | Typo: `appouveParNom` |
| Operation | `lib/models/operation.dart` | Events/operations | Yes | Nullable Timestamp crash risk |
| ParticipantOperation | `lib/models/participant_operation.dart` | Event registrations | Yes | OK |
| UserSession | `lib/models/user_session.dart` | User session data | Yes | OK |
| MemberProfile | `lib/models/member_profile.dart` | Member information | Yes | OK |
| Announcement | `lib/models/announcement.dart` | Club announcements | Yes | OK |
| EventMessage | `lib/models/event_message.dart` | Event discussions | Yes | OK |
| ExerciceLifras | `lib/models/exercice_lifras.dart` | LIFRAS exercises | Yes | Domain-specific |
| Tariff | `lib/models/tariff.dart` | Pricing information | Yes | OK |
| UserEventRegistration | `lib/models/user_event_registration.dart` | Event signups | Yes | OK |
| PaymentResponse | `lib/models/payment_response.dart` | Payment results | Yes | Not currently used |

---

### 3. Services

| Service | File | Purpose | Dependencies | Status |
|---------|------|---------|--------------|--------|
| AuthService | `lib/services/auth_service.dart` | Firebase Authentication | firebase_auth | OK |
| SessionService | `lib/services/session_service.dart` | Session management | cloud_firestore | Singleton risk |
| ExpenseService | `lib/services/expense_service.dart` | Expense CRUD | cloud_firestore, firebase_storage | OK |
| OperationService | `lib/services/operation_service.dart` | Events CRUD | cloud_firestore | N+1 query pattern |
| NotificationService | `lib/services/notification_service.dart` | Push notifications | firebase_messaging | OK |
| ProfileService | `lib/services/profile_service.dart` | Member profiles | cloud_firestore, firebase_storage | **MISSING** |
| MemberService | `lib/services/member_service.dart` | Member data | cloud_firestore | **MISSING** |
| AnnouncementService | `lib/services/announcement_service.dart` | Announcements | cloud_firestore | OK |
| EventMessageService | `lib/services/event_message_service.dart` | Event chat | cloud_firestore | OK |
| PaymentService | `lib/services/payment_service.dart` | Payments | - | Not implemented |
| LifrasService | `lib/services/lifras_service.dart` | LIFRAS integration | - | Domain-specific |

---

### 4. Providers (State Management)

| Provider | File | Pattern | Memory Safe | Issues |
|----------|------|---------|-------------|--------|
| AuthProvider | `lib/providers/auth_provider.dart` | ChangeNotifier | Yes | dispose() implemented |
| ExpenseProvider | `lib/providers/expense_provider.dart` | ChangeNotifier | Yes | dispose() implemented |
| OperationProvider | `lib/providers/operation_provider.dart` | ChangeNotifier | Yes | dispose() implemented |
| AnnouncementProvider | `lib/providers/announcement_provider.dart` | ChangeNotifier | Yes | dispose() implemented |
| EventMessageProvider | `lib/providers/event_message_provider.dart` | ChangeNotifier | Yes | dispose() implemented |
| PaymentProvider | `lib/providers/payment_provider.dart` | ChangeNotifier | - | Not used |

**Pattern Analysis:**
- All providers properly implement `dispose()` for stream subscriptions
- Good separation of concerns between providers
- No cross-provider dependencies (good for testability)

---

### 5. Screens

| Screen | File | Features | Dependencies | Status |
|--------|------|----------|--------------|--------|
| LoginScreen | `lib/screens/auth/login_screen.dart` | Email/password login | AuthProvider | OK |
| HomeScreen | `lib/screens/home/home_screen.dart` | Event list + tabs | OperationProvider, ExpenseProvider | OK |
| LandingScreen | `lib/screens/home/landing_screen.dart` | Navigation tiles | AuthProvider | Events/Profile disabled |
| ExpenseListScreen | `lib/screens/expenses/expense_list_screen.dart` | Expense list | ExpenseProvider | OK |
| CreateExpenseScreen | `lib/screens/expenses/create_expense_screen.dart` | New expense form | ExpenseProvider, image_picker | OK |
| EditExpenseScreen | `lib/screens/expenses/edit_expense_screen.dart` | Edit expense | ExpenseProvider | OK |
| ExpenseDetailScreen | `lib/screens/expenses/expense_detail_screen.dart` | Expense details | ExpenseProvider | OK |
| ApprovalListScreen | `lib/screens/expenses/approval_list_screen.dart` | Pending approvals | ExpenseProvider | OK |
| PdfViewerScreen | `lib/screens/expenses/pdf_viewer_screen.dart` | PDF display | pdfrx | OK |
| PhotoViewerScreen | `lib/screens/expenses/photo_viewer_screen.dart` | Image gallery | - | OK |
| OperationsListScreen | `lib/screens/operations/operations_list_screen.dart` | Event list | OperationProvider | OK |
| OperationDetailScreen | `lib/screens/operations/operation_detail_screen.dart` | Event details | OperationProvider | OK |
| MyEventsScreen | `lib/screens/operations/my_events_screen.dart` | User's events | OperationProvider | OK |
| EventDiscussionScreen | `lib/screens/operations/event_discussion_screen.dart` | Event chat | EventMessageProvider | OK |
| ProfileScreen | `lib/screens/profile/profile_screen.dart` | User profile | ProfileService, **cached_network_image** | **MISSING DEP** |
| SettingsScreen | `lib/screens/profile/settings_screen.dart` | App settings | - | OK |
| WhoIsWhoScreen | `lib/screens/profile/who_is_who_screen.dart` | Member directory | ProfileService, **cached_network_image** | **MISSING DEP** |
| FaceCameraScreen | `lib/screens/profile/face_camera_screen.dart` | Profile photo | camera | May need camera package |
| PrivacyPolicyScreen | `lib/screens/profile/privacy_policy_screen.dart` | Privacy policy | - | OK |
| AnnouncementsScreen | `lib/screens/announcements/announcements_screen.dart` | Club news | AnnouncementProvider | OK |
| CreateAnnouncementDialog | `lib/screens/announcements/create_announcement_dialog.dart` | New announcement | AnnouncementProvider | OK |
| MessagesScreen | `lib/screens/messages/messages_screen.dart` | Messages | - | OK |

---

### 6. Widgets

| Widget | File | Purpose | Reusable | Status |
|--------|------|---------|----------|--------|
| OperationCard | `lib/widgets/operation_card.dart` | Event card display | Yes | OK |
| LoadingWidget | `lib/widgets/loading_widget.dart` | Loading indicator | Yes | OK |
| EmptyStateWidget | `lib/widgets/empty_state_widget.dart` | Empty list state | Yes | OK |
| ExpensePhotoGallery | `lib/widgets/expense_photo_gallery.dart` | Photo grid | Yes | OK |
| AnnouncementCard | `lib/widgets/announcement_card.dart` | Announcement display | Yes | OK |
| EventDiscussionTab | `lib/widgets/event_discussion_tab.dart` | Chat widget | Yes | OK |
| ExerciseSelectionDialog | `lib/widgets/exercise_selection_dialog.dart` | Exercise picker | Yes | Domain-specific |
| PhotoConsentDialog | `lib/widgets/photo_consent_dialog.dart` | Consent form | Yes | GDPR compliant |

---

### 7. Utilities

| Utility | File | Purpose | Status |
|---------|------|---------|--------|
| DateFormatter | `lib/utils/date_formatter.dart` | Date formatting | OK |
| CurrencyFormatter | `lib/utils/currency_formatter.dart` | Currency formatting | OK |
| DocumentUtils | `lib/utils/document_utils.dart` | Document helpers | OK |

---

## Dependency Analysis

### Current Dependencies (pubspec.yaml)

| Package | Version | Purpose | Latest Version | Update Needed |
|---------|---------|---------|----------------|---------------|
| firebase_core | ^4.2.1 | Firebase base | 4.2.1 | No |
| firebase_auth | ^6.1.2 | Authentication | 6.1.2 | No |
| cloud_firestore | ^6.1.0 | Database | 6.1.0 | No |
| firebase_storage | ^13.0.4 | File storage | 13.0.4 | No |
| firebase_analytics | ^12.0.4 | Analytics | 12.0.4 | No |
| firebase_crashlytics | ^5.0.5 | Crash reporting | 5.0.5 | No |
| firebase_messaging | ^16.0.4 | Push notifications | 16.0.4 | No |
| provider | ^6.1.2 | State management | 6.1.2 | No |
| cupertino_icons | ^1.0.6 | iOS icons | 1.0.8 | Optional |
| intl | ^0.20.2 | Internationalization | 0.20.2 | No |
| url_launcher | ^6.1.14 | URL handling | 6.3.1 | Optional |
| shared_preferences | ^2.2.2 | Local storage | 2.3.3 | Optional |
| path_provider | ^2.1.1 | File paths | 2.1.5 | Optional |
| image_picker | ^1.0.4 | Photo selection | 1.1.2 | Optional |
| pdfrx | ^1.0.0 | PDF viewing | 2.2.16 | Optional |

### Missing Dependencies (Required)

| Package | Required Version | Reason |
|---------|-----------------|--------|
| cached_network_image | ^3.3.1 | Profile photos caching |

### Optional Recommended Additions

| Package | Purpose | Priority |
|---------|---------|----------|
| flutter_secure_storage | Secure token storage | High |
| connectivity_plus | Network status | Medium |
| logger | Better logging | Medium |
| flutter_dotenv | Environment config | Medium |

---

## Cross-Platform Component Mapping

### Android (Native Equivalent)

| Flutter Component | Android Native | Notes |
|-------------------|----------------|-------|
| Provider | ViewModel + LiveData | Similar reactive pattern |
| Firebase Auth | Firebase Auth Android SDK | Same backend |
| Cloud Firestore | Firestore Android SDK | Same backend |
| image_picker | Camera/Gallery Intents | Platform channel |
| url_launcher | Intent.ACTION_VIEW | Platform channel |
| shared_preferences | SharedPreferences | Same concept |

### iOS (Native Equivalent)

| Flutter Component | iOS Native | Notes |
|-------------------|------------|-------|
| Provider | Combine + ObservableObject | Similar reactive pattern |
| Firebase Auth | Firebase Auth iOS SDK | Same backend |
| Cloud Firestore | Firestore iOS SDK | Same backend |
| image_picker | UIImagePickerController | Platform channel |
| url_launcher | UIApplication.open | Platform channel |
| shared_preferences | UserDefaults | Same concept |

---

## Component Health Matrix

| Component Type | Total | Healthy | Issues | Critical |
|----------------|-------|---------|--------|----------|
| Models | 11 | 10 | 1 | 0 |
| Services | 11 | 7 | 2 | 2 (missing) |
| Providers | 6 | 6 | 0 | 0 |
| Screens | 21 | 19 | 2 | 2 (missing dep) |
| Widgets | 8 | 8 | 0 | 0 |
| Utilities | 3 | 3 | 0 | 0 |
| **Total** | **60** | **53** | **5** | **4** |

---

## Recommendations by Component

### High Priority Fixes

1. **Add cached_network_image dependency**
   ```yaml
   # pubspec.yaml
   cached_network_image: ^3.3.1
   ```

2. **Create/Restore ProfileService**
   - Either restore from git history (commit f57662a)
   - Or implement new service with required methods:
     - `getProfile(clubId, userId)`
     - `watchProfile(clubId, userId)`
     - `updateProfilePhoto(...)`
     - `updatePhotoConsents(...)`
     - `getAllProfiles(clubId)`

3. **Create/Restore MemberService**
   - Restore from git or implement

### Medium Priority Improvements

1. **Standardize model null handling**
2. **Add unit tests for each service**
3. **Implement proper error handling in all components**

---

## Sources

- [Flutter Architecture Recommendations](https://docs.flutter.dev/app-architecture/recommendations)
- [Provider Package Documentation](https://pub.dev/packages/provider)
- [Firebase Flutter Setup](https://firebase.google.com/docs/flutter/setup)
