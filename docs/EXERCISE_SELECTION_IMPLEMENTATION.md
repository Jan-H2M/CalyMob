# Exercise Selection Implementation - LIFRAS Mobile App

**Date:** 2025-11-24
**Feature:** Exercise selection during event registration
**Platform:** Mobile only (Flutter/CalyMob)
**Status:** ✅ COMPLETE

---

## Table of Contents
1. [Feature Overview](#feature-overview)
2. [User Requirements](#user-requirements)
3. [Implementation Details](#implementation-details)
4. [Files Created](#files-created)
5. [Files Modified](#files-modified)
6. [User Flow](#user-flow)
7. [Testing Instructions](#testing-instructions)
8. [Technical Architecture](#technical-architecture)

---

## Feature Overview

This feature allows members to select LIFRAS (dive training) exercises when registering for an event in the mobile app. The selection is filtered based on the member's certification level, showing only exercises that match their exact niveau.

### Key Features
- ✅ Exercise selection during registration
- ✅ Automatic filtering by member's niveau (EXACT level only)
- ✅ Visual exercise badges in participant list
- ✅ Support for members without niveau
- ✅ Graceful handling when no exercises available

---

## User Requirements

Based on user input `1b2a3c4a`:

### 1. Selection Scope: **Members select during registration**
- When a member registers for an event, they select which exercises they want to do
- Organizers do NOT pre-select exercises (different from web app model)
- Each member can choose their own exercises

### 2. Filtering Logic: **EXACT level only**
- A P2 member sees ONLY P2 exercises (NOT NB exercises)
- A P4 member sees ONLY P4 exercises (NOT P2 or P3 exercises)
- Non-breveté (NB) members see ONLY NB exercises

This is restrictive but follows the requirement that divers can only do exercises AT their certification level.

### 3. Implementation: **Mobile only**
- Exercise selection implemented in mobile app
- Web app does NOT have this feature (may be added later)

### 4. UI Location: **During registration flow**
- Shows after user clicks "S'inscrire" button
- Before final confirmation dialog

---

## Implementation Details

### Phase 1: Data Models ✅

#### 1.1 Created: ExerciceLIFRAS Model
**File:** `/lib/models/exercice_lifras.dart`

```dart
enum NiveauLIFRAS {
  nb,  // Non Breveté
  p2,  // Plongeur 2★
  p3,  // Plongeur 3★
  p4,  // Plongeur 4★
  am,  // Assistant Moniteur
  mc,  // Moniteur Club
}

class ExerciceLIFRAS {
  final String id;
  final String code;             // Ex: "P2.RA", "AM.OP"
  final NiveauLIFRAS niveau;     // Required level
  final String description;
  final DateTime? createdAt;
  final DateTime? updatedAt;
}
```

**Key Methods:**
- `fromFirestore()` - Parse from Firestore document
- `toFirestore()` - Convert to Firestore map
- `displayName` - Formatted as "P2.RA - Remontée assistée 20 m"
- `NiveauLIFRASExtension.fromCode()` - Convert string to enum

#### 1.2 Updated: ParticipantOperation Model
**File:** `/lib/models/participant_operation.dart`

**Added field:**
```dart
final List<String>? exercicesLifras;  // Liste des IDs d'exercices
```

**Updated methods:**
- `fromFirestore()` - Parse exercices_lifras array
- `toFirestore()` - Include exercices_lifras in output

---

### Phase 2: Services ✅

#### 2.1 Created: LifrasService
**File:** `/lib/services/lifras_service.dart`

**Purpose:** Fetch and manage LIFRAS exercises from Firestore

**Firestore Path:**
```
clubs/{clubId}/exercices_lifras/{exerciceId}
```

**Methods:**
```dart
// Get all exercises for a club
Future<List<ExerciceLIFRAS>> getAllExercices(String clubId)

// Get exercises for EXACT niveau only
Future<List<ExerciceLIFRAS>> getExercicesByNiveau(String clubId, NiveauLIFRAS niveau)

// Get single exercise by ID
Future<ExerciceLIFRAS?> getExerciceById(String clubId, String exerciceId)

// Get multiple exercises by IDs (batched for Firestore 'in' limit)
Future<List<ExerciceLIFRAS>> getExercicesByIds(String clubId, List<String> exerciceIds)
```

**Key Feature:** `getExercicesByNiveau()` filters using Firestore query:
```dart
.where('niveau', isEqualTo: niveau.code)
```

This ensures ONLY exercises at the member's exact level are returned (not below).

#### 2.2 Created: MemberService
**File:** `/lib/services/member_service.dart`

**Purpose:** Fetch member information from Firestore

**Firestore Path:**
```
clubs/{clubId}/members/{memberId}
```

**Methods:**
```dart
// Get member's dive level (tries multiple field names)
Future<NiveauLIFRAS?> getMemberNiveau(String clubId, String memberId)

// Get complete member data
Future<Map<String, dynamic>?> getMemberData(String clubId, String memberId)
```

**Field Fallback Strategy:**
```dart
final niveauCode = data['niveau_plongee'] ??
                  data['diveLevel'] ??
                  data['niveau_plongeur'];
```

Handles different field names for backward compatibility.

#### 2.3 Updated: OperationService
**File:** `/lib/services/operation_service.dart`

**Changes:**

1. **Added parameter to `registerToOperation()`:**
```dart
Future<void> registerToOperation({
  required String clubId,
  required String operationId,
  required String userId,
  required String userName,
  required Operation operation,
  List<String>? exercicesLifras,  // ← NEW
}) async
```

2. **Pass exercises to ParticipantOperation:**
```dart
final participant = ParticipantOperation(
  // ... existing fields ...
  exercicesLifras: exercicesLifras,
);
```

3. **Enhanced debug logging:**
```dart
debugPrint('✅ Inscription réussie: ${docRef.id} → ${operation.titre}');
if (exercicesLifras != null && exercicesLifras.isNotEmpty) {
  debugPrint('📚 Avec ${exercicesLifras.length} exercice(s) LIFRAS');
}
```

---

### Phase 3: UI Components ✅

#### 3.1 Created: ExerciseSelectionDialog
**File:** `/lib/widgets/exercise_selection_dialog.dart`

**Purpose:** Modal dialog for selecting exercises

**Features:**
- Displays available exercises as checkboxes
- Shows member's niveau as colored badge
- Exercise code + description for each item
- Niveau badge (color-coded) for each exercise
- "Continue without exercises" option
- Shows count in submit button: "Valider (3)"
- Empty state message when no exercises available

**Color Coding:**
```dart
NB → Grey
P2 → Blue
P3 → Green
P4 → Orange
AM → Purple
MC → Red
```

**Props:**
```dart
final List<ExerciceLIFRAS> exercises;
final NiveauLIFRAS? memberNiveau;
final List<String> initialSelection;
```

**Return Value:** `List<String>?` (exercise IDs, or null if cancelled)

#### 3.2 Updated: OperationDetailScreen
**File:** `/lib/screens/operations/operation_detail_screen.dart`

**Changes:**

**1. Added imports:**
```dart
import '../../services/lifras_service.dart';
import '../../services/member_service.dart';
import '../../models/exercice_lifras.dart';
import '../../widgets/exercise_selection_dialog.dart';
```

**2. Completely rewrote `_handleRegister()` method:**

**New Flow:**
```
Step 1: Show loading dialog
Step 2: Fetch member's niveau from Firestore
Step 3: Fetch exercises for EXACT niveau only
Step 4: Close loading dialog
Step 5: Show exercise selection dialog (if exercises available)
Step 6: Handle "no niveau" case (show info message)
Step 7: Show registration confirmation (with exercise count)
Step 8: Register with selected exercises
Step 9: Show success message with exercise count
Step 10: Reload participants
```

**Key Code Sections:**

**Loading & Fetching:**
```dart
// Show loading
showDialog(
  context: context,
  barrierDismissible: false,
  builder: (context) => const Center(
    child: CircularProgressIndicator(),
  ),
);

// Fetch membre niveau
final memberService = MemberService();
final niveau = await memberService.getMemberNiveau(widget.clubId, userId);

// Fetch exercises (EXACT level only)
final lifrasService = LifrasService();
final availableExercises = niveau != null
    ? await lifrasService.getExercicesByNiveau(widget.clubId, niveau)
    : <ExerciceLIFRAS>[];
```

**Exercise Selection:**
```dart
if (availableExercises.isNotEmpty && mounted) {
  selectedExerciseIds = await showDialog<List<String>>(
    context: context,
    builder: (context) => ExerciseSelectionDialog(
      exercises: availableExercises,
      memberNiveau: niveau,
      initialSelection: const [],
    ),
  );

  // User cancelled
  if (selectedExerciseIds == null) return;
}
```

**No Niveau Handling:**
```dart
if (niveau == null && mounted) {
  await showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Information'),
      content: const Text(
        'Votre niveau de plongée n\'est pas défini.\n\n'
        'Vous pouvez vous inscrire sans exercices. '
        'Contactez un administrateur pour définir votre niveau.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('OK'),
        ),
      ],
    ),
  );
}
```

**Registration with Exercises:**
```dart
await operationProvider.registerToOperation(
  clubId: widget.clubId,
  operationId: widget.operationId,
  userId: userId,
  userName: userEmail,
  exercicesLifras: selectedExerciseIds,  // ← NEW
);
```

**Success Message:**
```dart
ScaffoldMessenger.of(context).showSnackBar(
  SnackBar(
    content: Text(
      selectedExerciseIds != null && selectedExerciseIds.isNotEmpty
          ? '✅ Inscription réussie avec ${selectedExerciseIds.length} exercice${selectedExerciseIds.length > 1 ? 's' : ''} !'
          : '✅ Inscription réussie !',
    ),
    backgroundColor: Colors.green,
  ),
);
```

**3. Updated `_buildParticipantsList()` - Display exercise badges:**

**Added to ListTile subtitle:**
```dart
subtitle: Column(
  crossAxisAlignment: CrossAxisAlignment.start,
  children: [
    Text(
      DateFormatter.formatShort(participant.dateInscription),
      style: TextStyle(fontSize: 12, color: Colors.grey[600]),
    ),
    if (participant.exercicesLifras != null &&
        participant.exercicesLifras!.isNotEmpty)
      Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Wrap(
          spacing: 4,
          runSpacing: 4,
          children: [
            // Show up to 3 exercise icons
            for (var i = 0; i < participant.exercicesLifras!.length && i < 3; i++)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: Colors.blue.shade200),
                ),
                child: Icon(
                  Icons.school,
                  size: 12,
                  color: Colors.blue.shade700,
                ),
              ),
            // Show "+N" badge if more than 3
            if (participant.exercicesLifras!.length > 3)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  '+${participant.exercicesLifras!.length - 3}',
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.grey.shade700,
                  ),
                ),
              ),
          ],
        ),
      ),
  ],
),
```

**Example Display:**
```
👤 Jan Andriessens
   23/11/2025
   🎓 🎓 +2        ← Shows 2 icons + "+2" badge (4 total exercises)
```

---

### Phase 4: Provider Updates ✅

#### Updated: OperationProvider
**File:** `/lib/providers/operation_provider.dart`

**Added parameter:**
```dart
Future<void> registerToOperation({
  required String clubId,
  required String operationId,
  required String userId,
  required String userName,
  List<String>? exercicesLifras,  // ← NEW
}) async {
  // ...
  await _operationService.registerToOperation(
    clubId: clubId,
    operationId: operationId,
    userId: userId,
    userName: userName,
    operation: operation,
    exercicesLifras: exercicesLifras,  // ← Pass through
  );
  // ...
}
```

---

## Files Created

### New Files (4 total)

1. **`/lib/models/exercice_lifras.dart`** (113 lines)
   - ExerciceLIFRAS model
   - NiveauLIFRAS enum with 6 levels
   - Extension methods for conversion and display

2. **`/lib/services/lifras_service.dart`** (108 lines)
   - Service for fetching LIFRAS exercises
   - Implements exact niveau filtering
   - Batch fetching for multiple exercise IDs

3. **`/lib/services/member_service.dart`** (61 lines)
   - Service for fetching member data
   - Get member's niveau with fallback logic
   - Field name compatibility handling

4. **`/lib/widgets/exercise_selection_dialog.dart`** (142 lines)
   - Modal dialog for exercise selection
   - Checkbox list with color-coded badges
   - Empty state handling

**Total new code:** ~424 lines

---

## Files Modified

### Updated Files (4 total)

1. **`/lib/models/participant_operation.dart`**
   - Added `exercicesLifras` field
   - Updated `fromFirestore()` parser
   - Updated `toFirestore()` serializer

2. **`/lib/services/operation_service.dart`**
   - Added `exercicesLifras` parameter to `registerToOperation()`
   - Pass exercises to ParticipantOperation
   - Enhanced debug logging

3. **`/lib/providers/operation_provider.dart`**
   - Added `exercicesLifras` parameter to `registerToOperation()`
   - Pass through to service layer

4. **`/lib/screens/operations/operation_detail_screen.dart`**
   - Added 4 new imports
   - Completely rewrote `_handleRegister()` method (164 lines)
   - Updated `_buildParticipantsList()` to show exercise badges
   - 10-step registration flow with exercise selection

**Total modified:** ~250 lines changed/added

---

## User Flow

### Scenario 1: Member WITH niveau, exercises available

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User opens event "Sortie Croisette TEST"                    │
│    └─ Sees: "S'inscrire" button                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. User taps "S'inscrire"                                      │
│    └─ Shows: Loading spinner                                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. System fetches:                                              │
│    • Member niveau from Firestore: P2                           │
│    • Available exercises for P2 (6 exercises)                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Shows: Exercise Selection Dialog                            │
│    ┌───────────────────────────────────────────────────────┐  │
│    │ Sélectionner vos exercices                            │  │
│    │ Votre niveau: Plongeur 2★                             │  │
│    ├───────────────────────────────────────────────────────┤  │
│    │ ☑ P2.SU1  [P2]                                        │  │
│    │   500 m tuba, tout équipé                             │  │
│    │                                                         │  │
│    │ □ P2.RA   [P2]                                        │  │
│    │   Remontée assistée 20 m                              │  │
│    │                                                         │  │
│    │ ☑ P2.REA  [P2]                                        │  │
│    │   Réanimation d'un plongeur                           │  │
│    │                                                         │  │
│    │ [Annuler]              [Valider (2)]                  │  │
│    └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. User selects 2 exercises, taps "Valider (2)"                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. Shows: Confirmation Dialog                                  │
│    ┌───────────────────────────────────────────────────────┐  │
│    │ Confirmer l'inscription                               │  │
│    │                                                         │  │
│    │ Voulez-vous vous inscrire à "Sortie Croisette TEST" ? │  │
│    │ Avec 2 exercices                                      │  │
│    │                                                         │  │
│    │ [Annuler]              [S'inscrire]                   │  │
│    └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. User taps "S'inscrire"                                      │
│    └─ System writes to Firestore:                              │
│       clubs/calypso/operations/{id}/inscriptions/{id}           │
│       {                                                         │
│         membre_id: "nvDVlhg...",                                │
│         membre_nom: "Andriessens",                              │
│         prix: 4.0,                                              │
│         exercices_lifras: ["ex1_id", "ex2_id"],                 │
│         ...                                                     │
│       }                                                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. Shows: Success Message                                      │
│    ✅ Inscription réussie avec 2 exercices !                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. Participant list updates:                                   │
│    👤 Jan Andriessens                                          │
│       23/11/2025                                                │
│       🎓 🎓                ← 2 exercise badges                  │
└─────────────────────────────────────────────────────────────────┘
```

### Scenario 2: Member WITHOUT niveau

```
1. User taps "S'inscrire"
2. Loading spinner
3. System finds: niveau_plongee = null
4. Shows: Information Dialog
   ┌──────────────────────────────────────────────────┐
   │ Information                                      │
   │                                                  │
   │ Votre niveau de plongée n'est pas défini.       │
   │                                                  │
   │ Vous pouvez vous inscrire sans exercices.       │
   │ Contactez un administrateur pour définir votre  │
   │ niveau.                                          │
   │                                                  │
   │ [OK]                                             │
   └──────────────────────────────────────────────────┘
5. User taps "OK"
6. Shows: Confirmation Dialog (no exercises mentioned)
7. Registration proceeds without exercises
8. exercices_lifras: []
```

### Scenario 3: Member with niveau, NO exercises in Firestore

```
1. User taps "S'inscrire"
2. Loading spinner
3. System finds: niveau = P3, but NO P3 exercises in Firestore
4. Skips exercise selection dialog (empty list)
5. Shows: Confirmation Dialog (no exercises mentioned)
6. Registration proceeds without exercises
7. exercices_lifras: []
```

---

## Testing Instructions

### Prerequisites
1. Firebase Firestore must have exercises data:
   - Collection: `clubs/calypso/exercices_lifras/`
   - Documents with: `code`, `niveau`, `description`
2. Member document must have `niveau_plongee` field set (e.g., "P2")

### Test Case 1: Happy Path
**Setup:**
- Member with `niveau_plongee: "P2"`
- At least 1 P2 exercise in Firestore

**Steps:**
1. Start app: `flutter run -d chrome`
2. Log in as member
3. Navigate to any event
4. Tap "S'inscrire"
5. Wait for loading spinner
6. Exercise selection dialog should appear
7. Select 2 exercises
8. Tap "Valider (2)"
9. Confirmation dialog shows "Avec 2 exercices"
10. Tap "S'inscrire"
11. Success message: "✅ Inscription réussie avec 2 exercices !"
12. Expand participant list
13. Your name shows 2 exercise badges: 🎓 🎓

**Expected Logs:**
```
🏊 Niveau membre nvDVlhg...: Plongeur 2★
📚 6 exercices LIFRAS pour niveau Plongeur 2★
✅ Inscription réussie: {docId} → Sortie Croisette TEST
📚 Avec 2 exercice(s) LIFRAS
```

### Test Case 2: No Niveau
**Setup:**
- Member WITHOUT `niveau_plongee` field

**Steps:**
1. Start app
2. Log in
3. Navigate to event
4. Tap "S'inscrire"
5. Info dialog appears: "Votre niveau de plongée n'est pas défini"
6. Tap "OK"
7. Confirmation dialog (no exercises mentioned)
8. Complete registration

**Expected Result:**
- Registration succeeds without exercises
- exercices_lifras: []

### Test Case 3: Cancel Exercise Selection
**Setup:**
- Member with niveau
- Exercises available

**Steps:**
1. Start registration
2. Exercise selection dialog appears
3. Tap "Annuler"
4. Registration cancelled (returns to event details)

**Expected Result:**
- No registration created
- User stays on event detail screen

### Test Case 4: Multiple Participants with Exercises
**Setup:**
- 3 members registered with different exercise counts

**Steps:**
1. Open event with participants
2. Expand participant list

**Expected Display:**
```
👤 Jan (2 exercises)     → 🎓 🎓
👤 Benjamin (1 exercise) → 🎓
👤 Bertrand (5 exercises) → 🎓 🎓 🎓 +2
```

### Test Case 5: Firestore Verification
**Setup:**
- Complete registration with 2 exercises

**Steps:**
1. Open Firestore console
2. Navigate to: `clubs/calypso/operations/{eventId}/inscriptions/`
3. Find your inscription document

**Expected Data:**
```json
{
  "membre_id": "nvDVlhg...",
  "membre_nom": "Andriessens",
  "membre_prenom": "Jan",
  "prix": 4,
  "paye": false,
  "date_inscription": "2025-11-24T...",
  "exercices_lifras": ["ex1_id", "ex2_id"],  ← VERIFY THIS
  "operation_id": "KUDYyeX7...",
  "evenement_id": "KUDYyeX7...",
  "created_at": "...",
  "updated_at": "..."
}
```

---

## Technical Architecture

### Data Flow Diagram

```
┌──────────────────┐
│   USER TAPS      │
│  "S'INSCRIRE"    │
└────────┬─────────┘
         │
         ↓
┌────────────────────────────────────────────────────┐
│ operation_detail_screen.dart: _handleRegister()   │
└────────┬───────────────────────────────────────────┘
         │
         ├─→ MemberService.getMemberNiveau()
         │   └─→ Firestore: clubs/{clubId}/members/{userId}
         │       └─→ Returns: NiveauLIFRAS (P2, P3, etc.)
         │
         ├─→ LifrasService.getExercicesByNiveau()
         │   └─→ Firestore: clubs/{clubId}/exercices_lifras
         │       WHERE niveau == membre.niveau
         │       └─→ Returns: List<ExerciceLIFRAS>
         │
         ├─→ ExerciseSelectionDialog (if exercises > 0)
         │   └─→ User selects exercises
         │       └─→ Returns: List<String> exerciseIds
         │
         ├─→ Confirmation Dialog
         │   └─→ User confirms
         │
         ├─→ OperationProvider.registerToOperation()
         │   └─→ OperationService.registerToOperation()
         │       └─→ ParticipantOperation(exercicesLifras: [ids])
         │           └─→ Firestore.add()
         │               └─→ clubs/{clubId}/operations/{opId}/inscriptions/
         │                   {
         │                     membre_id: "...",
         │                     exercices_lifras: ["id1", "id2"],
         │                     ...
         │                   }
         │
         └─→ Success: Reload participants
             └─→ _buildParticipantsList()
                 └─→ Display exercise badges 🎓
```

### Firestore Schema

#### Collection: `clubs/{clubId}/exercices_lifras/`

**Document Structure:**
```json
{
  "code": "P2.RA",
  "niveau": "P2",
  "description": "Remontée assistée 20 m",
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:00:00Z"
}
```

**Indexes:**
- `niveau` (for filtering by level)
- `code` (for ordering)

#### Collection: `clubs/{clubId}/operations/{operationId}/inscriptions/`

**Document Structure (updated):**
```json
{
  "membre_id": "nvDVlhglO1eGXPBVRd7NbJ2Uevn2",
  "membre_nom": "Andriessens",
  "membre_prenom": "Jan",
  "operation_id": "KUDYyeX7GaAKflYkDP06",
  "evenement_id": "KUDYyeX7GaAKflYkDP06",
  "operation_titre": "Sortie Croisette TEST",
  "evenement_titre": "Sortie Croisette TEST",
  "prix": 4.0,
  "paye": false,
  "date_inscription": "2025-11-23T18:30:00Z",
  "date_paiement": null,
  "exercices_lifras": [  ← NEW FIELD
    "ex1_id_abc123",
    "ex2_id_def456"
  ],
  "created_at": "2025-11-23T18:30:00Z",
  "updated_at": "2025-11-23T18:30:00Z"
}
```

#### Collection: `clubs/{clubId}/members/`

**Relevant Fields:**
```json
{
  "niveau_plongee": "P2",  // or "P3", "P4", "NB", "AM", "MC"
  "prenom": "Jan",
  "nom": "Andriessens",
  "email": "jan@example.com",
  ...
}
```

---

## Filtering Logic: EXACT Level Only

### Requirement
User specified: **"NO"** to question "Can a P3 diver do P2 exercises?"

This means: **Divers can ONLY do exercises AT their exact niveau**

### Implementation

**Service Layer:**
```dart
// lifras_service.dart
Future<List<ExerciceLIFRAS>> getExercicesByNiveau(
  String clubId,
  NiveauLIFRAS niveau,
) async {
  final snapshot = await _firestore
      .collection('clubs/$clubId/exercices_lifras')
      .where('niveau', isEqualTo: niveau.code)  // ← EXACT match only
      .orderBy('code')
      .get();

  return snapshot.docs
      .map((doc) => ExerciceLIFRAS.fromFirestore(doc))
      .toList();
}
```

**Firestore Query:**
```
WHERE niveau == "P2"  // NOT (niveau <= "P2")
```

### Examples

| Member Niveau | Exercises Shown | Count |
|---------------|-----------------|-------|
| NB (Non Breveté) | P1.PL2, P1.PL3, P1.PL4, P1.PL5 | 4 |
| P2 (Plongeur 2★) | P2.SU1, P2.RA, P2.REA, ... | 6 |
| P3 (Plongeur 3★) | P3.SU, P3.DP1, P3.DP2, ... | 6 |
| P4 (Plongeur 4★) | P4.RA, P4.PM1, P4.PM2, ... | 7 |
| AM (Assistant Moniteur) | AM.OP, AM.DB1, AM.SAU | 3 |
| MC (Moniteur Club) | MC.OP, MC.RP | 2 |

**Important:** A P4 member does NOT see P2 or P3 exercises. Only P4.

### Why This Design?

This is a strict interpretation where:
- Each niveau represents a specific certification/exam
- Exercises are designed FOR that specific niveau
- Lower exercises are "already mastered" at higher levels
- Members at P4 are testing P4-specific skills, not reviewing P2 basics

### Alternative Design (NOT implemented)

If we had chosen **"YES"** (higher levels can do lower exercises):

```dart
// NOT IMPLEMENTED - Just for reference
Future<List<ExerciceLIFRAS>> getExercicesByNiveau(
  String clubId,
  NiveauLIFRAS niveau,
) async {
  // Level hierarchy
  const levelHierarchy = ['NB', 'P2', 'P3', 'P4', 'AM', 'MC'];
  final memberIndex = levelHierarchy.indexOf(niveau.code);
  final allowedLevels = levelHierarchy.sublist(0, memberIndex + 1);

  final snapshot = await _firestore
      .collection('clubs/$clubId/exercices_lifras')
      .where('niveau', whereIn: allowedLevels)  // Multiple levels
      .orderBy('code')
      .get();

  return snapshot.docs.map((doc) => ExerciceLIFRAS.fromFirestore(doc)).toList();
}
```

This would allow P4 members to see: NB + P2 + P3 + P4 = 23 exercises total.

**But we did NOT implement this** because user requirement was **"NO"**.

---

## Edge Cases & Error Handling

### 1. Member without niveau
**Scenario:** `niveau_plongee` field is null or missing

**Handling:**
```dart
if (niveau == null && mounted) {
  await showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Information'),
      content: const Text(
        'Votre niveau de plongée n\'est pas défini.\n\n'
        'Vous pouvez vous inscrire sans exercices. '
        'Contactez un administrateur pour définir votre niveau.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('OK'),
        ),
      ],
    ),
  );
}
// Continue registration with exercicesLifras: []
```

### 2. No exercises in Firestore
**Scenario:** Exercise collection is empty or no exercises for membre's niveau

**Handling:**
```dart
final availableExercises = niveau != null
    ? await lifrasService.getExercicesByNiveau(widget.clubId, niveau)
    : <ExerciceLIFRAS>[];

if (availableExercises.isEmpty) {
  // Skip exercise selection dialog
  // Continue with exercicesLifras: []
}
```

Dialog shows:
```
Aucun exercice disponible pour votre niveau.

Contactez un administrateur pour ajouter des exercices LIFRAS.
```

### 3. User cancels exercise selection
**Scenario:** User opens dialog, then taps "Annuler"

**Handling:**
```dart
selectedExerciseIds = await showDialog<List<String>>(...);

if (selectedExerciseIds == null) {
  return;  // Exit registration flow
}
```

### 4. Firestore fetch errors
**Scenario:** Network error, permissions error

**Handling:**
```dart
try {
  // Fetch niveau and exercises
} catch (e) {
  if (mounted && Navigator.canPop(context)) {
    Navigator.pop(context);  // Close loading dialog
  }

  if (mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('❌ Erreur chargement exercices: $e'),
        backgroundColor: Colors.red,
      ),
    );
  }
  return;  // Exit registration flow
}
```

### 5. Invalid niveau code
**Scenario:** Firestore has niveau: "P5" (doesn't exist)

**Handling:**
```dart
// Extension method returns null for invalid codes
static NiveauLIFRAS? fromCode(String? code) {
  if (code == null) return null;
  switch (code.toUpperCase()) {
    case 'NB': return NiveauLIFRAS.nb;
    case 'P2': return NiveauLIFRAS.p2;
    // ...
    default: return null;  // ← Invalid code
  }
}

// Treated as "no niveau"
```

### 6. User selects 0 exercises
**Scenario:** User opens dialog, selects nothing, taps "Continuer sans exercices"

**Handling:**
```dart
ElevatedButton(
  onPressed: () {
    Navigator.pop(context, _selectedExerciseIds.toList());
  },
  child: Text(
    _selectedExerciseIds.isEmpty
        ? 'Continuer sans exercices'  // ← Button label changes
        : 'Valider (${_selectedExerciseIds.length})',
  ),
),

// Returns: []
// Confirmation dialog doesn't mention exercises
// Firestore: exercices_lifras: []
```

---

## Performance Considerations

### 1. Firestore Reads

**Per Registration:**
- 1 read: Get member document (for niveau)
- 1 read: Query exercises by niveau (might return 0-7 docs)
- 1 write: Create inscription document

**Total: 2 reads + 1 write**

**Optimization:** Member service could cache niveau in memory/local storage

### 2. Exercise List Size

**Max exercises per niveau:**
- NB: 4 exercises
- P2: 6 exercises
- P3: 6 exercises
- P4: 7 exercises (largest)
- AM: 3 exercises
- MC: 2 exercises

**UI Performance:** Even at max (7 exercises), the dialog renders instantly.

### 3. Participant List Display

**Current implementation:**
- Shows up to 3 exercise badges as icons
- Shows "+N" if more than 3
- No additional Firestore queries (exercise IDs stored, not details)

**Improvement (future):**
Could fetch exercise details for tooltip:
```dart
onTap: () {
  // Fetch and show exercise details
  showDialog(...);
}
```

### 4. Batched Fetching (for multiple exercise IDs)

**Implementation:**
```dart
Future<List<ExerciceLIFRAS>> getExercicesByIds(
  String clubId,
  List<String> exerciceIds,
) async {
  const batchSize = 10;  // Firestore 'whereIn' limit
  final exercices = <ExerciceLIFRAS>[];

  for (var i = 0; i < exerciceIds.length; i += batchSize) {
    final batch = exerciceIds.skip(i).take(batchSize).toList();
    final snapshot = await _firestore
        .collection('clubs/$clubId/exercices_lifras')
        .where(FieldPath.documentId, whereIn: batch)
        .get();
    exercices.addAll(snapshot.docs.map((doc) => ExerciceLIFRAS.fromFirestore(doc)));
  }

  return exercices;
}
```

**Why:** Firestore `whereIn` is limited to 10 items per query.

---

## Future Enhancements

### 1. Show Exercise Details in Participant List
**Current:** Shows badges 🎓 but no details

**Enhancement:** Tap badge → show exercise codes
```dart
onTap: () {
  showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: Text('Exercices de ${participant.membreNom}'),
      content: FutureBuilder<List<ExerciceLIFRAS>>(
        future: lifrasService.getExercicesByIds(
          widget.clubId,
          participant.exercicesLifras!,
        ),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return CircularProgressIndicator();
          return Column(
            children: snapshot.data!.map((ex) => ListTile(
              leading: Text(ex.code),
              title: Text(ex.description),
            )).toList(),
          );
        },
      ),
    ),
  );
}
```

### 2. Edit Exercises After Registration
**Current:** Once registered, exercises are fixed

**Enhancement:** Add "Modifier mes exercices" button
```dart
if (isRegistered && _userParticipation?.exercicesLifras != null)
  TextButton(
    onPressed: () => _editExercises(),
    child: const Text('Modifier mes exercices'),
  ),
```

### 3. Exercise Statistics
**Track:**
- Most selected exercises
- Completion rate (if tracking is added)
- Popular exercises by niveau

### 4. Exercise Prerequisites
**Example:** P3.DP2 requires P3.DP1 first

**Implementation:**
```dart
class ExerciceLIFRAS {
  final List<String>? prerequisiteIds;

  bool canSelect(List<String> alreadySelected) {
    if (prerequisiteIds == null) return true;
    return prerequisiteIds!.every((req) => alreadySelected.contains(req));
  }
}
```

### 5. Organizer View (Web App)
**Show:**
- Total exercises per event
- Which members are doing which exercises
- Plan dive groups by exercise

### 6. Allow Filtering: "At or Below" Level
**If requirements change:**

Add toggle in settings:
```dart
bool allowLowerLevelExercises = false;
```

Then modify `getExercicesByNiveau()` to use `whereIn` with level hierarchy.

### 7. Export Exercise Data
**For instructors:**
- CSV export of member → exercises
- Group members by exercise
- Print attendance sheets

---

## Troubleshooting

### Problem: Exercise dialog doesn't appear

**Possible causes:**
1. Member has no `niveau_plongee` field
   - Check: Firestore member document
   - Fix: Add `niveau_plongee: "P2"` field

2. No exercises in Firestore for that niveau
   - Check: Firestore `exercices_lifras` collection
   - Fix: Add exercises using web app settings

3. Network error during fetch
   - Check: Flutter logs for error messages
   - Look for: `❌ Erreur chargement exercices`

### Problem: Selected exercises not saved

**Possible causes:**
1. User cancelled dialog (returned null)
   - Check: Registration completed?
   - Expected: Should cancel and stay on event detail

2. Firestore write failed
   - Check: Flutter logs
   - Look for: `❌ Erreur inscription`

3. Field not included in `toFirestore()`
   - Check: `/lib/models/participant_operation.dart`
   - Verify: `'exercices_lifras': exercicesLifras,` line exists

### Problem: Exercise badges not showing

**Possible causes:**
1. Participant has no exercises
   - Check: Firestore inscription document
   - Verify: `exercices_lifras: []` or missing

2. UI rendering issue
   - Check: `_buildParticipantsList()` method
   - Verify: Conditional `if (participant.exercicesLifras != null ...)`

3. Model parsing failed
   - Check: `ParticipantOperation.fromFirestore()`
   - Add debug: `debugPrint('Parsed exercices: ${data['exercices_lifras']}');`

### Problem: Wrong niveau returned

**Possible causes:**
1. Field name mismatch
   - Check: Member document field name
   - Expected: `niveau_plongee`, `diveLevel`, or `niveau_plongeur`
   - Fix: Update field name or add to fallback list

2. Invalid niveau code
   - Check: Field value (must be: NB, P2, P3, P4, AM, MC)
   - Fix: Update member document

### Debug Logging

**Enable verbose logging:**
```dart
// In each service method
debugPrint('🏊 Niveau membre $memberId: ${niveau?.label ?? "Non défini"}');
debugPrint('📚 ${exercices.length} exercices LIFRAS chargés');
debugPrint('✅ Inscription réussie: ${docRef.id} → ${operation.titre}');
debugPrint('📚 Avec ${exercicesLifras.length} exercice(s) LIFRAS');
```

**Check Flutter console:**
```bash
flutter run -d chrome
# Look for:
# 🏊 Member niveau logs
# 📚 Exercise count logs
# ✅ Registration success logs
```

---

## Security & Permissions

### Firestore Rules (Recommended)

```javascript
// Read: All authenticated users can view exercises
match /exercices_lifras/{exerciceId} {
  allow read: if isAuthenticated();
  allow write: if hasRole(['admin', 'ca']);
}

// Read: All authenticated users can view member data (for niveau)
match /members/{memberId} {
  allow read: if isAuthenticated();
  allow write: if isAdmin() || request.auth.uid == memberId;
}

// Write: Users can register themselves with exercises
match /operations/{operationId}/inscriptions/{inscriptionId} {
  allow read: if isAuthenticated();

  // Create: User can register themselves
  allow create: if isAuthenticated() &&
                   request.resource.data.membre_id == request.auth.uid &&
                   isValidExerciseList(request.resource.data.exercices_lifras);

  // Delete: User can unregister themselves
  allow delete: if isAuthenticated() &&
                   resource.data.membre_id == request.auth.uid;
}

function isValidExerciseList(exerciseIds) {
  // Exercise IDs must be an array (empty is OK)
  return exerciseIds is list;
}
```

### Data Validation

**Client-side:**
- Verify exercise IDs are strings
- Limit max selection (optional)
- Verify niveau matches exercises (optional)

**Server-side (Cloud Functions - future):**
```javascript
// Validate inscription document
exports.validateInscription = functions.firestore
  .document('clubs/{clubId}/operations/{opId}/inscriptions/{inscId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();

    // Verify membre_id exists
    const membre = await admin.firestore()
      .doc(`clubs/${context.params.clubId}/members/${data.membre_id}`)
      .get();

    if (!membre.exists) {
      throw new Error('Membre non trouvé');
    }

    // Verify exercises match membre's niveau
    const niveau = membre.data().niveau_plongee;
    const exerciseIds = data.exercices_lifras || [];

    for (const exId of exerciseIds) {
      const exercise = await admin.firestore()
        .doc(`clubs/${context.params.clubId}/exercices_lifras/${exId}`)
        .get();

      if (!exercise.exists) {
        throw new Error(`Exercice ${exId} non trouvé`);
      }

      if (exercise.data().niveau !== niveau) {
        throw new Error(`Exercice ${exId} ne correspond pas au niveau ${niveau}`);
      }
    }
  });
