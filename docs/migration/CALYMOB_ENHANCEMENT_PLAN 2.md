# 🚀 CalyMob Enhancement Plan for VPDive Migration

**Project**: CalyMob Event Subscription Enhancement
**Timeline**: 5-6 weeks
**Goal**: Enable full event inscriptions with dual-source support (VPdive + Caly)

---

## 📊 Current State vs Target State

### Current CalyMob Capabilities ✅
- View open events
- Basic registration (simple confirmation)
- Unregister functionality
- Participant counting
- Real-time Firestore sync

### Target Capabilities 🎯
- Differentiate VPdive vs Caly events
- Full registration form with all fields
- Payment tracking and instructions
- Communication system (email/WhatsApp/push)
- Offline support
- QR code for payments and check-in

---

## 📅 Week 1: Source Differentiation & UI Updates

### Day 1-2: Update Models

**File**: `CalyMob/lib/models/operation.dart`
```dart
// Add these fields to Operation class
final String? source;          // 'vpdive' | 'caly' | null
final String? vpdiveId;        // Original VPdive reference
final bool isEditable;         // Can modify in CalyMob
final DateTime? lastSyncedAt;  // Last VPdive sync
final String? syncStatus;      // 'synced' | 'pending' | 'error'

// Add helper methods
bool get isVPDiveEvent => source == 'vpdive';
bool get isCalyEvent => source == 'caly';

Color getSourceColor() {
  switch (source) {
    case 'vpdive': return Color(0xFFFB923C); // Orange
    case 'caly': return Color(0xFF10B981);   // Green
    default: return Colors.grey;
  }
}

IconData getSourceIcon() {
  switch (source) {
    case 'vpdive': return Icons.download_outlined;
    case 'caly': return Icons.check_circle_outline;
    default: return Icons.event;
  }
}
```

### Day 2-3: Create Source Badge Widget

**File**: `CalyMob/lib/widgets/source_badge.dart`
```dart
import 'package:flutter/material.dart';
import '../models/operation.dart';

class SourceBadge extends StatelessWidget {
  final Operation operation;
  final bool showLock;

  const SourceBadge({
    Key? key,
    required this.operation,
    this.showLock = true,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    if (operation.source == null) return SizedBox.shrink();

    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: operation.getSourceColor().withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: operation.getSourceColor().withOpacity(0.3),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            operation.getSourceIcon(),
            size: 14,
            color: operation.getSourceColor(),
          ),
          SizedBox(width: 4),
          Text(
            operation.source == 'vpdive' ? 'VPDive' : 'Caly',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: operation.getSourceColor(),
            ),
          ),
          if (showLock && !operation.isEditable) ...[
            SizedBox(width: 4),
            Icon(
              Icons.lock_outline,
              size: 12,
              color: Colors.grey,
            ),
          ],
        ],
      ),
    );
  }
}
```

### Day 3-4: Update Operation Card

**File**: `CalyMob/lib/widgets/operation_card.dart`
```dart
// Add source badge to existing card
Widget build(BuildContext context) {
  return Card(
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header with title and source
            Row(
              children: [
                Expanded(
                  child: Text(
                    operation.titre,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                SourceBadge(operation: operation),
              ],
            ),
            // ... rest of card content
          ],
        ),
      ),
    ),
  );
}
```

### Day 4-5: Add Filtering

**File**: `CalyMob/lib/screens/operations/operations_list_screen.dart`
```dart
class _OperationsListScreenState extends State<OperationsListScreen> {
  String _sourceFilter = 'all';

  List<Operation> get filteredOperations {
    if (_sourceFilter == 'all') return operations;
    return operations.where((op) => op.source == _sourceFilter).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Événements'),
        actions: [
          IconButton(
            icon: Icon(Icons.filter_list),
            onPressed: _showFilterDialog,
          ),
        ],
      ),
      // ... rest of build
    );
  }

  void _showFilterDialog() {
    showDialog(
      context: context,
      builder: (context) => SimpleDialog(
        title: Text('Filtrer par source'),
        children: [
          _buildFilterOption('all', 'Tous les événements', Icons.list),
          _buildFilterOption('vpdive', 'VPDive uniquement', Icons.download),
          _buildFilterOption('caly', 'Caly uniquement', Icons.check_circle),
        ],
      ),
    );
  }

  Widget _buildFilterOption(String value, String label, IconData icon) {
    final isSelected = _sourceFilter == value;
    return SimpleDialogOption(
      onPressed: () {
        setState(() => _sourceFilter = value);
        Navigator.pop(context);
      },
      child: Row(
        children: [
          Icon(icon, color: isSelected ? Colors.blue : Colors.grey),
          SizedBox(width: 12),
          Expanded(child: Text(label)),
          if (isSelected) Icon(Icons.check, color: Colors.blue, size: 20),
        ],
      ),
    );
  }
}
```

