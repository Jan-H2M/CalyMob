# 🛠️ VPDive → Caly Migration: Implementation Guide

**Purpose**: Step-by-step implementation guide for dual-system migration
**Timeline**: 16-20 weeks estimated
**Priority**: Enable CalyMob inscriptions while maintaining VPdive compatibility

---

## 📦 Phase 1: Database Schema Updates (Week 1)

### 1.1 Update Types Definition

```typescript
// src/types/index.ts

// Add migration-specific fields to Operation interface
export interface Operation {
  // ... existing fields ...

  // Migration tracking fields
  source?: 'vpdive' | 'caly' | 'manual';  // Data origin
  vpdiveId?: string;                       // Original VPdive ID if imported
  lastSyncedAt?: Date;                     // Last sync from VPdive
  migratedAt?: Date;                       // When converted to native
  isEditable?: boolean;                    // Can be modified in UI
  syncStatus?: 'pending' | 'synced' | 'error' | 'migrated';
  syncError?: string;                      // Error details if sync failed

  // Enhanced tracking
  importBatch?: string;                    // Group imports by batch ID
  importedBy?: string;                     // User who imported
  importedAt?: Date;                       // Import timestamp
}

// Add source tracking to ParticipantOperation
export interface ParticipantOperation {
  // ... existing fields ...

  source?: 'vpdive' | 'caly' | 'manual';
  isConfirmed?: boolean;                   // Email/SMS confirmation sent
  confirmationSentAt?: Date;
  registrationMethod?: 'web' | 'mobile' | 'import' | 'onsite';
}
```

### 1.2 Firestore Security Rules Update

```javascript
// firestore.rules

// Add source-based editing rules
match /clubs/{clubId}/operations/{operationId} {
  // Read access unchanged
  allow read: if isAuthenticated() &&
    (isMemberOfClub(clubId) || isAdmin());

  // Write access with source check
  allow create: if isAuthenticated() &&
    (isAdmin() || isValidateur()) &&
    incomingData().source in ['caly', 'manual'];

  // Update only if editable or admin
  allow update: if isAuthenticated() &&
    (isAdmin() ||
     (isValidateur() && existingData().isEditable != false));

  // Delete only native events
  allow delete: if isAuthenticated() &&
    isAdmin() &&
    existingData().source != 'vpdive';
}
```

### 1.3 Migration Script

```typescript
// scripts/migrate-operations-schema.ts

import { db } from '../src/lib/firebase-admin';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

async function migrateOperationsSchema() {
  console.log('Starting schema migration...');

  const clubId = 'calypso';
  const operationsRef = collection(db, 'clubs', clubId, 'operations');
  const snapshot = await getDocs(operationsRef);

  let migrated = 0;
  let errors = 0;

  for (const docSnap of snapshot.docs) {
    try {
      const data = docSnap.data();
      const updates: any = {};

      // Set source based on existing data
      if (data.vp_dive_source_hash) {
        updates.source = 'vpdive';
        updates.isEditable = false;
      } else {
        updates.source = 'caly';
        updates.isEditable = true;
      }

      // Set default sync status
      if (!data.syncStatus) {
        updates.syncStatus = 'synced';
      }

      await updateDoc(doc(db, 'clubs', clubId, 'operations', docSnap.id), updates);
      migrated++;

    } catch (error) {
      console.error(`Error migrating ${docSnap.id}:`, error);
      errors++;
    }
  }

  console.log(`Migration complete: ${migrated} success, ${errors} errors`);
}

// Run migration
migrateOperationsSchema().catch(console.error);
```

---

## 🎨 Phase 2: UI Updates for Dual System (Week 2)

### 2.1 Source Badge Component

