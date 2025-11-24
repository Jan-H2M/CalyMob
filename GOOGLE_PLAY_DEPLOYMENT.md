# Google Play Store Deployment Guide - CalyMob

**Status**: In Review Process
**Laatst bijgewerkt**: 14 november 2025
**App versie**: 1.0.4 (Build 6)

---

## ✅ Voltooide Stappen

### 1. Privacy Policy Setup
- **URL**: https://privacy.caly.club
- **Hosting**: GitHub Pages met custom domain (caly.club via Porkbun DNS)
- **Bestanden**:
  - `/docs/index.html` - Franse privacy policy
  - `/docs/CNAME` - Custom domain configuratie
- **DNS**: CNAME record `privacy.caly.club` → `jan-h2m.github.io`

### 2. App Store Listing

#### Basis Informatie
- **App naam**: CalyMob
- **Package name**: be.calypsodc.calymob
- **Categorie**: Zakelijk (Business)
- **Taal**: Frans (fr-FR)

#### Beschrijvingen
**Korte beschrijving** (63 karakters):
```
Application privée pour les membres du Calypso Diving Club
```

**Volledige beschrijving**:
```
CalyMob est une application privée réservée exclusivement aux membres du Calypso Diving Club.

Fonctionnalités :
• Soumettre des demandes de remboursement avec photos de reçus
• Suivre le statut de vos demandes (soumis, approuvé, refusé)
• Gérer vos dépenses liées aux activités du club
• Synchronisation en temps réel avec Firebase

⚠️ ACCÈS RESTREINT
Cette application nécessite un compte membre Calypso DC valide.

Pour toute question : jan.andriessens@gmail.com
```

#### Grafische Assets
- **App icoon**: 512x512 px - `/assets/icon-512x512.png`
- **Feature graphic**: 1024x500 px - `/assets/feature-graphic.png`

#### Screenshots
**Telefoon** (720x1280 px):
- `/assets/phone-screenshot-1.png`
- `/assets/phone-screenshot-2.png`
- Plus 2 additional (4 total)

**Tablet** (1080x1920 px):
- 7-inch & 10-inch screenshots uploaded

### 3. App Bundle Build

#### Keystore
- **Locatie**: `/android/calymob-release.keystore`
- **Alias**: calymob
- **Certificate**: CN=Calypso Diving Club
- **Geldig tot**: 2053

#### Build Commando's
```bash
flutter clean
flutter build appbundle --release
# Output: build/app/outputs/bundle/release/app-release.aab
```

### 4. App Content
- ✅ Privacy policy
- ✅ App-toegang
- ✅ Advertenties
- ✅ Content rating
- ✅ Doelgroep
- ✅ Store listing

---

## ⚠️ Openstaande Issue

### Ontbrekende Inloggegevens

**Oplossing A: Test Account (Aanbevolen)**
1. Maak test user in Firebase: `reviewer@calypsodc.test`
2. Verstrek credentials in Play Console

**Oplossing B: Restricted Access Declaratie**
- Verklaar dat app alleen voor club leden is

---

## 🚀 Volgende Stappen

1. Los login credentials issue op
2. Klik "13 wijzigingen sturen voor beoordeling"
3. Wacht op Google review (1-7 dagen)

---

**Contact**: jan.andriessens@gmail.com