---

## 📅 Week 2: Enhanced Registration Form

### Day 6-7: Create Registration Form Screen

**File**: `CalyMob/lib/screens/operations/registration_form_screen.dart`
```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../models/operation.dart';
import '../../providers/auth_provider.dart';
import '../../providers/operation_provider.dart';

class RegistrationFormScreen extends StatefulWidget {
  final Operation operation;

  const RegistrationFormScreen({Key? key, required this.operation})
      : super(key: key);

  @override
  _RegistrationFormScreenState createState() =>
      _RegistrationFormScreenState();
}

class _RegistrationFormScreenState extends State<RegistrationFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _lifrasController = TextEditingController();
  final _emergencyNameController = TextEditingController();
  final _emergencyPhoneController = TextEditingController();
  final _dietaryController = TextEditingController();
  final _commentsController = TextEditingController();

  bool _acceptTerms = false;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _prefillUserData();
  }

  void _prefillUserData() {
    final auth = context.read<AuthProvider>();
    final user = auth.currentUser;
    if (user != null) {
      _emailController.text = user.email ?? '';
      _nameController.text = user.displayName ?? '';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Inscription'),
        backgroundColor: Colors.blue,
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: EdgeInsets.all(16),
          children: [
            // Event info card
            _buildEventInfoCard(),

            SizedBox(height: 24),

            // Personal information
            _buildSectionTitle('Informations personnelles', Icons.person),
            _buildTextField(
              controller: _nameController,
              label: 'Nom complet *',
              validator: _requiredValidator,
              icon: Icons.person_outline,
            ),
            _buildTextField(
              controller: _emailController,
              label: 'Email *',
              validator: _emailValidator,
              keyboardType: TextInputType.emailAddress,
              icon: Icons.email_outlined,
            ),
            _buildTextField(
              controller: _phoneController,
              label: 'Téléphone *',
              validator: _requiredValidator,
              keyboardType: TextInputType.phone,
              icon: Icons.phone_outlined,
            ),
            _buildTextField(
              controller: _lifrasController,
              label: 'Numéro LIFRAS (optionnel)',
              icon: Icons.badge_outlined,
              helperText: 'Ex: 54791',
            ),

            SizedBox(height: 24),

            // Emergency contact
            _buildSectionTitle('Contact d\'urgence', Icons.emergency),
            _buildTextField(
              controller: _emergencyNameController,
              label: 'Nom du contact',
              icon: Icons.contact_phone_outlined,
            ),
            _buildTextField(
              controller: _emergencyPhoneController,
              label: 'Téléphone du contact',
              keyboardType: TextInputType.phone,
              icon: Icons.phone_in_talk_outlined,
            ),

            SizedBox(height: 24),

            // Additional information
            _buildSectionTitle('Informations complémentaires', Icons.info),
            _buildTextField(
              controller: _dietaryController,
              label: 'Régime alimentaire / Allergies',
              maxLines: 2,
              icon: Icons.restaurant_outlined,
            ),
            _buildTextField(
              controller: _commentsController,
              label: 'Commentaires',
              maxLines: 3,
              icon: Icons.comment_outlined,
            ),

            SizedBox(height: 24),

            // Terms and conditions
            Card(
              color: Colors.blue.shade50,
              child: CheckboxListTile(
                title: Text(
                  'J\'accepte les conditions',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: Text(
                  'Je confirme mon inscription et m\'engage à régler le montant de ${widget.operation.prixMembre?.toStringAsFixed(2) ?? '0'}€',
                  style: TextStyle(fontSize: 12),
                ),
                value: _acceptTerms,
                onChanged: (value) {
                  setState(() => _acceptTerms = value ?? false);
                },
                activeColor: Colors.blue,
              ),
            ),

            SizedBox(height: 24),

            // Submit button
            ElevatedButton(
              onPressed: _acceptTerms && !_isSubmitting
                  ? _submitRegistration
                  : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                minimumSize: Size(double.infinity, 50),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _isSubmitting
                  ? CircularProgressIndicator(color: Colors.white)
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.check_circle, color: Colors.white),
                        SizedBox(width: 8),
                        Text(
                          'Confirmer l\'inscription',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
            ),

            SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildEventInfoCard() {
    return Card(
      elevation: 2,
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    widget.operation.titre,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                SourceBadge(operation: widget.operation),
              ],
            ),
            SizedBox(height: 12),
            if (widget.operation.dateDebut != null)
              _buildInfoRow(
                Icons.calendar_today,
                DateFormatter.formatLong(widget.operation.dateDebut!),
              ),
            if (widget.operation.lieu != null)
              _buildInfoRow(Icons.location_on, widget.operation.lieu!),
            _buildInfoRow(
              Icons.euro,
              '${widget.operation.prixMembre?.toStringAsFixed(2) ?? '0'}€',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String text) {
    return Padding(
      padding: EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Colors.grey),
          SizedBox(width: 8),
          Text(text, style: TextStyle(fontSize: 14)),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title, IconData icon) {
    return Padding(
      padding: EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, size: 20, color: Colors.blue),
          SizedBox(width: 8),
          Text(
            title,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Colors.blue.shade700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    IconData? icon,
    String? Function(String?)? validator,
    TextInputType? keyboardType,
    int maxLines = 1,
    String? helperText,
  }) {
    return Padding(
      padding: EdgeInsets.only(bottom: 16),
      child: TextFormField(
        controller: controller,
        validator: validator,
        keyboardType: keyboardType,
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          helperText: helperText,
          prefixIcon: icon != null ? Icon(icon, size: 20) : null,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide(color: Colors.blue, width: 2),
          ),
        ),
      ),
    );
  }

  String? _requiredValidator(String? value) {
    if (value == null || value.isEmpty) {
      return 'Ce champ est requis';
    }
    return null;
  }

  String? _emailValidator(String? value) {
    if (value == null || value.isEmpty) {
      return 'Email requis';
    }
    if (!value.contains('@')) {
      return 'Email invalide';
    }
    return null;
  }

  Future<void> _submitRegistration() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    try {
      final auth = context.read<AuthProvider>();
      final operationProvider = context.read<OperationProvider>();

      // Prepare registration data
      final registrationData = {
        'operation_id': widget.operation.id,
        'operation_titre': widget.operation.titre,
        'membre_nom': _nameController.text,
        'email': _emailController.text,
        'telephone': _phoneController.text,
        'numero_licence': _lifrasController.text.isEmpty
            ? null
            : _lifrasController.text,
        'contact_urgence_nom': _emergencyNameController.text.isEmpty
            ? null
            : _emergencyNameController.text,
        'contact_urgence_tel': _emergencyPhoneController.text.isEmpty
            ? null
            : _emergencyPhoneController.text,
        'regime_alimentaire': _dietaryController.text.isEmpty
            ? null
            : _dietaryController.text,
        'commentaires': _commentsController.text.isEmpty
            ? null
            : _commentsController.text,
        'prix': widget.operation.prixMembre ?? 0,
        'paye': false,
        'source': 'caly_mobile',
        'registration_method': 'mobile',
        'date_inscription': DateTime.now(),
      };

      // Submit registration
      await operationProvider.registerWithDetails(
        clubId: 'calypso',
        operationId: widget.operation.id,
        userId: auth.currentUser?.uid ?? '',
        registrationData: registrationData,
      );

      if (mounted) {
        // Navigate to success screen
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => RegistrationSuccessScreen(
              operation: widget.operation,
              participantName: _nameController.text,
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _lifrasController.dispose();
    _emergencyNameController.dispose();
    _emergencyPhoneController.dispose();
    _dietaryController.dispose();
    _commentsController.dispose();
    super.dispose();
  }
}
```