```typescript
// src/components/operations/SourceBadge.tsx

import React from 'react';
import { FileSpreadsheet, Plus, Edit3, Lock } from 'lucide-react';

interface SourceBadgeProps {
  source?: 'vpdive' | 'caly' | 'manual';
  isEditable?: boolean;
  syncStatus?: string;
}

export function SourceBadge({ source, isEditable, syncStatus }: SourceBadgeProps) {
  if (!source) return null;

  const config = {
    vpdive: {
      label: 'VPDive Import',
      icon: FileSpreadsheet,
      bgColor: 'bg-orange-100 dark:bg-orange-900/20',
      textColor: 'text-orange-700 dark:text-orange-400',
      borderColor: 'border-orange-300 dark:border-orange-700'
    },
    caly: {
      label: 'Caly Native',
      icon: Plus,
      bgColor: 'bg-green-100 dark:bg-green-900/20',
      textColor: 'text-green-700 dark:text-green-400',
      borderColor: 'border-green-300 dark:border-green-700'
    },
    manual: {
      label: 'Saisie Manuelle',
      icon: Edit3,
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
      textColor: 'text-blue-700 dark:text-blue-400',
      borderColor: 'border-blue-300 dark:border-blue-700'
    }
  };

  const { label, icon: Icon, bgColor, textColor, borderColor } = config[source];

  return (
    <div className="flex items-center gap-2">
      <span
        className={`
          inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium
          border ${bgColor} ${textColor} ${borderColor}
        `}
      >
        <Icon className="h-3 w-3" />
        {label}
      </span>

      {!isEditable && (
        <span className="text-gray-400 dark:text-gray-500">
          <Lock className="h-3 w-3" />
        </span>
      )}

      {syncStatus === 'error' && (
        <span className="text-red-500 text-xs">Erreur sync</span>
      )}
    </div>
  );
}
```

### 2.2 Update Operations List

```typescript
// src/components/operations/OperationsPage.tsx (additions)

// Add source filter
const [filterSource, setFilterSource] = useState<string>('all');

// Update filter UI
<div className="flex gap-2">
  <select
    value={filterSource}
    onChange={(e) => setFilterSource(e.target.value)}
    className="px-3 py-2 border rounded-lg"
  >
    <option value="all">Toutes sources</option>
    <option value="vpdive">VPDive uniquement</option>
    <option value="caly">Caly uniquement</option>
    <option value="manual">Saisie manuelle</option>
  </select>
</div>

// Update operation card
<div className="operation-card">
  <div className="flex justify-between items-start">
    <h3>{operation.titre}</h3>
    <SourceBadge
      source={operation.source}
      isEditable={operation.isEditable}
      syncStatus={operation.syncStatus}
    />
  </div>

  {/* Disable edit for VPdive events */}
  {operation.source !== 'vpdive' && (
    <button onClick={() => handleEdit(operation)}>
      Modifier
    </button>
  )}
</div>
```

### 2.3 Migration Action for Admins

```typescript
// src/components/operations/MigrateEventButton.tsx

import React, { useState } from 'react';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';

interface MigrateEventButtonProps {
  operation: Operation;
  clubId: string;
  onSuccess?: () => void;
}

export function MigrateEventButton({
  operation,
  clubId,
  onSuccess
}: MigrateEventButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [migrating, setMigrating] = useState(false);

  if (operation.source !== 'vpdive') return null;

  const handleMigrate = async () => {
    setMigrating(true);

    try {
      const opRef = doc(db, 'clubs', clubId, 'operations', operation.id);

      await updateDoc(opRef, {
        source: 'caly',
        isEditable: true,
        migratedAt: new Date(),
        vpdiveId: operation.id,
        syncStatus: 'migrated'
      });

      toast.success('Événement migré vers Caly avec succès');
      onSuccess?.();

    } catch (error) {
      console.error('Migration error:', error);
      toast.error('Erreur lors de la migration');
    } finally {
      setMigrating(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="flex items-center gap-1 px-3 py-1 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
      >
        <ArrowRight className="h-4 w-4" />
        Migrer vers Caly
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-orange-500 flex-shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">
                  Confirmer la migration
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Cette action convertira l'événement VPDive en événement Caly natif.
                  L'événement deviendra modifiable et ne sera plus synchronisé avec VPDive.
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 border rounded-lg"
                disabled={migrating}
              >
                Annuler
              </button>
              <button
                onClick={handleMigrate}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg"
                disabled={migrating}
              >
                {migrating ? 'Migration...' : 'Confirmer migration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

---

## 📱 Phase 3: CalyMob Development (Weeks 3-10)

### 3.1 Initialize Flutter Project

```bash
# Create Flutter project if not exists
flutter create calycompta_mobile
cd calycompta_mobile