```

---

## Testing Checklist

- [ ] **Test 1:** Member with P2 niveau, 6 P2 exercises available
  - [ ] Exercise dialog appears
  - [ ] Shows 6 P2 exercises only
  - [ ] Can select multiple
  - [ ] Confirmation shows count
  - [ ] Firestore saves IDs
  - [ ] Badges appear in participant list

- [ ] **Test 2:** Member with P4 niveau, 7 P4 exercises available
  - [ ] Dialog shows 7 P4 exercises ONLY (not P2 or P3)

- [ ] **Test 3:** Member without niveau
  - [ ] Info dialog appears
  - [ ] Can proceed without exercises
  - [ ] exercices_lifras: []

- [ ] **Test 4:** No exercises in Firestore
  - [ ] Dialog skipped
  - [ ] Registration succeeds
  - [ ] exercices_lifras: []

- [ ] **Test 5:** Cancel exercise selection
  - [ ] Dialog closes
  - [ ] Registration cancelled
  - [ ] No Firestore write

- [ ] **Test 6:** Select 0 exercises
  - [ ] Button says "Continuer sans exercices"
  - [ ] Registration succeeds
  - [ ] exercices_lifras: []

- [ ] **Test 7:** Select 10 exercises (if available)
  - [ ] All 10 saved
  - [ ] Participant list shows: 🎓 🎓 🎓 +7

- [ ] **Test 8:** Multiple participants with exercises
  - [ ] Each shows correct badge count
  - [ ] Badges display properly

- [ ] **Test 9:** Network error during fetch
  - [ ] Error message shown
  - [ ] Registration cancelled gracefully

- [ ] **Test 10:** Hot reload during development
  - [ ] Code changes reflected
  - [ ] No crashes

---

## Deployment Notes

### Before Deploying to Production

1. **Verify Firestore data:**
   - All exercises exist in `exercices_lifras` collection
   - All members have `niveau_plongee` field (or handle nulls gracefully)

2. **Update Firestore rules:**
   - Allow reading `exercices_lifras`
   - Allow reading `members` for niveau
   - Allow writing `inscriptions` with exercices_lifras field

3. **Test with real data:**
   - At least 1 member per niveau (NB, P2, P3, P4, AM, MC)
   - At least 3 exercises per niveau
   - Real event with registrations

4. **Performance check:**
   - Test with 50+ participants
   - Test with 10+ exercise selections
   - Verify no lag in UI

5. **User communication:**
   - Inform users about new exercise selection feature
   - Provide instructions on setting niveau
   - Explain exercise badges in participant list

### Rollback Plan

If issues occur:

1. **Quick fix:** Remove exercise selection dialog
   ```dart
   // Comment out exercise selection code
   // selectedExerciseIds = [];
   ```

2. **Data remains safe:**
   - Existing inscriptions with exercices_lifras are still valid
   - App ignores field if not used

3. **Revert code:**
   ```bash
   git revert <commit-hash>
   flutter clean
   flutter run -d chrome
   ```

---

## Documentation References

- **LIFRAS Exercise List:** `/docs/epreuves_mn_lifras_2025.md`
- **Session Summary:** `/docs/SESSION_SUMMARY_PARTICIPANT_LIST_AND_EXERCISES.md`
- **Firestore Schema:** (see Technical Architecture section above)

---

## Contributors

- **Implementation:** Claude (AI Assistant)
- **Requirements:** Jan (User)
- **Testing:** Pending user verification

---

## Changelog

**2025-11-24:**
- ✅ Initial implementation complete
- ✅ All 8 tasks completed
- ✅ App running successfully
- ⏳ Awaiting user testing and feedback

**Future versions:**
- Add exercise detail tooltips
- Add edit exercises after registration
- Add web app integration
- Add exercise statistics dashboard

---

**End of Document**