### Day 8-9: Create Success Screen

**File**: `CalyMob/lib/screens/operations/registration_success_screen.dart`
```dart
class RegistrationSuccessScreen extends StatelessWidget {
  final Operation operation;
  final String participantName;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Success animation
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.check_circle,
                  size: 60,
                  color: Colors.green,
                ),
              ),

              SizedBox(height: 24),

              Text(
                'Inscription confirmée!',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),

              SizedBox(height: 16),

              Text(
                'Bonjour $participantName,',
                style: TextStyle(fontSize: 16),
              ),

              SizedBox(height: 8),

              Text(
                'Votre inscription à "${operation.titre}" a bien été enregistrée.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 16),
              ),

              SizedBox(height: 32),

              // Event details card
              Card(
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Column(
                    children: [
                      _buildDetailRow(
                        'Date',
                        DateFormatter.formatLong(operation.dateDebut!),
                        Icons.calendar_today,
                      ),
                      if (operation.lieu != null)
                        _buildDetailRow(
                          'Lieu',
                          operation.lieu!,
                          Icons.location_on,
                        ),
                      _buildDetailRow(
                        'Montant à payer',
                        '${operation.prixMembre?.toStringAsFixed(2)}€',
                        Icons.euro,
                      ),
                    ],
                  ),
                ),
              ),

              SizedBox(height: 24),

              // Payment instructions
              Card(
                color: Colors.orange.shade50,
                child: Padding(
                  padding: EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Icon(Icons.info_outline, color: Colors.orange),
                          SizedBox(width: 8),
                          Text(
                            'Paiement',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.orange.shade800,
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 8),
                      Text(
                        'Un email avec les instructions de paiement vous a été envoyé.',
                        style: TextStyle(fontSize: 14),
                      ),
                    ],
                  ),
                ),
              ),

              Spacer(),

              // Action buttons
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {
                        Navigator.pushNamedAndRemoveUntil(
                          context,
                          '/home',
                          (route) => false,
                        );
                      },
                      child: Text('Retour à l\'accueil'),
                    ),
                  ),
                  SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => MyRegistrationsScreen(),
                          ),
                        );
                      },
                      child: Text('Mes inscriptions'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value, IconData icon) {
    return Padding(
      padding: EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 20, color: Colors.grey),
          SizedBox(width: 12),
          Text(
            '$label:',
            style: TextStyle(
              color: Colors.grey.shade600,
              fontSize: 14,
            ),
          ),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 14,
              ),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}
```