# Add required dependencies
flutter pub add firebase_core
flutter pub add cloud_firestore
flutter pub add firebase_auth
flutter pub add provider
flutter pub add intl
flutter pub add cached_network_image
flutter pub add qr_flutter
flutter pub add qr_code_scanner
flutter pub add flutter_local_notifications
flutter pub add url_launcher
```

### 3.2 Event List Screen

```dart
// lib/screens/events/event_list_screen.dart

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:provider/provider.dart';

class EventListScreen extends StatefulWidget {
  @override
  _EventListScreenState createState() => _EventListScreenState();
}

class _EventListScreenState extends State<EventListScreen> {
  String _sourceFilter = 'all';

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);

    return Scaffold(
      appBar: AppBar(
        title: Text('Événements'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) {
              setState(() {
                _sourceFilter = value;
              });
            },
            itemBuilder: (context) => [
              PopupMenuItem(value: 'all', child: Text('Tous')),
              PopupMenuItem(value: 'vpdive', child: Text('VPDive')),
              PopupMenuItem(value: 'caly', child: Text('Caly')),
            ],
          ),
        ],
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: _buildEventStream(auth.clubId),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return Center(child: CircularProgressIndicator());
          }

          final events = snapshot.data!.docs
              .map((doc) => Event.fromFirestore(doc))
              .where((event) => _filterBySource(event))
              .toList();

          return ListView.builder(
            itemCount: events.length,
            itemBuilder: (context, index) {
              final event = events[index];
              return EventCard(
                event: event,
                onTap: () => _navigateToDetail(event),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        child: Icon(Icons.add),
        onPressed: _createNativeEvent,
      ),
    );
  }

  Stream<QuerySnapshot> _buildEventStream(String clubId) {
    Query query = FirebaseFirestore.instance
        .collection('clubs')
        .doc(clubId)
        .collection('operations')
        .where('type', isEqualTo: 'evenement')
        .where('statut', whereIn: ['ouvert', 'ferme'])
        .orderBy('date_debut', descending: false);

    return query.snapshots();
  }

  bool _filterBySource(Event event) {
    if (_sourceFilter == 'all') return true;
    return event.source == _sourceFilter;
  }

  void _navigateToDetail(Event event) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => EventDetailScreen(event: event),
      ),
    );
  }

  void _createNativeEvent() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => CreateEventScreen(source: 'caly'),
      ),
    );
  }
}
```

### 3.3 Event Subscription Flow

```dart
// lib/screens/events/event_subscription_screen.dart

class EventSubscriptionScreen extends StatefulWidget {
  final Event event;

  EventSubscriptionScreen({required this.event});

  @override
  _EventSubscriptionScreenState createState() => _EventSubscriptionScreenState();
}

