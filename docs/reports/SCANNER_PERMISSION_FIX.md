# Correction du Scanner de Documents - Gestion des Permissions Caméra

**Date**: 2 décembre 2025
**Statut**: Implémenté
**Fichiers modifiés**: `pubspec.yaml`, `lib/services/camera_permission_service.dart`, `lib/screens/expenses/create_expense_screen.dart`

---

## Problème Rencontré

### Symptôme
Lors de l'utilisation du bouton "Scanner un justificatif" dans l'écran de création de demande de remboursement, l'utilisateur voyait l'erreur :

```
Erreur lors du scan: Exception: Permission not granted
```

### Impact
- L'utilisateur ne pouvait pas scanner de documents
- Aucune indication sur comment résoudre le problème
- Pas de possibilité de réessayer ou d'aller dans les réglages

---

## Analyse de la Cause Racine

### Package utilisé
L'application utilise le package `cunning_document_scanner` (v1.3.1) qui intègre le scanner de documents natif iOS (VNDocumentCameraViewController) et Android (Google ML Kit).

### Mécanisme de permission
Le package gère les permissions caméra en interne via `permission_handler` :

```dart
// Code interne de cunning_document_scanner
Map<Permission, PermissionStatus> statuses = await [
  Permission.camera,
].request();

if (statuses.containsValue(PermissionStatus.denied) ||
    statuses.containsValue(PermissionStatus.permanentlyDenied)) {
  throw Exception("Permission not granted");  // ← Exception générique
}
```

### Problèmes identifiés

| Problème | Impact |
|----------|--------|
| Exception non typée | Impossible de distinguer refus temporaire vs permanent |
| Pas de pré-vérification | L'app découvre le problème trop tard |
| Message brut affiché | UX médiocre, pas d'aide pour l'utilisateur |
| Pas de redirection réglages | Utilisateur bloqué si permission refusée définitivement |

---

## Solution Implémentée

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    create_expense_screen.dart               │
│                                                             │
│   _scanDocument()                                           │
│        │                                                    │
│        ▼                                                    │
│   CameraPermissionService.handlePermissionWithDialog()      │
│        │                                                    │
│        ├── granted → CunningDocumentScanner.getPictures()   │
│        ├── denied → Dialog "Réessayer"                      │
│        ├── permanentlyDenied → Dialog "Ouvrir réglages"     │
│        └── restricted → Dialog informatif                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Nouveau Service: CameraPermissionService

**Fichier**: `lib/services/camera_permission_service.dart`

Ce service centralise la gestion des permissions caméra :

- `requestCameraPermission()` : Vérifie/demande la permission
- `handlePermissionWithDialog()` : Gère la permission avec dialogues UI
- `openSettings()` : Ouvre les réglages de l'app

### États de Permission Gérés

| État | Description | Action |
|------|-------------|--------|
| `granted` | Permission accordée | Lance le scanner |
| `denied` | Refusée (peut redemander) | Dialog avec bouton "Réessayer" |
| `permanentlyDenied` | Refusée définitivement | Dialog avec bouton "Ouvrir les réglages" |
| `restricted` | Bloquée (contrôle parental iOS) | Dialog informatif |

### Dialogues en Français

#### Permission refusée
```
┌────────────────────────────────────┐
│ 📷 Accès caméra requis             │
├────────────────────────────────────┤
│ Pour scanner vos justificatifs,    │
│ CalyMob a besoin d'accéder à       │
│ la caméra.                         │
├────────────────────────────────────┤
│         [Annuler]  [Réessayer]     │
└────────────────────────────────────┘
```

#### Permission bloquée
```
┌────────────────────────────────────┐
│ ⚙️ Accès caméra bloqué             │
├────────────────────────────────────┤
│ L'accès à la caméra a été refusé.  │
│ Pour scanner des documents,        │
│ activez la caméra dans les         │
│ réglages.                          │
│                                    │
│ 1. Ouvrir les réglages             │
│ 2. Activer "Caméra"                │
│ 3. Revenir dans l'app              │
├────────────────────────────────────┤
│    [Annuler]  [Ouvrir les réglages]│
└────────────────────────────────────┘
```

---

## Fichiers Modifiés

### 1. pubspec.yaml
```yaml
dependencies:
  permission_handler: ^12.0.1  # Ajouté
```

### 2. lib/services/camera_permission_service.dart
Nouveau fichier (~120 lignes) contenant le service de gestion des permissions.

### 3. lib/screens/expenses/create_expense_screen.dart
- Ajout import du service
- Modification de `_scanDocument()` pour vérifier les permissions avant d'appeler le scanner

---

## Guide de Test

### Prérequis
- Appareil physique iOS ou Android (le simulateur n'a pas de caméra)
- Permission caméra révoquée dans les réglages

### Scénarios de Test

#### Test 1: Première utilisation
1. Installer l'app sur un appareil neuf
2. Aller dans Remboursements > Nouvelle demande
3. Appuyer sur "Scanner un justificatif"
4. **Attendu**: Dialog système demandant la permission caméra
5. Accepter → Scanner s'ouvre

#### Test 2: Permission refusée
1. Refuser la permission caméra
2. Appuyer sur "Scanner un justificatif"
3. **Attendu**: Dialog "Accès caméra requis" avec bouton "Réessayer"
4. Appuyer "Réessayer" → Dialog système réapparaît

#### Test 3: Permission bloquée définitivement
1. Aller dans Réglages > CalyMob > Désactiver Caméra
2. Retourner dans l'app
3. Appuyer sur "Scanner un justificatif"
4. **Attendu**: Dialog "Accès caméra bloqué" avec bouton "Ouvrir les réglages"
5. Appuyer → Ouvre les réglages de l'app

#### Test 4: iOS Contrôle parental (si applicable)
1. Activer les restrictions caméra via Temps d'écran
2. Appuyer sur "Scanner un justificatif"
3. **Attendu**: Dialog "Accès restreint" informatif

---

## Considérations Techniques

### Dépendance permission_handler
Le package était déjà présent comme dépendance transitive via `cunning_document_scanner`. L'ajouter explicitement :
- Garantit la disponibilité de l'API
- Évite les conflits de version futurs
- Documente l'utilisation intentionnelle

### Compatibilité
- **iOS**: Minimum 15.5 (déjà configuré dans le projet)
- **Android**: Toutes versions supportées par Flutter

### Permissions Native Configurées
Les descriptions de permissions sont déjà présentes :

**iOS** (`ios/Runner/Info.plist`):
```xml
<key>NSCameraUsageDescription</key>
<string>CalyMob needs camera access to take photos of expense receipts.</string>
```

**Android** (`android/app/src/main/AndroidManifest.xml`):
```xml
<uses-permission android:name="android.permission.CAMERA"/>
```

---

## Réutilisabilité

Le service `CameraPermissionService` peut être réutilisé pour :
- Bouton "Photo" (actuellement géré par image_picker)
- Photo de profil
- Toute future fonctionnalité nécessitant la caméra

---

## Références

- [permission_handler package](https://pub.dev/packages/permission_handler)
- [cunning_document_scanner package](https://pub.dev/packages/cunning_document_scanner)
- [iOS VNDocumentCameraViewController](https://developer.apple.com/documentation/visionkit/vndocumentcameraviewcontroller)