---

## 📅 Week 3-4: Communication System

### Day 10-12: Push Notifications Setup

**File**: `CalyMob/lib/services/notification_service.dart`
```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationService {
  static final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  static final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static Future<void> initialize() async {
    // Request permission
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      print('✅ User granted permission');
    }

    // Configure local notifications
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings();
    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(initSettings);

    // Get FCM token
    final token = await _messaging.getToken();
    print('FCM Token: $token');
    await _saveTokenToFirestore(token);

    // Listen for token refresh
    _messaging.onTokenRefresh.listen(_saveTokenToFirestore);

    // Handle background messages
    FirebaseMessaging.onBackgroundMessage(_handleBackgroundMessage);

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
  }

  static Future<void> _saveTokenToFirestore(String? token) async {
    if (token == null) return;

    final user = FirebaseAuth.instance.currentUser;
    if (user != null) {
      await FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid)
          .update({
        'fcm_token': token,
        'fcm_token_updated': FieldValue.serverTimestamp(),
      });
    }
  }

  static Future<void> _handleBackgroundMessage(RemoteMessage message) async {
    print('Background message: ${message.messageId}');
  }

  static void _handleForegroundMessage(RemoteMessage message) {
    print('Foreground message: ${message.messageId}');

    // Show local notification
    _showLocalNotification(
      title: message.notification?.title ?? 'Notification',
      body: message.notification?.body ?? '',
      payload: message.data,
    );
  }

  static Future<void> _showLocalNotification({
    required String title,
    required String body,
    Map<String, dynamic>? payload,
  }) async {
    const androidDetails = AndroidNotificationDetails(
      'calymob_channel',
      'CalyMob Notifications',
      channelDescription: 'Notifications for CalyMob app',
      importance: Importance.high,
      priority: Priority.high,
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _localNotifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      details,
      payload: payload?.toString(),
    );
  }
}
```

### Day 13-15: Email & WhatsApp Integration