class _EventSubscriptionScreenState extends State<EventSubscriptionScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _isSubmitting = false;

  // Form fields
  String? _participantName;
  String? _email;
  String? _phone;
  String? _licenseNumber;
  String? _emergencyContact;
  String? _emergencyPhone;
  bool _acceptTerms = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Inscription: ${widget.event.titre}'),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: EdgeInsets.all(16),
          children: [
            // Event info card
            Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.event.titre,
                      style: Theme.of(context).textTheme.headline6,
                    ),
                    SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(Icons.calendar_today, size: 16),
                        SizedBox(width: 4),
                        Text(_formatDate(widget.event.dateDebut)),
                      ],
                    ),
                    Row(
                      children: [
                        Icon(Icons.location_on, size: 16),
                        SizedBox(width: 4),
                        Text(widget.event.lieu ?? 'À définir'),
                      ],
                    ),
                    Row(
                      children: [
                        Icon(Icons.euro, size: 16),
                        SizedBox(width: 4),
                        Text('${widget.event.prixMembre}€ (membre)'),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            SizedBox(height: 16),

            // Registration form
            TextFormField(
              decoration: InputDecoration(
                labelText: 'Nom complet *',
                prefixIcon: Icon(Icons.person),
              ),
              validator: (value) => value?.isEmpty ?? true
                  ? 'Nom requis'
                  : null,
              onSaved: (value) => _participantName = value,
            ),

            SizedBox(height: 12),

            TextFormField(
              decoration: InputDecoration(
                labelText: 'Email *',
                prefixIcon: Icon(Icons.email),
              ),
              keyboardType: TextInputType.emailAddress,
              validator: (value) {
                if (value?.isEmpty ?? true) return 'Email requis';
                if (!value!.contains('@')) return 'Email invalide';
                return null;
              },
              onSaved: (value) => _email = value,
            ),

            SizedBox(height: 12),

            TextFormField(
              decoration: InputDecoration(
                labelText: 'Téléphone *',
                prefixIcon: Icon(Icons.phone),
              ),
              keyboardType: TextInputType.phone,
              validator: (value) => value?.isEmpty ?? true
                  ? 'Téléphone requis'
                  : null,
              onSaved: (value) => _phone = value,
            ),

            SizedBox(height: 12),

            TextFormField(
              decoration: InputDecoration(
                labelText: 'Numéro LIFRAS',
                prefixIcon: Icon(Icons.badge),
                hintText: 'Ex: 54791',
              ),
              onSaved: (value) => _licenseNumber = value,
            ),

            SizedBox(height: 24),

            // Emergency contact section
            Text(
              'Contact d\'urgence',
              style: Theme.of(context).textTheme.subtitle1,
            ),

            SizedBox(height: 12),

            TextFormField(
              decoration: InputDecoration(
                labelText: 'Nom du contact',
                prefixIcon: Icon(Icons.contact_phone),
              ),
              onSaved: (value) => _emergencyContact = value,
            ),

            SizedBox(height: 12),

            TextFormField(
              decoration: InputDecoration(
                labelText: 'Téléphone du contact',
                prefixIcon: Icon(Icons.phone_in_talk),
              ),
              keyboardType: TextInputType.phone,
              onSaved: (value) => _emergencyPhone = value,
            ),

            SizedBox(height: 24),

            // Terms checkbox
            CheckboxListTile(
              value: _acceptTerms,
              onChanged: (value) {
                setState(() {
                  _acceptTerms = value ?? false;
                });
              },
              title: Text('J\'accepte les conditions'),
              subtitle: Text(
                'Je confirme mon inscription et m\'engage à payer le montant dû',
                style: TextStyle(fontSize: 12),
              ),
            ),

            SizedBox(height: 24),

            // Submit button
            ElevatedButton(
              onPressed: _acceptTerms && !_isSubmitting
                  ? _submitRegistration
                  : null,
              child: _isSubmitting
                  ? CircularProgressIndicator(color: Colors.white)
                  : Text('Confirmer l\'inscription'),
              style: ElevatedButton.styleFrom(
                minimumSize: Size(double.infinity, 48),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submitRegistration() async {
    if (!_formKey.currentState!.validate()) return;

    _formKey.currentState!.save();

    setState(() {
      _isSubmitting = true;
    });

    try {
      final auth = Provider.of<AuthProvider>(context, listen: false);

      // Create participant document
      final participantData = {
        'operation_id': widget.event.id,
        'operation_titre': widget.event.titre,
        'operation_type': 'evenement',
        'membre_nom': _participantName,
        'email': _email,
        'telephone': _phone,
        'numero_licence': _licenseNumber,
        'contact_urgence_nom': _emergencyContact,
        'contact_urgence_tel': _emergencyPhone,
        'prix': widget.event.prixMembre,
        'paye': false,
        'date_inscription': FieldValue.serverTimestamp(),
        'source': 'caly',
        'registrationMethod': 'mobile',
        'club_id': auth.clubId,
      };

      await FirebaseFirestore.instance
          .collection('clubs')
          .doc(auth.clubId)
          .collection('operation_participants')
          .add(participantData);

      // Send confirmation
      await _sendConfirmation();

      // Navigate to success screen
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (context) => RegistrationSuccessScreen(
            event: widget.event,
            participantName: _participantName!,
          ),
        ),
      );

    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erreur: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        _isSubmitting = false;
      });
    }
  }

  Future<void> _sendConfirmation() async {
    // TODO: Implement email/SMS confirmation
    // This would call your notification service
  }

  String _formatDate(DateTime date) {
    return DateFormat('dd/MM/yyyy').format(date);
  }
}
```

---

## 🔔 Phase 4: Communication System (Weeks 11-13)

### 4.1 Notification Service

```typescript
// functions/src/services/notificationService.ts

