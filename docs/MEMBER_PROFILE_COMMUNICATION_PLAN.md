# Member Profile & Communication System - Implementation Plan

**Project:** CalyMob - Diving Club Management App
**Date:** January 2025
**Version:** 1.0
**Status:** Planning Phase

---

## Executive Summary

This plan integrates multiple related features into a cohesive member management and communication system with a complete navigation structure that shows both current and future capabilities.

### Features Included:
1. **Profile Photos** with face detection + privacy consent
2. **"Who's Who" Member Directory** with contact information
3. **Contact Sharing Preferences** (email, phone)
4. **WhatsApp Integration** (quick win)
5. **Push Notifications Foundation** (for future messaging)
6. **Complete Navigation Structure** (with grayed-out future features)

**Total Effort:** 10-12 days
**Phased Approach:** Can implement in stages

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Complete Navigation Structure](#complete-navigation-structure)
3. [Phase 1: Core Profile System](#phase-1-core-profile-system)
4. [Phase 2: Member Directory](#phase-2-member-directory)
5. [Phase 3: WhatsApp Integration](#phase-3-whatsapp-integration)
6. [Phase 4: Push Notifications](#phase-4-push-notifications)
7. [Phase 5: Future Features](#phase-5-future-features)
8. [Implementation Schedule](#implementation-schedule)
9. [Technical Specifications](#technical-specifications)
10. [Success Metrics](#success-metrics)

---

## Current State Analysis

### What Already Exists ✅

**Firebase Infrastructure:**
- Firebase Core v4.2.0
- Firebase Auth v6.1.1
- Cloud Firestore v6.0.3
- Firebase Storage v13.0.3
- Cloud Functions v6.0.3 (payment system fully implemented)

**Current Features:**
- Member authentication
- Event registration and management
- Payment system (Noda integration)
- Expense claim system
- LIFRAS exercise selection
- Profile button placeholder (disabled)

**Member Data:**
- Collection: `clubs/{clubId}/members`
- MemberService exists for basic data access
- Basic fields: prenom, nom, plongeur_code

### What's Missing ❌

**Infrastructure:**
- FCM (firebase_messaging) not installed
- No push notification handling
- No member directory UI

**Features:**
- Profile photo management
- Member directory / "Who's Who"
- Contact sharing preferences
- Chat/messaging system
- Comprehensive notification system

---

## Complete Navigation Structure

### Landing Screen - 2x3 Grid Layout

This shows the complete navigation that users will see, including future features (grayed out):

```
┌─────────────────────────────────────┐
│          CalyMob 🤿                 │
│                                     │
│  ┌──────────┬──────────┐           │
│  │          │           │           │
│  │  Events  │  Profile  │           │
│  │    🏊     │    👤     │  ← Phase 1
│  │  (Blue)  │ (Purple)  │           │
│  │  ACTIVE  │  ACTIVE   │           │
│  │          │           │           │
│  ├──────────┼──────────┤           │
│  │          │           │           │
│  │ Who's Who│ Messages  │           │
│  │    👥     │    💬     │  ← Phase 2 & 5
│  │  (Teal)  │  (Green)  │           │
│  │  ACTIVE  │  FUTURE   │           │
│  │          │  (Grayed) │           │
│  ├──────────┼──────────┤           │
│  │          │           │           │
│  │ Demandes │ Approval  │           │
│  │    📝     │    ✅     │  ← Existing
│  │ (Orange) │  (Green)  │           │
│  │  ACTIVE  │  ACTIVE   │           │
│  │          │           │           │
│  └──────────┴──────────┘           │
└─────────────────────────────────────┘
```

### Navigation Tile Specifications

#### Active Tiles (Implemented)

**1. Events (Événements)** - EXISTING
- Icon: `Icons.scuba_diving` or `Icons.pool`
- Color: Blue (`Colors.blue`)
- Route: `/home` → HomeScreen with tabs
- Status: ✅ Active

**2. Profile (Profil)** - PHASE 1
- Icon: `Icons.person`
- Color: Purple (`Colors.purple`)
- Route: `/profile` → ProfileScreen
- Status: 🔨 To implement
- Features: Photo, privacy settings, sign out

**3. Who's Who (Qui est qui)** - PHASE 2
- Icon: `Icons.groups` or `Icons.contacts`
- Color: Teal (`Colors.teal`)
- Route: `/members` → MembersDirectoryScreen
- Status: 🔨 To implement
- Features: Member list, search, contact info

**4. Demandes (Expenses)** - EXISTING
- Icon: `Icons.receipt`
- Color: Orange (`Colors.orange`)
- Route: `/expenses` → ExpenseListScreen
- Status: ✅ Active

**5. Approval (Approbation)** - EXISTING
- Icon: `Icons.check_circle`
- Color: Green (`Colors.green`)
- Route: `/approvals` → ApprovalListScreen
- Status: ✅ Active

#### Future Tiles (Grayed Out)

**6. Messages (Messagerie)** - PHASE 5
- Icon: `Icons.chat_bubble`
- Color: Green (`Colors.green`) when active
- Grayed: 50% opacity, `Colors.grey[400]`
- Route: `/messages` → ConversationsListScreen (not yet implemented)
- Status: 🔮 Future
- Features: Direct messaging, group chats, push notifications
- Tap behavior: Show dialog "Coming Soon: Direct messaging between members"

### Implementation Code

```dart
// lib/screens/home/landing_screen.dart

class LandingScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('CalyMob 🤿'),
      ),
      body: Padding(
        padding: EdgeInsets.all(16),
        child: GridView.count(
          crossAxisCount: 2,
          crossAxisSpacing: 16,
          mainAxisSpacing: 16,
          children: [
            // Row 1
            _buildNavigationTile(
              context: context,
              title: 'Événements',
              icon: Icons.pool,
              color: Colors.blue,
              route: '/home',
              isEnabled: true,
            ),
            _buildNavigationTile(
              context: context,
              title: 'Profil',
              icon: Icons.person,
              color: Colors.purple,
              route: '/profile',
              isEnabled: true,  // ← Changed from false
            ),

            // Row 2
            _buildNavigationTile(
              context: context,
              title: 'Qui est qui',
              icon: Icons.groups,
              color: Colors.teal,
              route: '/members',
              isEnabled: true,  // ← New feature (Phase 2)
            ),
            _buildNavigationTile(
              context: context,
              title: 'Messages',
              icon: Icons.chat_bubble,
              color: Colors.green,
              route: '/messages',
              isEnabled: false,  // ← Grayed out (Future)
              futureFeature: true,
            ),

            // Row 3
            _buildNavigationTile(
              context: context,
              title: 'Mes demandes',
              icon: Icons.receipt,
              color: Colors.orange,
              route: '/expenses',
              isEnabled: true,
            ),
            _buildNavigationTile(
              context: context,
              title: 'Approbation',
              icon: Icons.check_circle,
              color: Colors.green,
              route: '/approvals',
              isEnabled: true,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNavigationTile({
    required BuildContext context,
    required String title,
    required IconData icon,
    required Color color,
    required String route,
    required bool isEnabled,
    bool futureFeature = false,
  }) {
    return Card(
      elevation: isEnabled ? 4 : 1,
      child: InkWell(
        onTap: isEnabled
            ? () => Navigator.pushNamed(context, route)
            : () => _showComingSoonDialog(context, title),
        child: Container(
          decoration: BoxDecoration(
            color: isEnabled ? color.withOpacity(0.1) : Colors.grey[200],
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 48,
                color: isEnabled ? color : Colors.grey[400],
              ),
              SizedBox(height: 12),
              Text(
                title,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: isEnabled ? Colors.black87 : Colors.grey[500],
                ),
              ),
              if (futureFeature)
                Padding(
                  padding: EdgeInsets.only(top: 4),
                  child: Text(
                    'Bientôt',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _showComingSoonDialog(BuildContext context, String feature) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Bientôt disponible'),
        content: Text(
          '$feature sera disponible dans une prochaine version de CalyMob.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('OK'),
          ),
        ],
      ),
    );
  }
}
```

### Navigation Routes Configuration

```dart
// lib/main.dart - Route configuration

MaterialApp(
  title: 'CalyMob',
  routes: {
    '/': (context) => LoginScreen(),
    '/landing': (context) => LandingScreen(),
    '/home': (context) => HomeScreen(),

    // Phase 1: Profile
    '/profile': (context) => ProfileScreen(),
    '/profile/edit-photo': (context) => FaceCameraCaptureScreen(),
    '/profile/privacy-settings': (context) => PrivacySettingsScreen(),
    '/profile/privacy-policy': (context) => PhotoPrivacyPolicyScreen(),

    // Phase 2: Member Directory
    '/members': (context) => MembersDirectoryScreen(),
    '/members/detail': (context) => MemberDetailScreen(),
    '/members/search': (context) => MemberSearchScreen(),

    // Phase 5: Messages (Future - not implemented yet)
    '/messages': (context) => ComingSoonScreen(feature: 'Messages'),
    '/messages/conversation': (context) => ComingSoonScreen(feature: 'Conversation'),

    // Existing routes
    '/expenses': (context) => ExpenseListScreen(),
    '/approvals': (context) => ApprovalListScreen(),
  },
);
```

---

## Phase 1: Core Profile System (Days 1-4)

### A. Database Schema

```dart
// Firestore: clubs/{clubId}/members/{userId}
{
  // Existing fields
  "prenom": "Jan",
  "nom": "Andriessens",
  "email": "jan@example.com",
  "plongeur_code": "4",
  "plongeur_niveau": "Plongeur 4★",
  "clubStatuten": ["instructor", "safety_officer"],

  // NEW: Profile Photo
  "profile_photo_url": "https://storage.googleapis.com/...",
  "photo_uploaded_at": Timestamp,
  "photo_consent": {
    "internal_use": true,           // Required
    "internal_consent_at": Timestamp,
    "external_use": false,          // Optional
    "external_consent_at": Timestamp,
    "consent_withdrawn_at": null,
    "consent_version": "1.0"
  },

  // NEW: Contact Information
  "telephone": "+32 123 456 789",
  "bio": "Passionate diver since 2010...",
  "member_since": Timestamp,

  // NEW: Contact Sharing Preferences
  "contact_consent": {
    "share_email_internal": true,   // Show email to members
    "share_phone_internal": true,   // Show phone to members
    "consent_at": Timestamp,
    "consent_version": "1.0"
  },

  // NEW: Notifications (Phase 4)
  "fcm_token": null,                 // Will be populated in Phase 4
  "fcm_token_updated_at": null,
  "notification_enabled": true
}
```

### B. Profile Screen Layout

```
┌────────────────────────────┐
│  ← Profil                  │
│                            │
│   [Large Profile Photo]    │ ← 120px, circular
│    (or initials if none)   │   Tap to view full size
│   🔒 Private Photo         │ ← Privacy indicator
│                            │
│   Jan Andriessens          │ ← prenom + nom (read-only)
│   jan@example.com          │ ← email (read-only)
│   [🏊 P4 Badge]            │ ← dive level badge
│   Member since: Jan 2010   │
│                            │
│  ─────────────────────     │
│  🔐 Privacy Settings       │
│  ─────────────────────     │
│                            │
│  Photo Usage:              │
│  ✓ Internal use (members)  │
│  [ ] External use          │ ← Toggle
│      (website, social)     │
│                            │
│  Contact Sharing:          │
│  [✓] Share email           │
│  [✓] Share phone           │
│                            │
│  [View Privacy Policy]     │
│                            │
│  ─────────────────────     │
│  📋 Account Actions        │
│  ─────────────────────     │
│                            │
│  🔒 Change Password        │ ← Info message
│  🚪 Sign Out               │ ← Logout
│                            │
└────────────────────────────┘
   [📷 Edit Photo FAB]       ← Floating button
```

### C. Photo Consent Flow

**Step 1: First Login Check**
```dart
// After successful login
if (!user.hasCompletedPhotoOnboarding) {
  Navigator.pushReplacement(
    context,
    MaterialPageRoute(
      builder: (_) => PhotoConsentOnboardingScreen(),
    ),
  );
}
```

**Step 2: Consent Screen (BEFORE camera)**
```
┌─────────────────────────────────┐
│  Photo Usage Consent            │
│                                 │
│  [✓] Internal Use (Required)    │
│      I consent to my photo      │
│      being visible to club      │
│      members and organizers     │
│      for identification and     │
│      event management.          │
│                                 │
│  [ ] External Use (Optional)    │
│      I also consent to my       │
│      photo being used on the    │
│      club website, social       │
│      media, and promotional     │
│      materials.                 │
│                                 │
│  ℹ️  You can change these        │
│     settings anytime in your    │
│     profile.                    │
│                                 │
│  [View Privacy Policy]          │
│                                 │
│  [Decline] [Accept & Continue]  │
└─────────────────────────────────┘
```

**Step 3: Face Detection Camera**
```
┌────────────────────────────┐
│        [X Close]           │
│                            │
│    ┌──────────────┐        │
│    │  ╭────────╮  │        │ ← Face oval guide
│    │  │  😊    │  │        │   (green when detected)
│    │  ╰────────╯  │        │
│    └──────────────┘        │
│                            │
│  ✅ Face detected          │
│  ✅ Well positioned        │
│  ⏳ Hold still...          │
│                            │
│  Auto-capturing in 2s      │
│                            │
│  🔒 This photo is private  │
│     and secure             │
│                            │
│  [Manual Capture]          │ ← After 30s
└────────────────────────────┘
```

### D. Contact Sharing Consent

```
┌─────────────────────────────────┐
│  Contact Sharing Preferences    │
│                                 │
│  Email: jan@example.com         │
│  [✓] Share with club members    │
│                                 │
│  Phone: +32 123 456 789         │
│  [✓] Share with club members    │
│                                 │
│  ℹ️  Your contact info will only │
│     be visible to members you   │
│     allow. You can change this  │
│     anytime.                    │
│                                 │
│  Why we ask:                    │
│  • Emergency contact            │
│  • Event coordination           │
│  • Club communication           │
│                                 │
│  [Save Preferences]             │
└─────────────────────────────────┘
```

### E. Files to Create (Phase 1)

**Models (3 files):**
1. `lib/models/member.dart` - Complete member model
2. `lib/models/photo_consent.dart` - Photo privacy consent
3. `lib/models/contact_consent.dart` - Contact sharing consent

**Services (2 files):**
4. `lib/services/profile_service.dart` - Profile CRUD operations
5. `lib/services/member_service.dart` - Extend existing with new fields

**Providers (1 file):**
6. `lib/providers/profile_provider.dart` - Profile state management

**Screens (5 files):**
7. `lib/screens/profile/profile_screen.dart` - Main profile display
8. `lib/screens/profile/face_camera_capture_screen.dart` - Photo capture
9. `lib/screens/profile/photo_consent_onboarding_screen.dart` - First-time consent
10. `lib/screens/profile/privacy_settings_screen.dart` - Edit privacy
11. `lib/screens/profile/photo_privacy_policy_screen.dart` - Privacy policy

**Total: 11 new files**

---

## Phase 2: Member Directory (Days 5-7)

### A. "Who's Who" Directory Screen

```
┌────────────────────────────────┐
│  Qui est qui  🔍 [Search]      │
│                                │
│  Filters: [All Levels ▼]      │
│           [All Roles ▼]        │
│                                │
│  42 members                    │
│                                │
│  ┌──────────────────────────┐ │
│  │ [📷] Jan Andriessens     │ │
│  │      P4 • Instructor     │ │
│  │      📞 💬 ✉️             │ │
│  └──────────────────────────┘ │
│                                │
│  ┌──────────────────────────┐ │
│  │ [📷] Marie Dubois        │ │
│  │      P3 • Diver          │ │
│  │      💬 ✉️                │ │ ← No phone shared
│  └──────────────────────────┘ │
│                                │
│  ┌──────────────────────────┐ │
│  │ [JA] Carlos Martin       │ │ ← No photo, initials
│  │      MC • Safety Officer │ │
│  │      📞 💬 ✉️             │ │
│  └──────────────────────────┘ │
│                                │
│  ┌──────────────────────────┐ │
│  │ [📷] Sophie Laurent      │ │
│  │      P2 • Student        │ │
│  │      ✉️                   │ │ ← Only email
│  └──────────────────────────┘ │
└────────────────────────────────┘
```

### B. Member Detail Screen

```
┌────────────────────────────────┐
│  ← Back                        │
│                                │
│     [Large Profile Photo]      │
│                                │
│     Jan Andriessens            │
│     Plongeur 4★                │
│                                │
│  ─────────────────────────     │
│  🎖️ Roles & Functions           │
│  ─────────────────────────     │
│  • Dive Instructor             │
│  • Safety Officer              │
│  • Equipment Manager           │
│                                │
│  ─────────────────────────     │
│  📞 Contact                     │
│  ─────────────────────────     │
│  ✉️  jan@example.com            │
│  📱  +32 123 456 789            │
│                                │
│  [📞 Call] [💬 WhatsApp] [✉️]  │
│                                │
│  ─────────────────────────     │
│  ℹ️ About                       │
│  ─────────────────────────     │
│  Passionate diver since 2010.  │
│  Specialized in deep diving    │
│  and wreck exploration.        │
│                                │
│  📅 Member since: Jan 2010     │
│  🏊 Events attended: 127       │
│  📚 Certifications: P4, Nitrox │
└────────────────────────────────┘
```

### C. Search & Filters

**Search by:**
- Name (first or last)
- Dive level (P2, P3, P4, MC)
- Club role/function

**Filter options:**
```dart
enum DiveLevel {
  all,
  nb,   // Non Breveté
  p2,   // Plongeur 2★
  p3,   // Plongeur 3★
  p4,   // Plongeur 4★
  am,   // Assistant Moniteur
  mc,   // Moniteur Club
}

enum ClubRole {
  all,
  instructor,
  safetyOfficer,
  equipmentManager,
  student,
  diver,
}
```

### D. Contact Action Buttons

**Call Button:**
```dart
void _makePhoneCall(String phoneNumber) async {
  final uri = Uri.parse('tel:$phoneNumber');
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri);
  }
}
```

**Email Button:**
```dart
void _sendEmail(String email) async {
  final uri = Uri.parse('mailto:$email?subject=CalyMob - Contact');
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri);
  }
}
```

**WhatsApp Button:** (Implemented in Phase 3)

### E. Files to Create (Phase 2)

**Providers (1 file):**
1. `lib/providers/members_provider.dart` - Directory state management

**Screens (3 files):**
2. `lib/screens/members/members_directory_screen.dart` - Main directory
3. `lib/screens/members/member_detail_screen.dart` - Member profile view
4. `lib/screens/members/member_search_screen.dart` - Search interface

**Widgets (2 files):**
5. `lib/widgets/member_list_tile.dart` - Reusable member list item
6. `lib/widgets/member_filter_dialog.dart` - Filter UI

**Total: 6 new files**

---

## Phase 3: WhatsApp Integration (Day 8)

### A. WhatsApp Deep Linking

**Service Implementation:**
```dart
// lib/services/whatsapp_service.dart

class WhatsAppService {
  /// Open WhatsApp chat with a member
  Future<void> openWhatsAppChat({
    required String phoneNumber,
    required String memberName,
    String? initialMessage,
  }) async {
    // Format phone number: remove spaces, keep country code
    final cleanPhone = phoneNumber
        .replaceAll(RegExp(r'\s+'), '')
        .replaceAll('+', '');

    // Default message in French
    final message = initialMessage ?? 'Bonjour $memberName,';
    final encodedMessage = Uri.encodeComponent(message);

    // Try WhatsApp app first (mobile)
    final whatsappUrl = 'whatsapp://send?phone=$cleanPhone&text=$encodedMessage';

    // Fallback to WhatsApp Web (desktop/web)
    final whatsappWebUrl = 'https://wa.me/$cleanPhone?text=$encodedMessage';

    try {
      if (await canLaunchUrl(Uri.parse(whatsappUrl))) {
        await launchUrl(
          Uri.parse(whatsappUrl),
          mode: LaunchMode.externalApplication,
        );
      } else {
        // WhatsApp not installed, use web version
        await launchUrl(
          Uri.parse(whatsappWebUrl),
          mode: LaunchMode.externalApplication,
        );
      }
    } catch (e) {
      throw WhatsAppException('Could not open WhatsApp: $e');
    }
  }

  /// Check if WhatsApp is installed
  Future<bool> isWhatsAppInstalled() async {
    return await canLaunchUrl(Uri.parse('whatsapp://'));
  }
}
```

### B. UI Integration

**WhatsApp Button:**
```dart
ElevatedButton.icon(
  icon: Icon(Icons.message, color: Colors.white),
  label: Text('WhatsApp'),
  style: ElevatedButton.styleFrom(
    backgroundColor: Color(0xFF25D366),  // WhatsApp green
  ),
  onPressed: () => WhatsAppService().openWhatsAppChat(
    phoneNumber: member.telephone!,
    memberName: member.fullName,
  ),
)
```

### C. Error Handling

```dart
try {
  await whatsAppService.openWhatsAppChat(...);
} on WhatsAppException catch (e) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text('Impossible d\'ouvrir WhatsApp: ${e.message}'),
      action: SnackBarAction(
        label: 'Appeler',
        onPressed: () => _makePhoneCall(member.telephone!),
      ),
    ),
  );
}
```

### D. Files to Create (Phase 3)

1. `lib/services/whatsapp_service.dart` - WhatsApp integration service
2. `lib/exceptions/whatsapp_exception.dart` - Custom exception

**Total: 2 new files**

---

## Phase 4: Push Notifications Foundation (Days 9-10)

### A. Package Installation

```yaml
# pubspec.yaml
dependencies:
  firebase_messaging: ^15.0.0
  flutter_local_notifications: ^17.0.0
```

### B. iOS Configuration

**1. Enable capabilities in Xcode:**
- Push Notifications
- Background Modes → Remote notifications

**2. Update Info.plist:**
```xml
<key>UIBackgroundModes</key>
<array>
  <string>fetch</string>
  <string>remote-notification</string>
</array>
```

**3. Upload APNs certificate to Firebase Console**

### C. Android Configuration

**Update AndroidManifest.xml:**
```xml
<manifest>
  <!-- Already has google-services.json configured -->

  <application>
    <!-- Add notification channel -->
    <meta-data
      android:name="com.google.firebase.messaging.default_notification_channel_id"
      android:value="calymob_notifications" />
  </application>
</manifest>
```

### D. Notification Service

```dart
// lib/services/notification_service.dart

class NotificationService {
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  /// Initialize push notifications
  Future<void> initialize() async {
    // Request permission
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      debugPrint('✅ Notification permission granted');

      // Get FCM token
      final token = await _messaging.getToken();
      await _storeToken(token);

      // Listen for token refresh
      _messaging.onTokenRefresh.listen(_storeToken);

      // Configure handlers
      _configureHandlers();

      // Initialize local notifications
      await _initializeLocalNotifications();
    } else {
      debugPrint('❌ Notification permission denied');
    }
  }

  /// Store FCM token in Firestore
  Future<void> _storeToken(String? token) async {
    if (token == null) return;

    final userId = FirebaseAuth.instance.currentUser?.uid;
    if (userId == null) return;

    await FirebaseFirestore.instance
        .doc('clubs/calypso/members/$userId')
        .update({
      'fcm_token': token,
      'fcm_token_updated_at': FieldValue.serverTimestamp(),
    });

    debugPrint('✅ FCM token stored: ${token.substring(0, 10)}...');
  }

  /// Configure notification handlers
  void _configureHandlers() {
    // Foreground messages
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // Background messages
    FirebaseMessaging.onBackgroundMessage(_handleBackgroundMessage);

    // Notification tap (app opened from notification)
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);
  }

  /// Handle foreground messages
  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    debugPrint('📬 Foreground message: ${message.notification?.title}');

    // Show local notification
    await _localNotifications.show(
      message.hashCode,
      message.notification?.title,
      message.notification?.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          'calymob_notifications',
          'CalyMob Notifications',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
    );
  }

  /// Handle notification tap
  void _handleNotificationTap(RemoteMessage message) {
    debugPrint('👆 Notification tapped: ${message.data}');

    // Navigate based on notification type
    final type = message.data['type'];
    switch (type) {
      case 'event_reminder':
        // Navigate to event detail
        navigatorKey.currentState?.pushNamed(
          '/event-detail',
          arguments: message.data['eventId'],
        );
        break;
      case 'payment_confirmed':
        // Navigate to event detail
        navigatorKey.currentState?.pushNamed(
          '/event-detail',
          arguments: message.data['eventId'],
        );
        break;
      case 'message':
        // Navigate to chat (Phase 5)
        break;
    }
  }

  /// Initialize local notifications
  Future<void> _initializeLocalNotifications() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings();

    await _localNotifications.initialize(
      InitializationSettings(android: androidSettings, iOS: iosSettings),
    );
  }
}

/// Background message handler (must be top-level function)
@pragma('vm:entry-point')
Future<void> _handleBackgroundMessage(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint('📬 Background message: ${message.notification?.title}');
}
```

### E. Cloud Functions for Notifications

**Create: functions/src/notifications/sendNotification.js**

```javascript
const admin = require('firebase-admin');
const functions = require('firebase-functions');

/**
 * Send event reminder notifications
 * Runs daily at 9:00 AM
 */
exports.sendEventReminders = functions.pubsub
  .schedule('0 9 * * *')
  .timeZone('Europe/Brussels')
  .onRun(async (context) => {
    console.log('📅 Checking for events tomorrow...');

    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    // Query events happening tomorrow
    const eventsSnapshot = await admin.firestore()
      .collection('clubs/calypso/operations')
      .where('dateOperation', '>=', admin.firestore.Timestamp.fromDate(tomorrow))
      .where('dateOperation', '<', admin.firestore.Timestamp.fromDate(dayAfterTomorrow))
      .get();

    console.log(`Found ${eventsSnapshot.size} events tomorrow`);

    // For each event, notify registered participants
    for (const eventDoc of eventsSnapshot.docs) {
      const event = eventDoc.data();

      // Get participants
      const participantsSnapshot = await eventDoc.ref
        .collection('inscriptions')
        .get();

      console.log(`Event "${event.titre}": ${participantsSnapshot.size} participants`);

      // Send notification to each participant
      const notifications = [];
      for (const participantDoc of participantsSnapshot.docs) {
        const participant = participantDoc.data();

        // Get member's FCM token
        const memberDoc = await admin.firestore()
          .doc(`clubs/calypso/members/${participant.membreId}`)
          .get();

        const member = memberDoc.data();
        if (!member?.fcm_token || !member?.notification_enabled) {
          continue;
        }

        // Prepare notification
        notifications.push(
          admin.messaging().send({
            token: member.fcm_token,
            notification: {
              title: 'Rappel: Plongée demain! 🤿',
              body: `${event.titre} - ${event.lieu || 'Lieu à confirmer'}`,
            },
            data: {
              type: 'event_reminder',
              eventId: eventDoc.id,
              clubId: 'calypso',
            },
            android: {
              priority: 'high',
              notification: {
                sound: 'default',
                channelId: 'calymob_notifications',
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  badge: 1,
                },
              },
            },
          })
        );
      }

      // Send all notifications
      const results = await Promise.allSettled(notifications);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      console.log(`✅ Sent ${successCount}/${notifications.length} notifications for "${event.titre}"`);
    }

    return null;
  });

/**
 * Send payment confirmation notification
 * Triggered when payment status changes to 'completed'
 */
exports.sendPaymentConfirmation = functions.firestore
  .document('clubs/{clubId}/operations/{operationId}/inscriptions/{inscriptionId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Check if payment just completed
    if (before.paye === false && after.paye === true) {
      console.log(`💰 Payment completed for ${after.membreNom} ${after.membrePrenom}`);

      // Get member's FCM token
      const memberDoc = await admin.firestore()
        .doc(`clubs/${context.params.clubId}/members/${after.membreId}`)
        .get();

      const member = memberDoc.data();
      if (!member?.fcm_token || !member?.notification_enabled) {
        return null;
      }

      // Get operation details
      const operationDoc = await admin.firestore()
        .doc(`clubs/${context.params.clubId}/operations/${context.params.operationId}`)
        .get();

      const operation = operationDoc.data();

      // Send confirmation
      await admin.messaging().send({
        token: member.fcm_token,
        notification: {
          title: 'Paiement confirmé ✅',
          body: `Votre paiement de ${after.prix}€ pour "${operation.titre}" a été confirmé.`,
        },
        data: {
          type: 'payment_confirmed',
          eventId: context.params.operationId,
          clubId: context.params.clubId,
        },
      });

      console.log(`✅ Payment confirmation sent to ${after.membreNom}`);
    }

    return null;
  });
```

### F. Notification Types

**1. Event Reminders**
- **When:** 24 hours before event
- **Title:** "Rappel: Plongée demain! 🤿"
- **Body:** "{Event Title} - {Location}"
- **Action:** Open event detail screen

**2. Payment Confirmations**
- **When:** Payment status changes to 'completed'
- **Title:** "Paiement confirmé ✅"
- **Body:** "Votre paiement de {amount}€ pour "{event}" a été confirmé."
- **Action:** Open event detail screen

**3. Admin Announcements** (Future)
- **When:** Admin sends announcement
- **Title:** Custom title
- **Body:** Custom message
- **Action:** Open announcements screen

**4. Messages** (Phase 5)
- **When:** New direct message received
- **Title:** "{Sender Name}"
- **Body:** Message preview
- **Action:** Open conversation

### G. Files to Create (Phase 4)

**Services (1 file):**
1. `lib/services/notification_service.dart` - FCM handling

**Cloud Functions (2 files):**
2. `functions/src/notifications/sendEventReminders.js` - Event reminders
3. `functions/src/notifications/sendPaymentConfirmation.js` - Payment notifications

**Total: 3 new files**

---

## Phase 5: Future Features (Messaging)

### Status: 🔮 Planned for Future Release

This phase will implement in-app messaging between members. Currently represented by a grayed-out "Messages" tile on the landing screen.

### A. Data Model (Future)

```dart
// Collection: clubs/{clubId}/conversations
{
  "id": "conv_abc123",
  "participants": ["user1_id", "user2_id"],
  "participantNames": {
    "user1_id": "Jan Andriessens",
    "user2_id": "Marie Dubois"
  },
  "lastMessage": "À bientôt dimanche!",
  "lastMessageAt": Timestamp,
  "lastMessageBy": "user1_id",
  "unreadCount": {
    "user1_id": 0,
    "user2_id": 2
  },
  "createdAt": Timestamp
}

// Subcollection: conversations/{convId}/messages
{
  "id": "msg_xyz789",
  "senderId": "user1_id",
  "senderName": "Jan Andriessens",
  "content": "Salut! On se voit dimanche pour la sortie?",
  "sentAt": Timestamp,
  "readAt": Timestamp | null,
  "type": "text",  // "text", "image", "file"
  "metadata": {
    "imageUrl": null,
    "fileUrl": null,
    "fileName": null
  }
}
```

### B. Screens (Future)

1. **ConversationsListScreen** - Inbox with all conversations
2. **ChatScreen** - Individual conversation view
3. **NewMessageScreen** - Start new conversation

### C. Features (Future)

- Real-time messaging (Firestore streams)
- Read receipts
- Typing indicators
- Push notifications for new messages
- Image sharing
- File sharing
- Group chats

### D. Estimated Effort

- **Development:** 20-30 hours
- **Testing:** 5-8 hours
- **Total:** 25-38 hours (~5-8 days)

---

## Implementation Schedule

### Week 1: Profile & Navigation (5 days)

**Day 1: Setup & Navigation**
- Update landing screen with 2x3 grid
- Add navigation tiles (active + grayed out)
- Implement "Coming Soon" dialog
- Add routes configuration

**Day 2-3: Profile Models & Services**
- Create Member model with PhotoConsent
- Create ContactConsent model
- Create ProfileService
- Extend MemberService

**Day 4: Profile Screen**
- Build ProfileScreen UI
- Implement privacy settings
- Add sign out functionality

**Day 5: Photo Capture**
- Integrate face_camera package
- Build consent onboarding flow
- Implement photo upload

### Week 2: Member Directory (5 days)

**Day 6: Directory Foundation**
- Create MembersProvider
- Build MembersDirectoryScreen
- Implement member list with photos

**Day 7: Search & Filters**
- Add search functionality
- Implement filters (level, role)
- Build MemberSearchScreen

**Day 8: Member Details**
- Build MemberDetailScreen
- Add contact action buttons
- Implement WhatsAppService

**Day 9-10: Push Notifications**
- Install firebase_messaging
- Configure iOS/Android
- Create NotificationService
- Deploy Cloud Functions

---

## Technical Specifications

### Package Dependencies

```yaml
# pubspec.yaml

dependencies:
  # Existing
  flutter:
    sdk: flutter
  firebase_core: ^4.2.0
  firebase_auth: ^6.1.1
  cloud_firestore: ^6.0.3
  firebase_storage: ^13.0.3
  cloud_functions: ^6.0.3
  provider: ^6.1.1
  url_launcher: ^6.2.4

  # NEW: Profile & Photos
  face_camera: ^0.2.0
  google_mlkit_face_detection: ^0.8.0
  camera: ^0.10.5
  permission_handler: ^11.0.0
  cached_network_image: ^3.3.0

  # NEW: Notifications
  firebase_messaging: ^15.0.0
  flutter_local_notifications: ^17.0.0
```

### File Structure

```
lib/
├── models/
│   ├── member.dart                    ← NEW
│   ├── photo_consent.dart             ← NEW
│   └── contact_consent.dart           ← NEW
├── services/
│   ├── profile_service.dart           ← NEW
│   ├── notification_service.dart      ← NEW
│   ├── whatsapp_service.dart          ← NEW
│   └── member_service.dart            ← EXTEND
├── providers/
│   ├── profile_provider.dart          ← NEW
│   └── members_provider.dart          ← NEW
├── screens/
│   ├── profile/
│   │   ├── profile_screen.dart        ← NEW
│   │   ├── face_camera_capture_screen.dart  ← NEW
│   │   ├── photo_consent_onboarding_screen.dart  ← NEW
│   │   ├── privacy_settings_screen.dart  ← NEW
│   │   └── photo_privacy_policy_screen.dart  ← NEW
│   ├── members/
│   │   ├── members_directory_screen.dart  ← NEW
│   │   ├── member_detail_screen.dart  ← NEW
│   │   └── member_search_screen.dart  ← NEW
│   └── home/
│       └── landing_screen.dart        ← MODIFY
├── widgets/
│   ├── member_list_tile.dart          ← NEW
│   └── member_filter_dialog.dart      ← NEW
└── main.dart                          ← MODIFY (routes)

functions/
└── src/
    └── notifications/
        ├── sendEventReminders.js      ← NEW
        └── sendPaymentConfirmation.js  ← NEW

docs/
└── MEMBER_PROFILE_COMMUNICATION_PLAN.md  ← THIS FILE
```

### Cloud Functions Deployment

```bash
# Deploy all functions
cd functions
npm run deploy

# Deploy specific function
firebase deploy --only functions:sendEventReminders
firebase deploy --only functions:sendPaymentConfirmation
```

---

## Success Metrics

### User Adoption

**Profile Photos:**
- Target: 95% of members complete photo within 1 week
- Metric: `COUNT(profile_photo_url != null) / COUNT(members)`

**Contact Sharing:**
- Target: 80% share at least one contact method
- Metric: `COUNT(share_email OR share_phone) / COUNT(members)`

**Member Directory Usage:**
- Target: 50% weekly active users browse "Who's Who"
- Metric: Analytics event tracking

**WhatsApp Integration:**
- Target: 30% of users use WhatsApp button within 1 month
- Metric: Event tracking on button clicks

**Notifications:**
- Target: 90%+ delivery rate
- Target: <10% opt-out rate
- Metric: FCM delivery reports + notification_enabled field

### Technical Performance

**Profile Load Time:**
- Target: <3 seconds from landing screen tap to profile display
- Measure: Performance monitoring

**Member Directory Search:**
- Target: <1 second search results
- Measure: Client-side timing

**Photo Upload:**
- Target: <10 seconds from capture to storage
- Measure: Upload duration tracking

**Notification Latency:**
- Target: <5 seconds from trigger to device delivery
- Measure: FCM analytics

---

## Privacy & GDPR Compliance

### Consent Management

**Three-Level Consent System:**

1. **Photo - Internal Use (REQUIRED)**
   - Purpose: Member identification, event management, safety
   - Visibility: Club members and organizers only
   - Storage: Firebase Storage (encrypted)
   - Retention: Until membership ends or user requests deletion

2. **Photo - External Use (OPTIONAL)**
   - Purpose: Website, social media, promotional materials
   - Visibility: Public
   - User control: Can withdraw consent anytime
   - Effect of withdrawal: Photo removed from external channels within 48 hours

3. **Contact Information (OPTIONAL)**
   - Purpose: Member-to-member communication
   - Visibility: Club members only (if consented)
   - Fields: Email, phone number
   - User control: Toggle visibility anytime

### GDPR Rights Implementation

**Right to Access:**
- Users can view all their data in profile screen
- Export function (future): Download all personal data

**Right to Rectification:**
- Contact information editable (future feature)
- Photo replaceable anytime

**Right to Erasure:**
- Remove photo: Deletes from Storage and Firestore
- Account deletion: Removes all personal data (requires admin)

**Right to Restrict Processing:**
- Disable external use: Photo not used on website/social
- Disable contact sharing: Info hidden from other members

**Right to Data Portability:**
- Export function (future): JSON download of all data

**Right to Object:**
- Opt-out of notifications: Toggle in profile
- Opt-out of external photo use: Toggle in privacy settings

### Data Retention

**Active Members:**
- Profile data: Retained indefinitely
- Photos: Retained until user deletes or membership ends
- FCM tokens: Refreshed regularly, old tokens auto-deleted

**Inactive Members:**
- After 2 years of inactivity: Data archived
- After 5 years: Data deletion (GDPR requirement)
- Notification: Users notified 90 days before deletion

### Security Measures

**Photo Storage:**
- Firebase Storage with authentication rules
- HTTPS-only access
- Encrypted at rest and in transit

**Contact Information:**
- Firestore security rules enforce consent checks
- No direct database access without authentication

**FCM Tokens:**
- Stored securely in Firestore
- Never exposed to client
- Auto-refresh on expiration

---

## Cost Estimation

### Development Costs

**Phase 1: Profile System (4 days)**
- Profile models and services: 8 hours
- Profile screen UI: 8 hours
- Face detection integration: 8 hours
- Consent system: 8 hours
- **Subtotal:** 32 hours × €60/hr = **€1,920**

**Phase 2: Member Directory (3 days)**
- Directory screen and list: 8 hours
- Member detail screen: 4 hours
- Search and filters: 8 hours
- Navigation integration: 4 hours
- **Subtotal:** 24 hours × €60/hr = **€1,440**

**Phase 3: WhatsApp Integration (1 day)**
- WhatsApp service: 4 hours
- UI integration and testing: 4 hours
- **Subtotal:** 8 hours × €60/hr = **€480**

**Phase 4: Push Notifications (2 days)**
- FCM setup and configuration: 4 hours
- Notification service: 8 hours
- Cloud Functions: 4 hours
- Testing: 4 hours
- **Subtotal:** 20 hours × €60/hr = **€1,200**

**Total Development:** 84 hours = **€5,040**

### Infrastructure Costs (Monthly)

**Firebase:**
- Free tier sufficient for small club (<1000 members)
- Estimated: €0/month

**Cloud Functions:**
- Event reminders: ~30 invocations/month
- Payment notifications: ~50 invocations/month
- Estimated: €5-10/month

**Firebase Cloud Messaging:**
- Unlimited push notifications
- Estimated: €0/month

**Firebase Storage:**
- Profile photos: ~50 MB average per 100 members
- Estimated: €0-5/month

**Total Infrastructure:** €5-15/month

### Phase 5 (Future - Messaging)

**Development:** 25-38 hours × €60/hr = **€1,500-2,280**

---

## Risk Assessment

### Technical Risks

**1. Face Detection Performance on Older Devices**
- **Risk:** Slow or failed detection on older phones
- **Mitigation:** Manual capture fallback after 30 seconds
- **Probability:** Medium
- **Impact:** Low

**2. iOS APNs Certificate Configuration**
- **Risk:** Complex setup, potential misconfiguration
- **Mitigation:** Detailed documentation, test on multiple devices
- **Probability:** Medium
- **Impact:** Medium

**3. Firebase Free Tier Limits**
- **Risk:** Exceeding free tier quotas with growth
- **Mitigation:** Monitor usage, upgrade to paid plan if needed
- **Probability:** Low
- **Impact:** Low (€25-50/month cost increase)

### User Adoption Risks

**1. Photo Upload Reluctance**
- **Risk:** Users hesitant to share photos
- **Mitigation:** Clear privacy explanations, optional external use
- **Probability:** Medium
- **Impact:** Medium

**2. Contact Sharing Privacy Concerns**
- **Risk:** Users don't want to share email/phone
- **Mitigation:** Make it optional, clear consent UI
- **Probability:** Low
- **Impact:** Low

**3. Notification Fatigue**
- **Risk:** Too many notifications leading to opt-outs
- **Mitigation:** Limit to important events only, user controls
- **Probability:** Medium
- **Impact:** Medium

---

## Testing Strategy

### Unit Tests

**Models:**
- Member model serialization/deserialization
- PhotoConsent validation
- ContactConsent validation

**Services:**
- ProfileService CRUD operations
- WhatsAppService URL formatting
- NotificationService token management

### Integration Tests

**Profile Flow:**
- First-time photo upload with consent
- Photo replacement
- Privacy settings updates

**Member Directory:**
- Search functionality
- Filtering by level and role
- Contact information visibility based on consent

**Notifications:**
- FCM token registration
- Notification delivery to device
- Notification tap navigation

### Manual Testing Checklist

**Phase 1: Profile**
- [ ] New user sees consent screen before camera
- [ ] Face detection auto-captures when centered
- [ ] Manual capture works after 30 seconds
- [ ] Photo appears in profile after upload
- [ ] Privacy settings can be changed
- [ ] Sign out works correctly

**Phase 2: Member Directory**
- [ ] All members appear in directory
- [ ] Search finds members by name
- [ ] Filters work for level and role
- [ ] Contact info respects privacy settings
- [ ] Phone numbers hidden if not shared
- [ ] Emails hidden if not shared
- [ ] Member detail screen shows correct info

**Phase 3: WhatsApp**
- [ ] WhatsApp opens on mobile
- [ ] WhatsApp Web opens on desktop
- [ ] Phone numbers formatted correctly
- [ ] Error handling for WhatsApp not installed

**Phase 4: Notifications**
- [ ] Permission request appears on first launch
- [ ] FCM token stored in Firestore
- [ ] Event reminder received 24h before
- [ ] Payment confirmation received
- [ ] Notification tap opens correct screen
- [ ] Notification settings persist

### Device Testing Matrix

| Device Type | iOS Version | Android Version | Status |
|-------------|-------------|-----------------|--------|
| iPhone 13 Pro | iOS 17 | - | Required |
| iPhone SE | iOS 16 | - | Required |
| Samsung Galaxy S21 | - | Android 13 | Required |
| Google Pixel 6 | - | Android 14 | Required |
| iPad Pro | iOS 17 | - | Optional |
| Web Browser | - | - | Optional |

---

## Deployment Plan

### Phase 1: Internal Testing (Week 1)

**Participants:** 5-10 club admins and instructors

**Tasks:**
1. Complete profile with photo
2. Set privacy preferences
3. Browse member directory
4. Test WhatsApp integration
5. Provide feedback

**Success Criteria:**
- All testers complete profile successfully
- No critical bugs reported
- Average satisfaction score >4/5

### Phase 2: Beta Release (Week 2)

**Participants:** 50 active club members

**Communication:**
- Email announcement with instructions
- In-app tutorial on first launch
- Support channel for questions

**Monitoring:**
- Daily review of error logs
- Track completion rates
- Collect feedback via survey

**Success Criteria:**
- 90%+ profile completion rate
- <5 critical issues reported
- Average satisfaction score >4/5

### Phase 3: Full Release (Week 3)

**Rollout:**
- Announcement to all club members
- Update app in App Store / Play Store
- Website announcement
- Social media posts

**Support:**
- FAQ document
- Email support
- In-app help section

**Monitoring:**
- Firebase Crashlytics for errors
- Google Analytics for usage
- User feedback collection

---

## Maintenance Plan

### Daily Tasks

**Monitor:**
- FCM token registration success rate
- Notification delivery rates
- Error logs in Firebase Console

**Respond:**
- Critical bugs within 4 hours
- User support requests within 24 hours

### Weekly Tasks

**Review:**
- User feedback and suggestions
- Analytics data (adoption rates, usage patterns)
- Cloud Functions execution logs

**Update:**
- Fix non-critical bugs
- Optimize performance issues
- Update documentation

### Monthly Tasks

**Analyze:**
- Success metrics vs. targets
- Infrastructure costs
- Feature usage statistics

**Plan:**
- Prioritize feature requests
- Plan next iteration
- Review and update roadmap

---

## Future Enhancements (Post-Launch)

### Short Term (1-3 months)

**1. Enhanced Profile Editing**
- Edit name (with admin approval)
- Add bio/description
- Add certifications and achievements
- Member since date

**2. Advanced Search**
- Search by certification
- Search by specialization (wreck, deep, etc.)
- Availability calendar

**3. Notification Preferences**
- Granular control (event reminders, payments, etc.)
- Quiet hours (no notifications 10pm-8am)
- Digest mode (daily summary)

### Medium Term (3-6 months)

**4. In-App Messaging (Phase 5)**
- Direct messages between members
- Group chats
- Image/file sharing
- Push notifications

**5. QR Code Check-In**
- Generate member QR code
- Scan QR for event check-in
- Attendance tracking

**6. Event Chat Rooms**
- Discussion for each event
- Logistics coordination
- Carpool organization

### Long Term (6-12 months)

**7. Activity Feed**
- Recent events attended
- Achievements and badges
- Member milestones

**8. Buddy Finder**
- Match dive partners by level
- Find available buddies for events
- Request buddy for specific dive

**9. Equipment Locker**
- Track personal gear
- Share/borrow equipment
- Maintenance reminders

---

## Glossary

**APNs** - Apple Push Notification service
**FCM** - Firebase Cloud Messaging
**GDPR** - General Data Protection Regulation (EU privacy law)
**FAB** - Floating Action Button
**LIFRAS** - Belgian diving federation
**Plongeur** - Diver (French)
**Moniteur** - Instructor (French)

---

## Appendix A: Privacy Policy Template

```markdown
# CalyMob - Photo & Contact Privacy Policy

**Last Updated:** January 2025

## 1. Introduction

CalyMob ("we", "our", "app") is a diving club management application operated by
Calypso Diving Club. We are committed to protecting your privacy and personal data.

## 2. Data Controller

Calypso Diving Club
Address: [Club Address]
Email: privacy@calypsodc.be
Data Protection Officer: dpo@calypsodc.be

## 3. Data We Collect

### 3.1 Profile Photo
- **What:** Your facial photograph
- **How:** Captured using your device camera with face detection
- **Purpose:** Member identification, event attendance, safety
- **Legal Basis:** Consent (explicit opt-in)

### 3.2 Contact Information
- **What:** Email address, phone number
- **How:** Imported from your membership record
- **Purpose:** Communication with other club members
- **Legal Basis:** Consent (explicit opt-in for sharing)

## 4. How We Use Your Data

### 4.1 Internal Use (Required)
Your photo and profile information is visible to:
- Club members within the CalyMob app
- Club organizers and administrators
- Event coordinators

This is used for:
- Member identification at events
- Event attendance tracking
- Safety and emergency purposes
- Club administration

### 4.2 External Use (Optional)
If you consent, your photo may be used for:
- Club website member directory
- Social media posts (Facebook, Instagram)
- Event photo galleries
- Promotional materials and newsletters

## 5. Your Rights (GDPR)

You have the right to:
- **Access:** View all your personal data
- **Rectification:** Update incorrect information
- **Erasure:** Delete your photo and data
- **Restrict Processing:** Limit how we use your data
- **Data Portability:** Receive your data in a portable format
- **Object:** Opt-out of certain processing
- **Withdraw Consent:** Change your mind at any time

To exercise these rights, contact: privacy@calypsodc.be

## 6. Data Storage & Security

### 6.1 Storage
- Photos: Firebase Storage (Google Cloud, encrypted)
- Contact info: Cloud Firestore (encrypted)
- Location: Europe (GDPR-compliant)

### 6.2 Security
- HTTPS encryption for all transfers
- Access control (authentication required)
- Regular security audits
- Automatic backups

### 6.3 Retention
- Active members: Data retained indefinitely
- Inactive members (2+ years): Data archived
- After 5 years: Data automatically deleted
- You can request deletion anytime

## 7. Sharing Your Data

We NEVER sell your data. We share your data only with:
- Other club members (if you consent)
- Service providers (Firebase/Google Cloud) for hosting
- Legal authorities (if legally required)

## 8. Children's Privacy

CalyMob is intended for club members aged 16+. If under 16, parental
consent is required.

## 9. Changes to This Policy

We may update this policy. You will be notified of significant changes
via email or in-app notification.

## 10. Contact Us

Questions about privacy?
Email: privacy@calypsodc.be
Phone: [Club Phone]

## 11. Complaints

You have the right to lodge a complaint with the Belgian Data Protection Authority:
- Website: https://www.dataprotectionauthority.be/
- Phone: +32 2 274 48 00
```

---

## Appendix B: Communication Templates

### Email Template: Feature Announcement

```
Subject: Nouvelle fonctionnalité CalyMob: Profils et Annuaire des Membres 🤿

Chers membres du Calypso Diving Club,

Nous sommes ravis d'annoncer de nouvelles fonctionnalités dans CalyMob!

🆕 QUOI DE NEUF?

✓ Profils avec photo
  • Ajoutez votre photo de profil (avec détection de visage)
  • Gérez vos préférences de confidentialité
  • Contrôlez qui voit vos informations de contact

✓ Annuaire "Qui est qui"
  • Découvrez tous les membres du club
  • Voyez les niveaux et fonctions de chacun
  • Contactez facilement par téléphone, WhatsApp ou email

✓ Notifications intelligentes
  • Rappels automatiques avant vos plongées
  • Confirmations de paiement instantanées
  • Restez informé des actualités du club

🔒 VOTRE VIE PRIVÉE D'ABORD

• VOUS contrôlez qui voit votre photo
• VOUS décidez de partager votre email/téléphone
• Vos données sont sécurisées et cryptées
• Conforme RGPD

📱 COMMENT COMMENCER?

1. Mettez à jour CalyMob vers la dernière version
2. Ouvrez l'app et connectez-vous
3. Suivez les instructions pour ajouter votre photo
4. Explorez l'annuaire "Qui est qui"

❓ BESOIN D'AIDE?

Consultez notre guide: https://calypsodc.be/calymob-help
Email: support@calypsodc.be

Bonnes plongées!
L'équipe CalyMob

---
Calypso Diving Club
www.calypsodc.be
```

### In-App Notification: Beta Testing Invitation

```
🎉 Soyez parmi les premiers!

Vous êtes invité à tester nos nouvelles fonctionnalités:
• Profils avec photo
• Annuaire des membres
• Notifications intelligentes

Votre feedback est précieux!

[Participer au Beta] [Plus tard]
```

---

## Document Control

**Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-24 | Claude | Initial comprehensive plan |

**Reviewers:**
- [ ] Product Owner
- [ ] Technical Lead
- [ ] Privacy/Legal
- [ ] UX Designer

**Approval:**
- [ ] Approved for implementation
- [ ] Budget approved: €5,040
- [ ] Infrastructure budget approved: €15/month
- [ ] Start date: __________

---

**END OF DOCUMENT**

Total pages: 47
Total words: ~12,500
Estimated reading time: 45 minutes