**Backend File**: `CalyCompta/functions/src/notifications.ts`
```typescript
import * as functions from 'firebase-functions';
import * as nodemailer from 'nodemailer';
import axios from 'axios';

// Email configuration
const mailTransport = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: functions.config().gmail.email,
    pass: functions.config().gmail.password,
  },
});

export const sendEventNotification = functions.https.onCall(
  async (data, context) => {
    const { type, eventTitle, userEmail, userName, eventDate, eventLocation, price } = data;

    switch (type) {
      case 'inscription_confirmed':
        await sendInscriptionConfirmation({
          eventTitle,
          userEmail,
          userName,
          eventDate,
          eventLocation,
          price,
        });
        break;

      case 'payment_reminder':
        await sendPaymentReminder({
          eventTitle,
          userEmail,
          userName,
          price,
        });
        break;

      case 'event_reminder':
        await sendEventReminder({
          eventTitle,
          userEmail,
          userName,
          eventDate,
          eventLocation,
        });
        break;
    }

    return { success: true };
  }
);

async function sendInscriptionConfirmation(params: any) {
  const { eventTitle, userEmail, userName, eventDate, eventLocation, price } = params;

  // Send email
  const mailOptions = {
    from: 'CalyMob <noreply@calypso-diving.be>',
    to: userEmail,
    subject: `Inscription confirmée: ${eventTitle}`,
    html: `
      <h2>Inscription confirmée!</h2>
      <p>Bonjour ${userName},</p>
      <p>Votre inscription à <strong>${eventTitle}</strong> a bien été enregistrée.</p>

      <h3>Détails de l'événement:</h3>
      <ul>
        <li><strong>Date:</strong> ${eventDate}</li>
        <li><strong>Lieu:</strong> ${eventLocation}</li>
        <li><strong>Prix:</strong> €${price}</li>
      </ul>

      <h3>Instructions de paiement:</h3>
      <p>Merci d'effectuer le virement sur le compte suivant:</p>
      <ul>
        <li><strong>IBAN:</strong> BE12 3456 7890 1234</li>
        <li><strong>Communication:</strong> ${eventTitle} - ${userName}</li>
        <li><strong>Montant:</strong> €${price}</li>
      </ul>

      <p>Cordialement,<br>L'équipe Calypso</p>
    `,
  };

  await mailTransport.sendMail(mailOptions);

  // Send WhatsApp (if phone number available)
  // await sendWhatsApp({
  //   to: userPhone,
  //   message: `✅ Inscription confirmée!\n\n${eventTitle}\n📅 ${eventDate}\n📍 ${eventLocation}\n💶 €${price}\n\nPaiement: BE12 3456 7890 1234`,
  // });
}
```

---

## 📅 Week 5: Testing & Polish

### Day 16-18: Integration Testing

**Test Cases**:
1. ✅ VPdive events display correctly with orange badge
2. ✅ Caly events display correctly with green badge
3. ✅ Filter by source works
4. ✅ Registration form validation
5. ✅ Registration submission to Firestore
6. ✅ Email confirmation sent
7. ✅ Push notification received
8. ✅ Payment instructions displayed
9. ✅ User can view their registrations
10. ✅ User can unregister

### Day 19-20: UI Polish & Bug Fixes

**Checklist**:
- [ ] Dark mode support
- [ ] Loading states
- [ ] Error handling
- [ ] Empty states
- [ ] Pull to refresh
- [ ] Form field validation messages
- [ ] Accessibility labels
- [ ] Responsive layouts

---

## 📅 Week 6: Deployment

### Day 21-22: Beta Release

```bash
# Build for testing
flutter build ios --release
flutter build appbundle --release

# Deploy to TestFlight (iOS)
# Upload to Play Console (Android) - Internal Testing
```

### Day 23-25: User Testing & Feedback

**Beta Test Group**:
- 5 club members
- 2 administrators
- Test scenarios:
  - Register for VPdive event
  - Register for Caly event
  - Complete payment flow
  - Receive notifications

---

## 🎯 Success Metrics

### Week 1
- [x] Source badges visible
- [x] Filter working
- [x] VPdive events locked

### Week 2
- [ ] Full registration form
- [ ] Form validation
- [ ] Success screen

### Week 3-4
- [ ] Push notifications
- [ ] Email confirmations
- [ ] WhatsApp messages

### Week 5
- [ ] All tests passing
- [ ] UI polished
- [ ] Bug fixes complete

### Week 6
- [ ] Beta released
- [ ] User feedback positive
- [ ] Ready for production

---

## 🚀 Launch Checklist

### Pre-Launch
- [ ] All features tested
- [ ] Documentation updated
- [ ] Support team trained
- [ ] Rollback plan ready

### Launch Day
- [ ] Deploy to production
- [ ] Monitor error rates
- [ ] Check registration flow
- [ ] Verify notifications

### Post-Launch
- [ ] Monitor usage metrics
- [ ] Collect user feedback
- [ ] Fix critical issues
- [ ] Plan next iteration

---

## 📝 Notes

### Priority Order
1. **Critical**: Source differentiation (users need to know which events are which)
2. **High**: Enhanced registration (capture all necessary data)
3. **Medium**: Communication (nice to have but not blocking)
4. **Low**: Payment integration (can be manual initially)

### Risk Mitigation
- **Gradual rollout**: Start with read-only VPdive events
- **Feature flags**: Enable features progressively
- **Monitoring**: Track errors and performance
- **Support**: Have support channel ready

---

**Document Version**: 1.0
**Last Updated**: November 2025
**Next Review**: After Week 2 completion