import * as admin from 'firebase-admin';
import { sendEmail } from './emailService';
import { sendWhatsApp } from './whatsappService';
import { sendPushNotification } from './pushService';

export interface NotificationPayload {
  type: 'event_created' | 'inscription_confirmed' | 'payment_received' | 'event_reminder';
  recipient: {
    email?: string;
    phone?: string;
    fcmToken?: string;
    userId?: string;
  };
  data: any;
}

export class NotificationService {
  static async send(payload: NotificationPayload) {
    const promises = [];

    // Email notification
    if (payload.recipient.email) {
      promises.push(
        this.sendEmailNotification(payload)
          .catch(err => console.error('Email failed:', err))
      );
    }

    // WhatsApp notification
    if (payload.recipient.phone) {
      promises.push(
        this.sendWhatsAppNotification(payload)
          .catch(err => console.error('WhatsApp failed:', err))
      );
    }

    // Push notification
    if (payload.recipient.fcmToken) {
      promises.push(
        this.sendPushNotification(payload)
          .catch(err => console.error('Push failed:', err))
      );
    }

    await Promise.all(promises);
  }

  private static async sendEmailNotification(payload: NotificationPayload) {
    const templates = {
      inscription_confirmed: {
        subject: 'Inscription confirmée: {{eventTitle}}',
        html: `
          <h2>Votre inscription est confirmée!</h2>
          <p>Bonjour {{participantName}},</p>
          <p>Votre inscription à <strong>{{eventTitle}}</strong> a bien été enregistrée.</p>
          <ul>
            <li>Date: {{eventDate}}</li>
            <li>Lieu: {{eventLocation}}</li>
            <li>Prix: {{price}}€</li>
          </ul>
          <p>Moyens de paiement:</p>
          <ul>
            <li>Virement: BE12 3456 7890 1234</li>
            <li>Communication: {{communication}}</li>
          </ul>
        `
      }
    };

    const template = templates[payload.type];
    if (!template) return;

    await sendEmail({
      to: payload.recipient.email!,
      subject: this.interpolate(template.subject, payload.data),
      html: this.interpolate(template.html, payload.data)
    });
  }

  private static async sendWhatsAppNotification(payload: NotificationPayload) {
    const messages = {
      inscription_confirmed: `
🎉 *Inscription confirmée!*

Événement: {{eventTitle}}
📅 Date: {{eventDate}}
📍 Lieu: {{eventLocation}}
💶 Prix: {{price}}€

Paiement par virement:
BE12 3456 7890 1234
Communication: {{communication}}
      `.trim()
    };

    const message = messages[payload.type];
    if (!message) return;

    await sendWhatsApp({
      to: payload.recipient.phone!,
      message: this.interpolate(message, payload.data)
    });
  }

  private static async sendPushNotification(payload: NotificationPayload) {
    const notifications = {
      inscription_confirmed: {
        title: 'Inscription confirmée',
        body: `Votre inscription à {{eventTitle}} est confirmée`,
        data: {
          type: 'inscription',
          eventId: payload.data.eventId
        }
      }
    };

    const notification = notifications[payload.type];
    if (!notification) return;

    await sendPushNotification({
      token: payload.recipient.fcmToken!,
      title: this.interpolate(notification.title, payload.data),
      body: this.interpolate(notification.body, payload.data),
      data: notification.data
    });
  }

  private static interpolate(template: string, data: any): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }
}
```

### 4.2 WhatsApp Integration

```typescript
// functions/src/services/whatsappService.ts

import axios from 'axios';

interface WhatsAppConfig {
  apiUrl: string;
  apiKey: string;
  senderId: string;
}

const config: WhatsAppConfig = {
  apiUrl: process.env.WHATSAPP_API_URL || '',
  apiKey: process.env.WHATSAPP_API_KEY || '',
  senderId: process.env.WHATSAPP_SENDER_ID || ''
};

export async function sendWhatsApp(params: {
  to: string;
  message: string;
  mediaUrl?: string;
}) {
  // Format Belgian phone number
  let phoneNumber = params.to.replace(/\s/g, '');
  if (phoneNumber.startsWith('0')) {
    phoneNumber = '+32' + phoneNumber.substring(1);
  }

  try {
    const response = await axios.post(
      `${config.apiUrl}/messages`,
      {
        from: config.senderId,
        to: phoneNumber,
        type: params.mediaUrl ? 'media' : 'text',
        text: {
          body: params.message
        },
        ...(params.mediaUrl && {
          media: {
            url: params.mediaUrl
          }
        })
      },
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('WhatsApp sent:', response.data);
    return response.data;

  } catch (error) {
    console.error('WhatsApp error:', error);
    throw error;
  }
}
```

---

## 🧪 Phase 5: Testing & Migration Tools (Weeks 14-15)

### 5.1 Migration Dashboard

```typescript
// src/components/admin/MigrationDashboard.tsx

import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell
} from 'recharts';

export function MigrationDashboard() {
  const [stats, setStats] = useState<MigrationStats | null>(null);
  const [migrationQueue, setMigrationQueue] = useState<Operation[]>([]);

  useEffect(() => {
    loadMigrationStats();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Dashboard Migration VPDive → Caly
      </h1>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Événements"
          value={stats?.totalEvents || 0}
          icon="calendar"
        />
        <StatCard
          title="VPDive"
          value={stats?.vpdiveEvents || 0}
          color="orange"
          icon="import"
        />
        <StatCard
          title="Caly Native"
          value={stats?.calyEvents || 0}
          color="green"
          icon="check"
        />
        <StatCard
          title="À Migrer"
          value={stats?.pendingMigration || 0}
          color="purple"
          icon="arrow-right"
        />
      </div>

      {/* Migration progress */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4">
          Progression Migration
        </h2>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className="bg-gradient-to-r from-orange-500 to-green-500 h-4 rounded-full transition-all duration-500"
            style={{ width: `${stats?.migrationProgress || 0}%` }}
          />
        </div>
        <p className="text-sm text-gray-600 mt-2">
          {stats?.migrationProgress || 0}% des événements migrés
        </p>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">
            Répartition par Source
          </h3>
          <PieChart width={300} height={300}>
            <Pie
              data={stats?.sourceDistribution}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
            >
              {stats?.sourceDistribution?.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">
            Inscriptions par Mois
          </h3>
          <BarChart width={400} height={300} data={stats?.monthlyInscriptions}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="vpdive" fill="#fb923c" name="VPDive" />
            <Bar dataKey="caly" fill="#10b981" name="Caly" />
          </BarChart>
        </div>
      </div>

      {/* Migration queue */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            File d'Attente Migration
          </h3>
          <button
            onClick={handleBatchMigration}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg"
          >
            Migrer Tout
          </button>
        </div>

        <div className="space-y-2">
          {migrationQueue.map(event => (
            <div key={event.id} className="flex justify-between items-center p-3 border rounded-lg">
              <div>
                <span className="font-medium">{event.titre}</span>
                <span className="text-sm text-gray-500 ml-2">
                  {formatDate(event.date_debut)}
                </span>
              </div>
              <button
                onClick={() => handleSingleMigration(event.id)}
                className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm"
              >
                Migrer
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 5.2 Data Integrity Checks

```typescript
// scripts/validate-migration.ts

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

async function validateMigration(): Promise<ValidationResult> {
  const result: ValidationResult = {
    passed: true,
    errors: [],
    warnings: []
  };

  // Check 1: All operations have source field
  const opsWithoutSource = await db
    .collection('operations')
    .where('source', '==', null)
    .get();

  if (!opsWithoutSource.empty) {
    result.errors.push(
      `${opsWithoutSource.size} operations without source field`
    );
    result.passed = false;
  }

  // Check 2: VPdive events are not editable
  const editableVpdive = await db
    .collection('operations')
    .where('source', '==', 'vpdive')
    .where('isEditable', '==', true)
    .get();

  if (!editableVpdive.empty) {
    result.warnings.push(
      `${editableVpdive.size} VPdive events marked as editable`
    );
  }

  // Check 3: No duplicate hashes
  const hashes = new Set<string>();
  const duplicates: string[] = [];

  const allOps = await db.collection('operations').get();
  allOps.forEach(doc => {
    const hash = doc.data().vp_dive_source_hash;
    if (hash) {
      if (hashes.has(hash)) {
        duplicates.push(hash);
      }
      hashes.add(hash);
    }
  });

  if (duplicates.length > 0) {
    result.errors.push(
      `${duplicates.length} duplicate source hashes found`
    );
    result.passed = false;
  }

  // Check 4: Participants have matching operations
  const orphanParticipants = await db
    .collection('operation_participants')
    .get();

  for (const participant of orphanParticipants.docs) {
    const opId = participant.data().operation_id;
    const opExists = await db
      .collection('operations')
      .doc(opId)
      .get();

    if (!opExists.exists) {
      result.errors.push(
        `Orphan participant ${participant.id} references missing operation ${opId}`
      );
      result.passed = false;
    }
  }

  return result;
}

// Run validation
validateMigration().then(result => {
  console.log('Validation Result:', result);
  if (!result.passed) {
    console.error('❌ Validation failed!');
    process.exit(1);
  } else {
    console.log('✅ Validation passed!');
  }
});
```

---

## 📊 Phase 6: Monitoring & Rollback (Week 16)

### 6.1 Migration Metrics

```typescript
// src/services/migrationMetrics.ts

export class MigrationMetrics {
  static async track(event: MigrationEvent) {
    await db.collection('migration_audit').add({
      timestamp: new Date(),
      event: event.type,
      data: event.data,
      userId: event.userId,
      result: event.result
    });
  }

  static async getMetrics(): Promise<Metrics> {
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const events = await db
      .collection('migration_audit')
      .where('timestamp', '>=', lastWeek)
      .get();

    return {
      totalMigrations: events.size,
      successRate: this.calculateSuccessRate(events),
      averageTime: this.calculateAverageTime(events),
      errorRate: this.calculateErrorRate(events)
    };
  }
}
```

### 6.2 Rollback Script

```typescript
// scripts/rollback-migration.ts

async function rollbackMigration(batchId: string) {
  console.log(`Starting rollback for batch ${batchId}...`);

  // Find all operations migrated in this batch
  const migratedOps = await db
    .collection('operations')
    .where('migrationBatch', '==', batchId)
    .get();

  console.log(`Found ${migratedOps.size} operations to rollback`);

  const batch = db.batch();

  migratedOps.forEach(doc => {
    const data = doc.data();

    // Revert to VPdive source
    batch.update(doc.ref, {
      source: 'vpdive',
      isEditable: false,
      migratedAt: null,
      migrationBatch: null,
      syncStatus: 'synced'
    });
  });

  await batch.commit();

  console.log('✅ Rollback completed');
}
```

---

## 🎯 Success Criteria & Go-Live Checklist

### Pre-Launch Checklist
- [ ] All schema migrations applied
- [ ] Security rules updated and tested
- [ ] CalyMob event module complete
- [ ] Communication system operational
- [ ] Migration dashboard accessible to admins
- [ ] Data validation passing
- [ ] Rollback procedures tested
- [ ] User documentation ready
- [ ] Support team trained

### Launch Day Checklist
- [ ] Database backup completed
- [ ] Feature flags enabled
- [ ] Monitoring dashboards open
- [ ] Support team on standby
- [ ] Communication templates ready
- [ ] Rollback script ready

### Post-Launch Monitoring (First Week)
- [ ] Error rate < 1%
- [ ] Page load times < 2s
- [ ] Successful inscriptions > 95%
- [ ] User feedback collected
- [ ] Performance metrics reviewed
- [ ] Issues documented and prioritized

---

## 📚 Additional Resources

- [Firebase Migration Guide](https://firebase.google.com/docs/firestore/manage-data/export-import)
- [Flutter Event Management](https://flutter.dev/docs)
- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
- [Testing Best Practices](https://testing.googleblog.com/)

---

**Implementation Guide Version**: 1.0
**Last Updated**: November 2025
**Next Review**: After Phase 1 completion