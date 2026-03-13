# CalyMob App Store Publicatie Plan

## Overzicht

Dit plan beschrijft alle stappen om CalyMob te publiceren in de Apple App Store en Google Play Store.

**Huidige status (februari 2026):**
- Apple Bundle ID: `be.calypsodc.calymob`
- Google Play Package: `club.caly.calymob`
- Versie: 1.0.22 (build 83/84)
- iOS minimum: 15.5
- Android target SDK: 34 (compileSdk 36)
- **iOS**: ✅ Ready for Distribution (Build 84)
- **Android**: ✅ Production op Google Play (calymob-1, Feb 2026)

**Account status:**
- [x] Apple Developer Account: **ACTIEF**
- [x] Google Play Developer Account: **ACTIEF**
- [x] Privacy Policy URL: **https://caly.club/privacy** ✅ ONLINE
- [x] Google Play Organisation Account: **H2M.AI** (Account ID: 4868133097597517725)

---

## ASSET LOCATIES (Snelle Referentie)

Alle marketing assets bevinden zich in: `CalyMob/assets/`

### App Iconen
| Bestand | Afmetingen | Gebruik |
|---------|------------|---------|
| `icon-1024x1024.png` | 1024x1024 | **iOS App Store** (vereist) |
| `icon-512x512.png` | 512x512 | **Google Play Store** |
| `icon.png` | 595x842 | Origineel/backup |

### Feature Graphic (Google Play)
| Bestand | Afmetingen | Status |
|---------|------------|--------|
| `feature-graphic.png` | 1024x500 | ✅ Klaar |

### Screenshots (Januari 2026)

**Locatie**: `CalyMob/assets/screenshots/`

| Bestand | Scherm | Gebruik |
|---------|--------|---------|
| `01-login.jpeg` | Login met Face ID | Beide stores |
| `02-home.jpeg` | Home dashboard | Beide stores |
| `03-evenements.jpeg` | Événements kalender | Beide stores |
| `04-communication.jpeg` | Announcements | Beide stores |
| `05-piscine-disponibilites.jpeg` | Piscine beschikbaarheid | Beide stores |
| `06-whoswho.jpeg` | Who's Who ledenlijst | Beide stores |
| `07-finances.jpeg` | Finances menu | Beide stores |
| `08-mes-demandes.jpeg` | Onkostendeclaraties | Beide stores |
| `09-mon-profil.jpeg` | Profiel met QR code | Beide stores |

**Oudere screenshots** (in `CalyMob/assets/`):
| Bestand | Type |
|---------|------|
| `phone-screenshot-1.png` | Phone |
| `phone-screenshot-2.png` | Phone |
| `tablet-7-screenshot-1.png` | Tablet 7" |
| `tablet-10-screenshot-1.png` | Tablet 10" |

### Vereiste Screenshot Formaten

**iOS App Store:**
- iPhone 6.9" (15 Pro Max): 1320 x 2868
- iPhone 6.7" (14 Pro Max): 1290 x 2796
- iPhone 6.5" (11 Pro Max): 1242 x 2688
- iPhone 5.5" (8 Plus): 1242 x 2208
- iPad Pro 12.9": 2048 x 2732

**Google Play:**
- Phone: min 320px, max 3840px (16:9 of 9:16)
- Tablet 7": 1024 x 500
- Tablet 10": 1024 x 500

### Hoe Screenshots te Maken

```bash
# Start iOS simulator
open -a Simulator

# Kies device: File > Open Simulator > iOS 17 > iPhone 15 Pro Max

# Run de app
cd CalyMob && flutter run -d "iPhone 15 Pro Max"

# Screenshot maken: Cmd+S (opslaat in ~/Desktop)
# Of: Device > Screenshot

# Verplaats naar assets folder
mv ~/Desktop/*.png CalyMob/assets/
```

---

## DEEL 1: VOORBEREIDINGEN (Voordat je begint)

### 1.1 Developer Accounts

#### Apple Developer Program
- [x] **Account**: ACTIEF - https://developer.apple.com/account

#### Google Play Developer Account
- [x] **Account**: ACTIEF - https://play.google.com/console

---

### 1.2 Benodigde Informatie Verzamelen

#### App Informatie (voor beide stores)
```
App Naam: CalyMob
Subtitel/Korte beschrijving: App voor Calypso Diving Club leden
Categorie: Lifestyle / Sports (iOS) of Social (Android)
Leeftijdsclassificatie: 4+ (geen mature content)
Website: https://calypsodc.be (of caly.club)
Support Email: contact@calypsodc.be
Privacy Policy URL: [MOET ONLINE STAAN - zie 1.3]
```

#### Developer/Organisatie Info
```
Ontwikkelaar Naam: Calypso Diving Club ASBL
Adres: [Club adres]
Telefoonnummer: [Contact telefoon]
Email: contact@calypsodc.be
```

---

### 1.3 Privacy Policy Online Zetten

**KRITIEK**: Beide stores vereisen een publiek toegankelijke privacy policy URL.

**Gekozen optie**: Host op `https://caly.club/privacy`

**Bestaande tekst**: [CalyMob/docs/PRIVACY_POLICY.md](CalyMob/docs/PRIVACY_POLICY.md) (Frans)

**Actie nodig**:
1. Converteer `PRIVACY_POLICY.md` naar HTML
2. Upload naar caly.club server/hosting
3. Zorg dat URL `https://caly.club/privacy` werkt
4. Test dat de pagina toegankelijk is zonder login

---

### 1.4 Marketing Materiaal Voorbereiden

#### App Icoon (AANWEZIG)
- [x] 1024x1024 px (iOS App Store) - `CalyMob/assets/icon-512x512.png` (moet 1024px worden)
- [x] 512x512 px (Google Play) - `CalyMob/assets/icon-512x512.png`
- **Let op**: Geen transparantie voor iOS, geen alpha channel

#### Screenshots VEREIST

**iOS App Store (per device type):**
| Device | Resolutie | Formaat |
|--------|-----------|---------|
| iPhone 6.9" (15 Pro Max) | 1320 x 2868 of 2868 x 1320 | PNG/JPEG |
| iPhone 6.7" (14 Pro Max) | 1290 x 2796 of 2796 x 1290 | PNG/JPEG |
| iPhone 6.5" (11 Pro Max) | 1242 x 2688 of 2688 x 1242 | PNG/JPEG |
| iPhone 5.5" (8 Plus) | 1242 x 2208 of 2208 x 1242 | PNG/JPEG |
| iPad Pro 12.9" | 2048 x 2732 of 2732 x 2048 | PNG/JPEG |

**Minimum: 2-10 screenshots per device type**

**Google Play Store:**
| Type | Resolutie | Formaat |
|------|-----------|---------|
| Phone | Min 320px, max 3840px, 16:9 of 9:16 | PNG/JPEG |
| Tablet 7" | 1024 x 500 (landscape) | PNG/JPEG |
| Tablet 10" | 1024 x 500 (landscape) | PNG/JPEG |

**Minimum: 2-8 screenshots**

**Bestaande screenshots** (moeten gecontroleerd worden op kwaliteit):
- `CalyMob/assets/phone-screenshot-1.png`
- `CalyMob/assets/phone-screenshot-2.png`
- `CalyMob/assets/screenshot-homepage-1080p.png`
- `CalyMob/assets/screenshot-login-1080p.png`
- `CalyMob/assets/tablet-7-screenshot-1.png`
- `CalyMob/assets/tablet-10-screenshot-1.png`

#### Feature Graphic (Google Play VEREIST)
- **Resolutie**: 1024 x 500 px
- **Bestand**: `CalyMob/assets/feature-graphic.png` (controleer dimensies)

#### Promotional Text
**App Store Beschrijving (max 4000 tekens):**
```
CalyMob - De officiële app voor leden van Calypso Diving Club

FUNCTIES:
• Bekijk en schrijf je in voor duikactiviteiten
• Beheer je onkostendeclaraties met foto's van bonnetjes
• Ontvang push notificaties voor clubnieuws
• Bekijk de ledenlijst en contacteer medeleden
• Zwembadsessies plannen en bijwonen
• Chat met je team en andere duikers

VEILIG & PRIVÉ:
• Beveiligde login met Face ID/Touch ID
• GDPR-compliant dataverwerking
• Geen advertenties; beperkte technische diagnostiek en notificatiegegevens voor werking en support

Exclusief voor leden van Calypso Diving Club.
```

**Korte beschrijving (max 80 tekens - Google Play):**
```
App voor leden van Calypso Diving Club
```

#### Keywords (iOS - max 100 tekens)
```
duikclub,diving,duiken,plongée,club,evenementen,onkosten,leden
```

---

## DEEL 2: iOS APP STORE PUBLICATIE

### 2.1 Apple Developer Account Configureren

#### Stap 1: Certificates & Provisioning
1. **Login**: https://developer.apple.com/account
2. **Certificates, Identifiers & Profiles** > **Identifiers**
3. **App ID aanmaken**:
   - Platform: iOS
   - Bundle ID: `be.calypsodc.calymob` (Explicit)
   - Capabilities aan te vinken:
     - [x] Push Notifications
     - [x] Associated Domains
     - [x] Sign In with Apple (indien gebruikt)

#### Stap 2: Distribution Certificate
1. **Certificates** > **+** > **Apple Distribution**
2. Genereer CSR via Keychain Access (Mac)
3. Upload CSR, download certificate
4. Dubbelklik om te installeren in Keychain

#### Stap 3: Provisioning Profile
1. **Profiles** > **+** > **App Store Connect**
2. Selecteer App ID: `be.calypsodc.calymob`
3. Selecteer Distribution Certificate
4. Download en dubbelklik om te installeren

---

### 2.2 App Store Connect Configureren

1. **Login**: https://appstoreconnect.apple.com
2. **Apps** > **+** > **New App**

**App Information:**
```
Platform: iOS
Name: CalyMob
Primary Language: French (België)
Bundle ID: be.calypsodc.calymob
SKU: calymob001
User Access: Full Access
```

3. **Vul in onder App Information:**
   - Subtitle: App voor Calypso Diving Club
   - Category: Lifestyle
   - Secondary Category: Sports
   - Content Rights: Does not contain third-party content
   - Age Rating: 4+ (vul vragenlijst in)

4. **Pricing and Availability:**
   - Price: Free
   - Availability: Belgium (of alle landen)

5. **App Privacy:**
   - Privacy Policy URL: [jouw gehoste URL]
   - Data Types: Selecteer wat van toepassing is:
     - Contact Info (Name, Email)
     - User Content (Photos - receipts)
     - Identifiers (User ID)
     - Usage Data (Product Interaction)

---

### 2.3 iOS App Builden

#### Via Xcode (Handmatig)
```bash
cd /Users/jan/Documents/GitHub/Calypso/CalyMob

# Dependencies ophalen
flutter pub get

# iOS dependencies
cd ios && pod install && cd ..

# Build voor App Store
flutter build ipa --release
```

**Output**: `build/ios/ipa/CalyMob.ipa`

#### Via Codemagic (Automatisch)
De `codemagic.yaml` is al geconfigureerd. Activeer de `ios-manual-build` workflow:
1. Login op https://codemagic.io
2. Verbind de GitHub repo
3. Configureer App Store Connect API key in Team Settings
4. Start manual build

---

### 2.4 iOS App Uploaden

#### Optie 1: Via Xcode
1. Open Xcode
2. **Window** > **Organizer**
3. Selecteer je archive
4. **Distribute App** > **App Store Connect** > **Upload**

#### Optie 2: Via Transporter App
1. Download Transporter uit Mac App Store
2. Sleep de .ipa file erin
3. Klik **Deliver**

#### Optie 3: Via xcrun (command line)
```bash
xcrun altool --upload-app --type ios \
  --file build/ios/ipa/CalyMob.ipa \
  --apiKey YOUR_API_KEY \
  --apiIssuer YOUR_ISSUER_ID
```

---

### 2.5 iOS Review Voorbereiden

#### Build in TestFlight (Eerst Testen!)
1. Na upload verschijnt build in App Store Connect
2. **TestFlight** tab > Build is "Processing" (kan 10-30 min duren)
3. Na processing: **Manage Compliance** > bevestig encryption (No)
4. Voeg interne testers toe
5. Test grondig voordat je submitten

#### Submit for Review
1. **App Store** tab > Selecteer versie
2. Vul alle velden in:
   - Version Information
   - Screenshots (alle device sizes)
   - Description
   - Keywords
   - Support URL
   - Marketing URL (optioneel)
3. **What's New**: "Eerste release van CalyMob voor Calypso Diving Club leden."
4. **Review Information:**
   - Demo Account: [test account credentials voor reviewer]
   - Contact Info: jan.andriessens@gmail.com
   - Notes: "This app is for members of Calypso Diving Club only."
5. Klik **Submit for Review**

#### Review Timeline
- Gemiddeld: 24-48 uur
- Eerste app: kan langer duren
- Rejection reasons worden per email meegedeeld

---

## DEEL 3: GOOGLE PLAY STORE PUBLICATIE

### 3.1 Google Play Console Configureren

1. **Login**: https://play.google.com/console
2. **Create app**

**App details:**
```
App name: CalyMob
Default language: French (France)
App or game: App
Free or paid: Free
```

3. **Vul Store listing in:**
   - Short description (80 chars)
   - Full description (4000 chars)
   - App icon (512x512)
   - Feature graphic (1024x500)
   - Screenshots (phone + tablet)

4. **App content:**
   - Privacy policy URL
   - Ads declaration: No ads
   - App access: Restricted access (members only)
   - Content ratings: Complete questionnaire (IARC)
   - Target audience: 18+ (duikclub)
   - News apps: No
   - COVID-19 contact tracing: No
   - Data safety: Vul in wat je verzamelt

---

### 3.2 Android App Bundle Builden

#### Signing Key (Al aanwezig)
- Keystore: `CalyMob/android/app/calymob-release.keystore`
- Key properties: `CalyMob/android/app/key.properties`

**BELANGRIJK**: Maak een backup van deze bestanden! Zonder keystore kun je geen updates pushen.

#### Build commando
```bash
cd /Users/jan/Documents/GitHub/Calypso/CalyMob

# Dependencies
flutter pub get

# Build App Bundle (NIET APK voor Play Store)
flutter build appbundle --release
```

**Output**: `build/app/outputs/bundle/release/app-release.aab`

#### Via bestaand script (moet aangepast worden)
Het huidige `scripts/build_release.sh` bouwt APK. Voor Play Store moet dit AAB zijn.

---

### 3.3 Android App Bundle Uploaden

1. **Play Console** > **Release** > **Production**
2. **Create new release**
3. **App signing**:
   - Kies: "Use Google Play App Signing" (aanbevolen)
   - Of: "Manage your own signing key"
4. Upload de `.aab` file
5. **Release name**: 1.0.22 (83)
6. **Release notes** (Frans):
   ```
   Première version de CalyMob pour les membres du Calypso Diving Club.

   Fonctionnalités:
   • Inscription aux activités de plongée
   • Gestion des notes de frais
   • Notifications push
   • Annuaire des membres
   • Sessions piscine
   ```

---

### 3.4 Google Play Review

#### Closed Testing (Eerst Testen!)
1. **Testing** > **Closed testing** > **Create track**
2. Voeg testers toe (email addresses)
3. Upload build
4. Roll out to testers
5. Testers krijgen opt-in link

#### Production Release
1. Nadat closed testing OK is
2. **Production** > **Create release**
3. Upload zelfde AAB (of nieuwe)
4. **Review release** > **Start rollout to Production**

#### Review Timeline
- Eerste app: 7+ dagen (strenge checks)
- Updates: 1-3 dagen
- Google kan om aanvullende info vragen

---

## DEEL 4: CHECKLIST VOOR GO-LIVE

### Pre-Launch Checklist

#### Accounts & Toegang
- [ ] Apple Developer Account actief
- [ ] Google Play Developer Account actief
- [ ] App Store Connect app aangemaakt
- [ ] Google Play Console app aangemaakt

#### Legal & Privacy
- [ ] Privacy Policy online (URL werkt)
- [ ] Terms of Service (optioneel maar aanbevolen)
- [ ] GDPR compliance gecontroleerd
- [ ] Age rating ingevuld (beide stores)

#### Marketing Assets
- [ ] App icoon 1024x1024 (iOS) en 512x512 (Android)
- [ ] Feature graphic 1024x500 (Android)
- [ ] Screenshots alle device formaten (iOS)
- [ ] Screenshots phone + tablet (Android)
- [ ] App beschrijving (kort en lang)
- [ ] Keywords/Tags

#### Technisch
- [ ] Apple Bundle ID correct: `be.calypsodc.calymob`
- [ ] Google Play Package correct: `club.caly.calymob`
- [ ] Version number verhoogd indien nodig
- [ ] Release build succesvol
- [ ] Geen debug code in release
- [ ] Firebase production config
- [ ] Push notifications werken
- [ ] Deep links werken
- [ ] EPC QR-code betalingen werken

#### Testing
- [ ] TestFlight build getest (iOS)
- [ ] Closed testing track getest (Android)
- [ ] Login flow werkt
- [ ] Onkosten indienen werkt
- [ ] Event registratie werkt
- [ ] Push notifications ontvangen

#### Review Information
- [ ] Demo account aangemaakt voor reviewers
- [ ] Review notes voorbereid
- [ ] Support email geconfigureerd
- [ ] Website/support URL klaar

---

## DEEL 5: BENODIGDE CREDENTIALS OVERZICHT

### Te Bewaren (VEILIG!)

| Item | Locatie | Backup Nodig |
|------|---------|--------------|
| Apple Developer credentials | Apple ID | Ja |
| iOS Distribution Certificate | Keychain + .p12 export | **KRITIEK** |
| iOS Provisioning Profile | Xcode/Developer Portal | Ja |
| App Store Connect API Key | Team Settings | Ja |
| Android Keystore | `android/app/calymob-release.keystore` | **KRITIEK** |
| Android Key Properties | `android/app/key.properties` | **KRITIEK** |
| Google Play Service Account | JSON file | Ja |
| Firebase configs | Repo (al aanwezig) | Git |

### Backup Commando's
```bash
# Backup Android signing
cp CalyMob/android/app/calymob-release.keystore ~/Backup/
cp CalyMob/android/app/key.properties ~/Backup/

# Export iOS certificate (via Keychain Access GUI)
# Keychain Access > My Certificates > Export als .p12
```

---

## DEEL 6: POST-LAUNCH

### Na Goedkeuring
1. Controleer app in beide stores
2. Test download en installatie
3. Monitor crash reports (Firebase Crashlytics)
4. Communiceer naar leden dat app beschikbaar is

### Ongoing Maintenance
- Houd dependencies up-to-date
- Reageer op user reviews
- Fix crashes snel
- Increment version bij elke update

### Update Process
1. Verhoog versie in `pubspec.yaml`
2. Build nieuwe release
3. Upload naar TestFlight / Closed Testing
4. Na test: promote naar Production
5. Schrijf release notes

---

## TIJDLIJN SCHATTING

| Fase | Duur |
|------|------|
| Developer accounts aanmaken | 1-3 dagen |
| Assets voorbereiden (screenshots, etc.) | 1-2 dagen |
| Privacy policy online zetten | 1 dag |
| iOS configuratie & build | 1 dag |
| Android configuratie & build | 1 dag |
| TestFlight testing | 2-3 dagen |
| Closed testing (Android) | 2-3 dagen |
| iOS App Review | 1-7 dagen |
| Google Play Review | 3-7 dagen |
| **Totaal** | **2-4 weken** |

---

## DEEL 7: KANT-EN-KLARE TEKSTEN (Copy-Paste)

Dit deel bevat alle teksten die je direct kunt kopiëren en plakken in de App Store en Play Store.

---

### 7.1 APP NAAM & SUBTITELS

**App Naam** (beide stores):
```
CalyMob
```

**Subtitel iOS** (max 30 tekens):
```
Calypso Diving Club
```

**Korte beschrijving Google Play** (max 80 tekens):
```
Application privée et sur invitation - Calypso Diving Club
```

---

### 7.2 VOLLEDIGE BESCHRIJVING

#### Frans (Primaire taal - voor beide stores)

**App Store / Google Play Beschrijving** (max 4000 tekens):

```
CalyMob - L'application officielle du Calypso Diving Club

Bienvenue dans CalyMob, votre compagnon numérique pour toutes les activités du Calypso Diving Club ! Cette application est exclusivement réservée aux membres du club.

🤿 ACTIVITÉS DE PLONGÉE
• Consultez le calendrier des sorties en mer et des activités
• Inscrivez-vous facilement aux plongées et événements
• Recevez des notifications pour les nouvelles activités
• Discutez avec les participants de chaque sortie
• Gérez vos invités pour les activités ouvertes

🏊 SESSIONS PISCINE
• Planifiez vos sessions d'entraînement à la piscine
• Consultez les thèmes et programmes des séances
• Confirmez votre présence en un clic
• Échangez avec les autres participants

💰 NOTES DE FRAIS
• Soumettez vos demandes de remboursement facilement
• Photographiez vos justificatifs directement depuis l'app
• Suivez le statut de vos demandes en temps réel
• Consultez l'historique de vos remboursements

👥 ANNUAIRE DES MEMBRES
• Trouvez facilement les coordonnées des autres membres
• Consultez les niveaux de plongée de chacun
• Contactez directement vos coéquipiers

📢 COMMUNICATIONS
• Recevez les annonces importantes du club
• Participez aux discussions d'équipe
• Restez informé des actualités du club

🔐 SÉCURITÉ & CONFIDENTIALITÉ
• Connexion sécurisée avec authentification biométrique (Face ID / Touch ID)
• Vos données sont protégées et hébergées en Europe
• Conforme au RGPD (Règlement Général sur la Protection des Données)
• Aucune publicité; des données techniques limitées sont utilisées pour le diagnostic, les notifications et le support

📱 FONCTIONNALITÉS PRATIQUES
• Interface intuitive et moderne
• Notifications push personnalisables
• Synchronisation en temps réel
• Fonctionne hors ligne pour les informations essentielles

Cette application est réservée aux membres du Calypso Diving Club ASBL (Belgique). Pour devenir membre, visitez notre site web ou contactez-nous.

Développé avec ❤️ pour la communauté des plongeurs du Calypso Diving Club.
```

#### Nederlands (Secundaire taal - optioneel)

```
CalyMob - De officiële app van Calypso Diving Club

Welkom bij CalyMob, jouw digitale partner voor alle activiteiten van de Calypso Diving Club! Deze app is exclusief voor clubleden.

🤿 DUIKACTIVITEITEN
• Bekijk de kalender met zeeduiken en activiteiten
• Schrijf je eenvoudig in voor duiken en evenementen
• Ontvang meldingen voor nieuwe activiteiten
• Chat met deelnemers van elke uitstap
• Beheer je gasten voor open activiteiten

🏊 ZWEMBADSESSIES
• Plan je trainingssessies in het zwembad
• Bekijk de thema's en programma's
• Bevestig je aanwezigheid met één klik
• Communiceer met andere deelnemers

💰 ONKOSTENDECLARATIES
• Dien eenvoudig terugbetalingsverzoeken in
• Fotografeer je bonnetjes rechtstreeks vanuit de app
• Volg de status van je aanvragen in realtime
• Bekijk je terugbetalingsgeschiedenis

👥 LEDENLIJST
• Vind makkelijk contactgegevens van andere leden
• Bekijk ieders duikniveau
• Contacteer je teamgenoten rechtstreeks

🔐 VEILIGHEID & PRIVACY
• Beveiligde login met biometrische authenticatie (Face ID / Touch ID)
• Je gegevens worden beschermd en gehost in Europa
• GDPR-conform
• Geen advertenties; beperkte technische diagnostiek en notificatiegegevens voor werking en support

Deze app is voorbehouden aan leden van Calypso Diving Club ASBL (België).
```

---

### 7.3 KEYWORDS / TAGS

**iOS Keywords** (max 100 tekens, komma gescheiden):
```
gestion des dépenses,club de plongée,finances d'équipe,partage des frais,gestion budgétaire
```

**Google Play Tags** (selecteer uit beschikbare categorieën):
- Sports
- Lifestyle
- Social
- Scuba Diving
- Club Management

---

### 7.4 WHAT'S NEW / RELEASE NOTES

#### Eerste Release (v1.0.11)

**Frans**:
```
Bienvenue dans CalyMob ! 🤿

Première version officielle de l'application mobile du Calypso Diving Club.

Fonctionnalités incluses :
• Inscription aux activités de plongée et événements
• Gestion des sessions piscine
• Soumission et suivi des notes de frais
• Annuaire des membres "Who's Who"
• Notifications push pour les actualités du club
• Authentification biométrique sécurisée
• Chat et discussions par activité

Bonne plongée ! 🐠
```

**Nederlands**:
```
Welkom bij CalyMob! 🤿

Eerste officiële versie van de mobiele app van Calypso Diving Club.

Beschikbare functies:
• Inschrijven voor duikactiviteiten en evenementen
• Beheer van zwembadsessies
• Indienen en opvolgen van onkostendeclaraties
• Ledenlijst "Who's Who"
• Push notificaties voor clubnieuws
• Beveiligde biometrische login
• Chat en discussies per activiteit

Goede duik! 🐠
```

---

### 7.5 SUPPORT & CONTACT INFORMATIE

**Support URL**:
```
https://calypsodiving.be/
```

**Support Email**:
```
contact@calypsodc.be
```

**Privacy Policy URL**:
```
https://caly.club/privacy
```

**Marketing URL** (optioneel):
```
https://calypsodc.be
```

---

### 7.6 APP STORE REVIEW NOTES

**Notes for App Review Team** (Engels - voor Apple reviewers):

```
This is a private club management app exclusively for members of Calypso Diving Club, a scuba diving club based in Belgium.

ACCESS INFORMATION:
- This app requires a pre-registered account
- Only existing club members can log in
- New users cannot register through the app

DEMO ACCOUNT FOR TESTING:
Email: demo.reviewer@calypsodc.be
Password: CalyMob2025!

KEY FEATURES TO TEST:
1. Login with demo account
2. View upcoming diving activities (Operations tab)
3. View pool sessions (Piscine tab)
4. Browse member directory (Who's Who)
5. Submit an expense claim (Dépenses tab)

PAYMENT INFORMATION:
- The app includes a payment feature for activity fees
- Payments use EPC QR codes (European Payments Council standard)
- Members scan the QR code with their own bank app to pay
- Compatible with all European banking apps (ING, KBC, Belfius, BNP, etc.)
- This is NOT an in-app purchase - it's for real-world club activities
- No third-party payment processor - direct bank-to-bank transfers
- No payment data is stored in the app

RESTRICTED ACCESS:
The app is intentionally restricted to club members only. This is similar to corporate internal apps or private organization apps.

Contact for questions: jan.andriessens@gmail.com
```

---

### 7.7 GOOGLE PLAY DATA SAFETY - COMPLETE VRAGENLIJST

#### Sectie 1: Data Collection and Security

| Vraag | Antwoord CalyMob | Uitleg |
|-------|------------------|--------|
| Does your app collect or share any of the required user data types? | **Yes** | We verzamelen naam, email, foto's |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | Firebase gebruikt HTTPS/TLS |
| Do you provide a way for users to request that their data be deleted? | **Yes** | Via contact@calypsodc.be of account verwijderen |

#### Sectie 2: Data Types - Welke data verzamel je?

**Location**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| Approximate location | **No** | No |
| Precise location | **No** | No |

**Personal info**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| Name | **Yes** | No |
| Email address | **Yes** | No |
| User IDs | **Yes** | No |
| Address | No | No |
| Phone number | **Yes** (optional) | No |
| Race and ethnicity | No | No |
| Political or religious beliefs | No | No |
| Sexual orientation | No | No |
| Other info | No | No |

**Financial info**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| User payment info | **No** | No |
| Purchase history | **No** | No |
| Credit score | No | No |
| Other financial info | No | No |

*Uitleg: Betalingen verlopen via EPC QR-codes die met de bank app van de gebruiker worden gescand. Geen betaalgegevens worden in de app opgeslagen.*

**Health and fitness**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| Health info | No | No |
| Fitness info | No | No |

**Messages**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| Emails | No | No |
| SMS or MMS | No | No |
| Other in-app messages | **Yes** | No |

*Uitleg: Chat berichten in activiteiten/teams worden opgeslagen*

**Photos and videos**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| Photos | **Yes** | No |
| Videos | No | No |

*Uitleg: Profielfoto's en bonnetjes voor onkosten*

**Audio files**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| Voice or sound recordings | No | No |
| Music files | No | No |
| Other audio files | No | No |

**Files and docs**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| Files and docs | No | No |

**Calendar**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| Calendar events | No | No |

**Contacts**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| Contacts | No | No |

**App activity**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| App interactions | **Yes** | No |
| In-app search history | No | No |
| Installed apps | No | No |
| Other user-generated content | **Yes** | No |
| Other actions | No | No |

**Web browsing**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| Web browsing history | No | No |

**App info and performance**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| Crash logs | **Yes** | No |
| Diagnostics | **Yes** | No |
| Other app performance data | No | No |

**Device or other IDs**
| Data Type | Collected? | Shared? |
|-----------|------------|---------|
| Device or other IDs | **Yes** | No |

*Uitleg: Firebase Authentication device ID voor push notifications*

#### Sectie 3: Data Usage - Per data type invullen

**Voor Name, Email, Phone number, User IDs:**
| Vraag | Antwoord |
|-------|----------|
| Is this data collected, shared, or both? | **Collected** |
| Is this data processed ephemerally? | **No** |
| Is this data required for your app, or can users choose whether it's collected? | **Required** (Name, Email, User ID) / **Optional** (Phone) |
| Why is this user data collected? | **App functionality** |

**Voor Photos:**
| Vraag | Antwoord |
|-------|----------|
| Is this data collected, shared, or both? | **Collected** |
| Is this data processed ephemerally? | **No** |
| Is this data required for your app, or can users choose whether it's collected? | **Optional** |
| Why is this user data collected? | **App functionality** |

**Voor In-app messages:**
| Vraag | Antwoord |
|-------|----------|
| Is this data collected, shared, or both? | **Collected** |
| Is this data processed ephemerally? | **No** |
| Is this data required for your app, or can users choose whether it's collected? | **Optional** |
| Why is this user data collected? | **App functionality** |

**Voor Crash logs, Diagnostics:**
| Vraag | Antwoord |
|-------|----------|
| Is this data collected, shared, or both? | **Collected** |
| Is this data processed ephemerally? | **No** |
| Is this data required for your app, or can users choose whether it's collected? | **Required** |
| Why is this user data collected? | **Analytics** |

**Voor Device IDs:**
| Vraag | Antwoord |
|-------|----------|
| Is this data collected, shared, or both? | **Collected** |
| Is this data processed ephemerally? | **No** |
| Is this data required for your app, or can users choose whether it's collected? | **Required** |
| Why is this user data collected? | **App functionality** (push notifications) |

---

### 7.8 iOS APP PRIVACY LABELS - COMPLETE VRAGENLIJST

Apple vraagt per data type 3 vragen:
1. **Purpose**: Waarvoor gebruik je deze data?
2. **Linked to User**: Is deze data gekoppeld aan de gebruiker?
3. **Tracking**: Wordt deze data gebruikt voor tracking?

Opmerking: in App Store-termen blijft het antwoord op tracking **No** zolang data niet wordt gebruikt voor cross-app advertising of profiling. Diagnostiek, crash reporting en productanalytics voor werking en support kunnen wel nog aanwezig zijn.

#### Stap 1: Do you or your third-party partners collect data from this app?
**Antwoord: Yes**

#### Stap 2: Selecteer welke data types je verzamelt

| Categorie | Data Type | Verzamelen? |
|-----------|-----------|-------------|
| **Contact Info** | Name | **Yes** |
| | Email Address | **Yes** |
| | Phone Number | **Yes** |
| | Physical Address | No |
| | Other User Contact Info | No |
| **Health & Fitness** | Health | No |
| | Fitness | No |
| **Financial Info** | Payment Info | No |
| | Credit Info | No |
| | Other Financial Info | No |
| **Location** | Precise Location | No |
| | Coarse Location | No |
| **Sensitive Info** | Sensitive Info | No |
| **Contacts** | Contacts | No |
| **User Content** | Emails or Text Messages | No |
| | Photos or Videos | **Yes** |
| | Audio Data | No |
| | Gameplay Content | No |
| | Customer Support | No |
| | Other User Content | **Yes** (chat messages) |
| **Browsing History** | Browsing History | No |
| **Search History** | Search History | No |
| **Identifiers** | User ID | **Yes** |
| | Device ID | **Yes** |
| **Purchases** | Purchase History | No |
| **Usage Data** | Product Interaction | **Yes** |
| | Advertising Data | No |
| | Other Usage Data | No |
| **Diagnostics** | Crash Data | **Yes** |
| | Performance Data | **Yes** |
| | Other Diagnostic Data | No |
| **Surroundings** | Environment Scanning | No |
| **Body** | Hands | No |
| | Head | No |

#### Stap 3: Per data type de detail vragen invullen

**NAME**
| Vraag | Antwoord |
|-------|----------|
| How is this data used? | **App Functionality** |
| Is this data linked to the user's identity? | **Yes** |
| Is this data used for tracking? | **No** |

**EMAIL ADDRESS**
| Vraag | Antwoord |
|-------|----------|
| How is this data used? | **App Functionality** |
| Is this data linked to the user's identity? | **Yes** |
| Is this data used for tracking? | **No** |

**PHONE NUMBER**
| Vraag | Antwoord |
|-------|----------|
| How is this data used? | **App Functionality** |
| Is this data linked to the user's identity? | **Yes** |
| Is this data used for tracking? | **No** |

**PHOTOS OR VIDEOS**
| Vraag | Antwoord |
|-------|----------|
| How is this data used? | **App Functionality** |
| Is this data linked to the user's identity? | **Yes** |
| Is this data used for tracking? | **No** |

**OTHER USER CONTENT** (chat messages)
| Vraag | Antwoord |
|-------|----------|
| How is this data used? | **App Functionality** |
| Is this data linked to the user's identity? | **Yes** |
| Is this data used for tracking? | **No** |

**USER ID**
| Vraag | Antwoord |
|-------|----------|
| How is this data used? | **App Functionality** |
| Is this data linked to the user's identity? | **Yes** |
| Is this data used for tracking? | **No** |

**DEVICE ID**
| Vraag | Antwoord |
|-------|----------|
| How is this data used? | **App Functionality** (push notifications) |
| Is this data linked to the user's identity? | **Yes** |
| Is this data used for tracking? | **No** |

**PRODUCT INTERACTION**
| Vraag | Antwoord |
|-------|----------|
| How is this data used? | **Analytics** |
| Is this data linked to the user's identity? | **No** |
| Is this data used for tracking? | **No** |

**CRASH DATA**
| Vraag | Antwoord |
|-------|----------|
| How is this data used? | **App Functionality** |
| Is this data linked to the user's identity? | **No** |
| Is this data used for tracking? | **No** |

**PERFORMANCE DATA**
| Vraag | Antwoord |
|-------|----------|
| How is this data used? | **App Functionality** |
| Is this data linked to the user's identity? | **No** |
| Is this data used for tracking? | **No** |

#### Resultaat Privacy Labels

Na invullen verschijnt dit op je App Store pagina:

**Data Used to Track You:**
```
None
```

**Data Linked to You:**
```
• Contact Info (Name, Email, Phone)
• User Content (Photos, Other User Content)
• Identifiers (User ID, Device ID)
```

**Data Not Linked to You:**
```
• Usage Data (Product Interaction)
• Diagnostics (Crash Data, Performance Data)
```

---

### 7.9 LEEFTIJDSCLASSIFICATIE - COMPLETE VRAGENLIJSTEN

#### Apple App Store - Age Rating Questionnaire (Nieuw systeem 2025)

Apple heeft in 2025 een nieuw leeftijdsratingsysteem geïntroduceerd met ratings: 4+, 9+, 13+, 16+, 18+.

**Sectie: Violence**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Cartoon or Fantasy Violence | **None** |
| Realistic Violence | **None** |
| Prolonged Graphic or Sadistic Realistic Violence | **None** |
| Graphic Violence with Consequences | **None** |

**Sectie: Sexual Content**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Graphic Sexual Content and Nudity | **None** |
| Sexual Content or Nudity | **None** |
| Suggestive Themes | **None** |

**Sectie: Profanity and Crude Humor**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Mature/Suggestive Themes | **None** |
| Profanity or Crude Humor | **None** |

**Sectie: Substances**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Alcohol, Tobacco, or Drug Use or References | **None** |

**Sectie: Gambling**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Simulated Gambling | **None** |
| Real Gambling | **None** |

**Sectie: Horror/Fear**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Horror/Fear Themes | **None** |
| Intense Horror/Fear Themes | **None** |

**Sectie: In-App Features & Capabilities (NIEUWE VRAGEN 2025)**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Unrestricted Web Access | **No** |
| Gambling and Contests | **No** |
| Does this app contain user-generated content? | **Yes** (chat berichten) |
| Can users communicate with each other? | **Yes** (chat functie) |
| Does this app contain AI-generated content? | **No** |
| Medical or Wellness Topics | **No** |

**Sectie: Account & Purchases**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Made for Kids | **No** |
| Apps Distributed to Organizations | **No** (maar wel besloten club) |

**RESULTAAT iOS**: **4+** (geen aanstootgevend materiaal)

---

#### Google Play - IARC Content Rating Questionnaire

**Sectie 1: Categorie selecteren**
| Vraag | Antwoord |
|-------|----------|
| What category best describes your app? | **Utility** of **Social** |

**Sectie 2: Violence**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Does the app contain violence? | **No** |
| Does the app contain cartoon violence? | **No** |
| Does the app contain fantasy violence? | **No** |
| Does the app contain realistic violence? | **No** |
| Does the app contain blood? | **No** |
| Does the app contain gore? | **No** |

**Sectie 3: Fear/Horror**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Does the app contain frightening content? | **No** |
| Does the app contain horror themes? | **No** |
| Does the app contain jump scares? | **No** |

**Sectie 4: Sexual Content**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Does the app contain sexual content? | **No** |
| Does the app contain nudity? | **No** |
| Does the app contain sexual themes? | **No** |

**Sectie 5: Language**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Does the app contain crude language? | **No** |
| Does the app contain profanity? | **No** |
| Does the app contain sexual language? | **No** |
| Does the app contain discriminatory language? | **No** |

**Sectie 6: Substances**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Does the app reference or depict alcohol use? | **No** |
| Does the app reference or depict tobacco use? | **No** |
| Does the app reference or depict drug use? | **No** |

**Sectie 7: Gambling**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Does the app contain simulated gambling? | **No** |
| Does the app contain real gambling with cash payouts? | **No** |
| Does the app contain loot boxes or random item purchases? | **No** |

**Sectie 8: User Interaction & Generated Content**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Does the app allow users to interact with each other? | **Yes** |
| Does the app allow users to communicate via voice or text? | **Yes** (chat) |
| Does the app allow users to share content with others? | **Yes** (berichten, foto's) |
| Does the app allow users to share their location? | **No** |
| Does the app contain user-generated content? | **Yes** |
| Can users exchange personal info? | **Yes** (ledenlijst) |

**Sectie 9: Purchases & Advertising**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Does the app contain in-app purchases? | **No** (betaling via EPC QR-codes met eigen bank app) |
| Does the app contain advertising? | **No** |
| Does the app link to external purchases? | **Yes** (activiteitskosten) |

**Sectie 10: Miscellaneous**
| Vraag | Antwoord CalyMob |
|-------|------------------|
| Is this app primarily intended for children? | **No** |
| Does this app require account registration? | **Yes** |

**RESULTAAT Google Play**: **Everyone** (PEGI 3 / USK 0)

*Opmerking: Omdat de app user-generated content bevat (chat), kan Google aanvullende moderatie-informatie vragen. Je kunt aangeven dat de chat alleen beschikbaar is voor geverifieerde clubleden.*

---

### 7.10 iOS EXPORT COMPLIANCE (Encryption)

Bij het uploaden naar TestFlight/App Store vraagt Apple over encryption. Dit is vanwege US export regelgeving.

**Vraag 1: Does your app use encryption?**

| Vraag | Antwoord CalyMob | Uitleg |
|-------|------------------|--------|
| Does your app contain, use or access third-party encryption? | **Yes** | Firebase/HTTPS gebruikt encryptie |

**Vraag 2: Is your app designed for governmental/industrial/commercial use?**

| Vraag | Antwoord CalyMob |
|-------|------------------|
| Is your app designed to be used for any purpose other than performing the cryptographic functions identified above? | **No** |

**Vraag 3: Exempt encryption?**

| Vraag | Antwoord CalyMob | Uitleg |
|-------|------------------|--------|
| Does your app qualify for any of the exemptions provided in Category 5, Part 2 of the U.S. Export Administration Regulations? | **Yes** | De app gebruikt alleen standaard HTTPS/TLS encryptie |

**Kies de exemptie:**
```
(b) The app uses, accesses, implements, or incorporates only standard encryption algorithms and protocols for authentication, digital signature or data integrity purposes
```

OF

```
(c) The app uses, accesses, implements, or incorporates only standard encryption for communications (e.g., HTTPS, SSL, TLS)
```

**Antwoord: Yes** - de app is exempt

**Info.plist instelling** (al geconfigureerd):
```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

Dit betekent dat je GEEN jaarlijkse export compliance rapportage hoeft in te dienen.

---

### 7.11 COPYRIGHT & LEGAL

**Copyright tekst**:
```
© 2026 Calypso Diving Club ASBL. Tous droits réservés.
```

**EULA/Terms of Service** (kort):
```
Cette application est réservée aux membres du Calypso Diving Club ASBL.
L'utilisation de cette application implique l'acceptation de notre politique de confidentialité disponible sur https://caly.club/privacy.
En utilisant cette application, vous acceptez de respecter les règles du club et de ne pas partager vos identifiants de connexion.
```

---

### 7.12 PROMOTIONAL TEXT (iOS)

**Promotional Text** (max 170 tekens, kan gewijzigd worden zonder app update):

```
Nouveau ! Inscrivez-vous aux plongées, gérez vos frais et restez connecté avec votre club de plongée préféré ! 🤿
```

---

### 7.13 CATEGORY SELECTIE

**App Store (iOS)**:
- Primary Category: `Lifestyle`
- Secondary Category: `Sports`

**Google Play**:
- Category: `Sports`
- Tags: Social, Scuba Diving, Club

---

### 7.14 APP ACCESS / RESTRICTED ACCESS

Beide stores vragen waarom je app toegang beperkt. Hier zijn de antwoorden:

**App Store Connect - App Review Information**

Bij "Sign-in required" zet je:
```
App Access: Sign-in required

Demo Account:
Email: demo.reviewer@calypsodc.be
Password: CalyMob2025!

Notes: This is a private club management app for members of Calypso Diving Club (Belgium). Access is restricted to registered club members only. The demo account above can be used to test all features. New user registration is not available through the app - members are added by club administrators.
```

**Google Play - App Access**

Bij "Restricted Access" kies je:
- **All or some functionality is restricted**

Dan vul je in:
```
Access Type: Login credentials required

Instructions for testers:
Email: demo.reviewer@calypsodc.be
Password: CalyMob2025!

Reason for restricted access: This app is exclusively for members of Calypso Diving Club ASBL (Belgium). Only pre-registered club members can access the app. Member accounts are created by club administrators.
```

---

## DEEL 8: PRIVACY POLICY HTML

De privacy policy moet online staan op `https://caly.club/privacy`. Hier is de volledige HTML die je kunt hosten:

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Politique de Confidentialité - CalyMob</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #1a365d;
            background: linear-gradient(135deg, #0077b6 0%, #023e8a 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: rgba(255,255,255,0.95);
            border-radius: 16px;
            padding: 40px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        h1 {
            color: #023e8a;
            font-size: 2em;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        h1::before { content: "🛡️"; }
        .update-date {
            background: #e0f2fe;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.9em;
            display: inline-block;
            margin-bottom: 30px;
        }
        h2 {
            color: #0077b6;
            margin-top: 30px;
            margin-bottom: 15px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e0f2fe;
        }
        h3 { color: #023e8a; margin-top: 20px; margin-bottom: 10px; }
        p { margin-bottom: 15px; }
        ul { margin-left: 25px; margin-bottom: 15px; }
        li { margin-bottom: 8px; }
        .highlight {
            background: #fef3c7;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #f59e0b;
            margin: 20px 0;
        }
        .contact-box {
            background: #023e8a;
            color: white;
            padding: 20px;
            border-radius: 12px;
            margin-top: 30px;
        }
        .contact-box a { color: #7dd3fc; }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0f2fe;
            color: #64748b;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Politique de Confidentialité</h1>
        <div class="update-date">Dernière mise à jour : Janvier 2026</div>

        <h2>À propos de CalyMob</h2>
        <p>CalyMob est l'application mobile officielle du <strong>Calypso Diving Club ASBL</strong>, un club de plongée basé en Belgique. Cette application est exclusivement réservée aux membres du club et permet de gérer les activités, les inscriptions et les notes de frais.</p>

        <h2>Responsable du traitement</h2>
        <p><strong>Calypso Diving Club ASBL</strong><br>
        Belgique<br>
        Email : <a href="mailto:contact@calypsodc.be">contact@calypsodc.be</a></p>

        <h2>Données collectées</h2>
        <h3>Informations obligatoires :</h3>
        <ul>
            <li>Nom et prénom (identification des membres)</li>
            <li>Adresse email (authentification et communication)</li>
            <li>Niveau de plongée LIFRAS (organisation des activités)</li>
        </ul>

        <h3>Informations optionnelles :</h3>
        <ul>
            <li>Numéro de téléphone (contact entre membres)</li>
            <li>Photo de profil (avec votre consentement explicite)</li>
            <li>Photos de justificatifs (notes de frais)</li>
        </ul>

        <h2>Photo de profil et consentement</h2>
        <p>L'utilisation de votre photo de profil nécessite votre consentement selon deux niveaux :</p>
        <div class="highlight">
            <strong>Usage interne (requis pour avoir une photo) :</strong> Votre photo sera visible uniquement par les membres du club dans l'application et le site web réservé aux membres.
        </div>
        <div class="highlight">
            <strong>Usage externe (optionnel) :</strong> Votre photo pourra être utilisée dans les communications externes : réseaux sociaux, site web public, publications.
        </div>
        <p>Vous pouvez modifier vos consentements à tout moment depuis votre profil.</p>

        <h2>Détection de visage</h2>
        <p>Lors de l'ajout de votre photo, nous utilisons Google ML Kit Face Detection pour vérifier la présence d'un visage et améliorer le cadrage. <strong>Important :</strong> Cette analyse se fait localement sur votre appareil. Aucune donnée biométrique n'est stockée sur nos serveurs.</p>

        <h2>Finalités du traitement</h2>
        <ul>
            <li>Gestion de votre compte membre</li>
            <li>Organisation des activités de plongée</li>
            <li>Communication entre membres</li>
            <li>Gestion des notes de frais</li>
            <li>Annuaire interne "Who's Who"</li>
            <li>Envoi de notifications d'activités</li>
        </ul>

        <h2>Partage des données</h2>
        <p><strong>Vos données personnelles ne sont jamais vendues à des tiers.</strong></p>
        <h3>Partage au sein du club :</h3>
        <ul>
            <li>Nom, prénom et niveau de plongée : visibles par tous les membres</li>
            <li>Email et téléphone : selon vos préférences de partage</li>
            <li>Photo : uniquement si vous avez donné votre consentement</li>
        </ul>
        <h3>Services techniques utilisés :</h3>
        <ul>
            <li>Firebase (Google Cloud) : hébergement sécurisé en Europe (europe-west1)</li>
            <li>Firebase Cloud Messaging : notifications push</li>
        </ul>

        <h2>Durée de conservation</h2>
        <p>Vos données sont conservées tant que vous êtes membre actif. Après suppression de votre compte ou départ du club, vos données sont effacées dans un délai de 30 jours, sauf obligation légale de conservation.</p>

        <h2>Vos droits RGPD</h2>
        <p>Conformément au Règlement Général sur la Protection des Données (UE 2016/679), vous disposez des droits suivants :</p>
        <ul>
            <li><strong>Droit d'accès</strong> (Art. 15) : consulter vos données</li>
            <li><strong>Droit de rectification</strong> (Art. 16) : modifier vos informations</li>
            <li><strong>Droit à l'effacement</strong> (Art. 17) : supprimer votre compte</li>
            <li><strong>Droit à la limitation</strong> (Art. 18) : limiter le traitement</li>
            <li><strong>Droit de retrait du consentement</strong> (Art. 7) : retirer vos consentements</li>
            <li><strong>Droit à la portabilité</strong> (Art. 20) : récupérer vos données</li>
            <li><strong>Droit d'opposition</strong> (Art. 21) : vous opposer au traitement</li>
        </ul>

        <h2>Sécurité des données</h2>
        <ul>
            <li>Chiffrement des données en transit (HTTPS/TLS)</li>
            <li>Hébergement sécurisé sur Firebase (Google Cloud)</li>
            <li>Authentification sécurisée avec option biométrique</li>
            <li>Règles de sécurité strictes sur Firestore et Storage</li>
            <li>Accès limité selon les rôles</li>
        </ul>

        <h2>Cookies et tracking</h2>
        <p>CalyMob n'utilise pas de cookies ou de technologies de suivi à des fins publicitaires. Aucune publicité n'est affichée dans l'application.</p>

        <div class="contact-box">
            <h2 style="color: white; border: none; margin-top: 0;">Contact</h2>
            <p>Pour toute question sur vos données personnelles ou pour exercer vos droits RGPD :</p>
            <p>📧 Email : <a href="mailto:contact@calypsodc.be">contact@calypsodc.be</a></p>
            <p>Nous nous engageons à répondre dans un délai d'un mois maximum.</p>
            <p style="margin-top: 15px; font-size: 0.9em;">En cas de litige, vous pouvez introduire une réclamation auprès de l'Autorité de Protection des Données (APD) de Belgique : <a href="https://www.autoriteprotectiondonnees.be">www.autoriteprotectiondonnees.be</a></p>
        </div>

        <div class="footer">
            <p>© 2026 Calypso Diving Club ASBL - Tous droits réservés</p>
            <p>CalyMob - Application mobile pour les membres du club</p>
        </div>
    </div>
</body>
</html>
```

---

## DEEL 9: DEMO ACCOUNT VOOR REVIEWERS

Apple en Google reviewers moeten je app kunnen testen. Aangezien CalyMob alleen toegankelijk is voor clubleden, moet je een demo account aanmaken.

### 9.1 Demo Account Aanmaken

**Stap 1: Maak een nieuw lid aan in Firestore** (via CalyCompta of Firebase Console)

```
Naam: App Store Reviewer
Voornaam: Demo
Email: demo.reviewer@calypsodc.be (of ander email dat je kunt ontvangen)
Niveau: 1* (of willekeurig)
clubStatuten: [] (geen speciale rechten)
app_role: null (geen admin)
```

**Stap 2: Maak Firebase Auth account**
1. Ga naar Firebase Console > Authentication
2. Add user met hetzelfde email
3. Stel een eenvoudig wachtwoord in (reviewers typen dit handmatig)

**Aanbevolen credentials**:
```
Email: demo.reviewer@calypsodc.be
Password: CalyMob2025!
```

**Stap 3: Test het account**
1. Log in met de credentials in de app
2. Zorg dat alle functies werken zonder speciale rechten
3. Voeg eventueel wat dummy data toe (inschrijving voor een event, etc.)

### 9.2 Review Notes met Demo Account

**Update de Review Notes (sectie 7.6) met de echte credentials:**

```
DEMO ACCOUNT FOR TESTING:
Email: demo.reviewer@calypsodc.be
Password: CalyMob2025!

WHAT THE REVIEWER CAN TEST:
1. Login with demo credentials
2. View the home screen with upcoming activities
3. Navigate to "Opérations" to see diving events
4. Navigate to "Piscine" to see pool sessions
5. Navigate to "Dépenses" to view expense claims
6. Navigate to "Who's Who" to browse the member directory
7. Access Settings and Privacy Policy

NOTE: The demo account has standard member permissions.
Admin features like creating events are not accessible.
The account cannot make real payments - the EPC QR code payment
feature is for actual club activity fees only.
```

### 9.3 Belangrijke Tips voor Review

**Doe dit VOOR je indient:**
- [ ] Log in met demo account en doorloop alle schermen
- [ ] Zorg dat er actuele/toekomstige events zichtbaar zijn
- [ ] Controleer dat de demo user ingeschreven kan worden voor een event
- [ ] Test dat "Who's Who" andere (nep of echte) leden toont
- [ ] Maak een test onkostennota zodat de reviewer er een ziet
- [ ] Zorg dat push notifications werken (stuur een test)

**Wat te doen bij rejection:**
- Apple geeft specifieke redenen
- Vaak: meer uitleg nodig over "restricted access"
- Oplossing: verwijs naar je Review Notes en leg uit dat dit een private club app is

---

## DEEL 10: SAMENVATTING ACTIELIJST

### Onmiddellijk te doen (Voorbereiding)

- [ ] **Privacy Policy hosten**
  - Kopieer de HTML uit sectie 8
  - Upload naar https://caly.club/privacy
  - Test dat URL werkt zonder login

- [ ] **Demo account aanmaken**
  - Volg stappen in sectie 9.1
  - Test login met demo credentials
  - Zorg voor zichtbare testdata

- [ ] **App icoon 1024x1024**
  - Vergroot huidige icon of maak nieuwe versie
  - Zonder transparantie/alpha voor iOS

- [ ] **Screenshots maken**
  - Minimaal 3 screenshots per formaat
  - iPhone 6.5" of 6.7" (verplicht)
  - iPad (optioneel maar aanbevolen)
  - Gebruik simulator of echte devices

### iOS App Store (in volgorde)

1. [ ] Apple Developer Portal: App ID aanmaken
2. [ ] Distribution Certificate genereren
3. [ ] Provisioning Profile aanmaken
4. [ ] App Store Connect: App aanmaken
5. [ ] Alle metadata invullen (kopieer uit sectie 7)
6. [ ] App Privacy labels invullen (sectie 7.8)
7. [ ] Build maken: `flutter build ipa --release`
8. [ ] Upload via Xcode/Transporter
9. [ ] TestFlight: Test met demo account
10. [ ] Submit for Review

### Google Play Store (in volgorde)

1. [ ] Play Console: App aanmaken
2. [ ] Store listing invullen (kopieer uit sectie 7)
3. [ ] Data Safety form invullen (sectie 7.7)
4. [ ] Content rating questionnaire (sectie 7.9)
5. [ ] Build maken: `flutter build appbundle --release`
6. [ ] Upload naar Internal Testing track
7. [ ] Test met demo account
8. [ ] Promote naar Production
9. [ ] Submit for Review

### Na goedkeuring

- [ ] Test download uit beide stores
- [ ] Communiceer naar clubleden
- [ ] Monitor Firebase Crashlytics
- [ ] Reageer op eventuele reviews

---

## DEEL 11: KRITIEKE VEREISTEN 2025 (Deep Search Resultaten)

Dit deel bevat kritieke vereisten die uit de deep search naar voren kwamen. **Lees dit grondig door voordat je begint!**

---

### ⚠️ BLOKKERENDE ISSUES GEVONDEN

Na analyse van de CalyMob codebase zijn de volgende **blokkerende issues** gevonden die moeten worden opgelost **VOORDAT** je kunt publiceren:

| Issue | Status | Impact | Actie |
|-------|--------|--------|-------|
| **Account Deletion Feature** | ✅ GEÏMPLEMENTEERD | - | Aanwezig in Settings → "Supprimer mon compte" |
| **Privacy Manifest (iOS)** | ✅ OPGELOST | - | `PrivacyInfo.xcprivacy` aangemaakt en toegevoegd |
| **Privacy Policy URL** | ✅ ONLINE | - | `https://caly.club/privacy` is online |
| **Demo Account** | ✅ AANGEMAAKT | - | demo.reviewer@calypsodc.be / CalyMob2025! |
| **EU Trader Status** | ⚠️ NIET INGEVULD | KAN BLOKKEREN EU | Moet in beide store consoles worden ingevuld |

**Geschatte extra werk:**
- ~~Account Deletion Feature: 2-4 uur development~~ ✅ Al geïmplementeerd
- Privacy Manifest: 30 minuten
- Privacy Policy hosting: 1 uur
- Demo Account: 30 minuten
- EU Trader Status: 15 minuten per store

---

### 11.1 EU DIGITAL SERVICES ACT (DSA) - TRADER STATUS

**KRITIEK voor EU distributie (België)**

Sinds februari 2024 moeten alle ontwikkelaars die apps aanbieden aan EU-gebruikers hun "trader status" declareren.

#### Apple App Store Connect
1. **Login**: https://appstoreconnect.apple.com
2. Ga naar **Users and Access** > **Legal**
3. Vul de **Digital Services Act (DSA) compliance** sectie in:

| Veld | Invullen |
|------|----------|
| Are you a trader? | **Yes** (als ASBL die app aanbiedt) |
| Legal entity name | Calypso Diving Club ASBL |
| Trade register number | [Ondernemingsnummer KBO] |
| Email address | contact@calypsodc.be |
| Phone number | [Club telefoonnummer] |
| Address | [Volledig adres club] |

**Alternatief**: Als de club technisch gezien geen "trader" is (geen commerciële activiteit), kies **No** - maar dit kan voor gratis apps discussie opleveren.

#### Google Play Console
1. Ga naar **Policy** > **App content** > **Digital Services Act**
2. Selecteer of je een trader bent
3. Vul dezelfde informatie in als hierboven

**BELANGRIJK**: Zonder deze informatie kun je je app **niet** distribueren in de EU!

---

### 11.2 iOS PRIVACY MANIFEST (PrivacyInfo.xcprivacy)

**KRITIEK sinds mei 2024**

Apple vereist een Privacy Manifest file voor alle apps die bepaalde APIs gebruiken (inclusief Firebase).

#### Huidige status CalyMob:
```
✅ Firebase/Pods Privacy Manifests: AANWEZIG (via CocoaPods)
❌ Runner Privacy Manifest: ONTBREEKT - MOET WORDEN AANGEMAAKT!
```

#### Wat is het?
Een `PrivacyInfo.xcprivacy` bestand dat declareert:
- Welke "required reason APIs" je app gebruikt
- Welke tracking domains je app contacteert
- Welke data types je verzamelt

#### ACTIE VEREIST: Maak het bestand aan:

**Locatie**: `CalyMob/ios/Runner/PrivacyInfo.xcprivacy`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <!-- Name -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeName</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Email -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeEmailAddress</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Phone Number -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePhoneNumber</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Photos -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePhotosorVideos</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- User ID -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeUserID</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Device ID (for push notifications) -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeDeviceID</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Crash Data -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeCrashData</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <false/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <!-- Performance Data -->
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePerformanceData</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <false/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <!-- User Defaults (Firebase uses this) -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
        <!-- File Timestamp (for cache management) -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>C617.1</string>
            </array>
        </dict>
        <!-- System Boot Time (Firebase Analytics) -->
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>35F9.1</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```

#### Toevoegen aan Xcode project
1. Open `CalyMob/ios/Runner.xcworkspace` in Xcode
2. Right-click op **Runner** folder
3. **Add Files to "Runner"**
4. Selecteer `PrivacyInfo.xcprivacy`
5. Zorg dat "Copy items if needed" NIET is aangevinkt
6. Target: Runner

**BELANGRIJK**: Firebase SDKs leveren hun eigen Privacy Manifests mee. Run `pod update` om de nieuwste versies te krijgen.

---

### 11.3 GOOGLE PLAY - FINANCIAL FEATURES DECLARATION

**VEREIST voor ALLE apps sinds 2024**

Google Play vraagt nu bij ALLE apps of ze "financial features" bevatten, ongeacht of je betalingen verwerkt.

#### In Play Console
1. **Policy** > **App content** > **Financial features**
2. Beantwoord de vragen:

| Vraag | Antwoord CalyMob | Uitleg |
|-------|------------------|--------|
| Does your app provide financial product or service features? | **Yes** | App bevat betaalfunctie voor activiteiten |
| Does your app facilitate the purchase of goods or services? | **Yes** | Betaling voor duikactiviteiten |
| Is your app a payment app? | **No** | Geen betalings-app, wel betaalfunctie |
| Does your app offer loans? | **No** | |
| Does your app offer investment services? | **No** | |
| Does your app offer cryptocurrency services? | **No** | |
| Does your app facilitate personal finance management? | **No** | Onkosten zijn club-gerelateerd |

#### Aanvullende verklaring
Als je "Yes" antwoordt op betaalfuncties:
```
This app allows club members to pay for diving activities and events.
Payments use EPC QR codes (European Payments Council SEPA standard).
Members scan the QR code with their own banking app to initiate payment.
The app generates standardized payment instructions - no payment processing
is done within the app. No financial data is collected or stored.
Compatible with all European banking apps.
```

---

### 11.4 GOOGLE PLAY - TESTING REQUIREMENTS (Persoonlijke accounts)

**Let op voor NIEUWE persoonlijke developer accounts!**

Google vereist sinds november 2023 voor nieuwe persoonlijke accounts:
- **20 testers** die de app hebben geïnstalleerd
- **Minimaal 14 dagen** in closed testing
- Voordat je naar production mag

**Dit geldt ALLEEN voor:**
- Nieuwe persoonlijke developer accounts (< 1 jaar oud)
- NIET voor organisatie-accounts
- NIET voor bestaande accounts met track record

#### Actie als dit van toepassing is:
1. **Closed testing track aanmaken**
2. **20 email adressen verzamelen** (clubleden)
3. **Stuur opt-in link naar testers**
4. **Wacht 14 dagen**
5. Dan pas naar Production

**Tip**: Vraag aan 20+ clubleden om hun Google Play email te geven en de test-app te installeren.

---

### 11.5 ACCOUNT DELETION REQUIREMENT ✅ GEÏMPLEMENTEERD

**KRITIEK voor beide stores**

Beide Apple en Google vereisen dat gebruikers hun account kunnen verwijderen **vanuit de app zelf**.

#### Apple (sinds 2022)
> "Apps that offer account creation must also offer account deletion"

#### Google (sinds 2023)
> "Apps must provide a clear in-app path to request account deletion"

#### Huidige situatie CalyMob:
```
✅ ACCOUNT DELETION FEATURE IS GEÏMPLEMENTEERD!
   Locatie: Settings → "Supprimer mon compte"
```

#### Implementatie details:

**Bestanden:**
- UI: `lib/screens/profile/settings_screen.dart` (regels 671-847)
- Logic: `lib/providers/auth_provider.dart` (regels 189-246)
- Data cleanup: `lib/services/profile_service.dart` (regels 327-389)

**Wat er gebeurt bij deletion:**
1. Profielfoto verwijderd uit Firebase Storage
2. Member document geanonimiseerd (GDPR soft delete)
3. Alle sessies verwijderd
4. Biometrische credentials gewist
5. Firebase Auth account verwijderd
6. Gebruiker uitgelogd naar login scherm

**GDPR Compliance:**
- Soft delete met anonymisatie ("Compte supprimé", "deleted@deleted.local")
- `account_deleted: true` flag gezet
- `account_deleted_at` timestamp opgeslagen
- Onkosten/registraties behouden voor boekhouding (geanonimiseerd)

**User flow:**
```
Settings > "Supprimer mon compte" (rode knop)
    ↓
Warning dialog met uitleg wat verwijderd wordt
    ↓
[Annuler] [Supprimer définitivement]
    ↓
Data anonymisatie + logout
```

---

### 11.6 ANDROID API LEVEL VEREISTEN

**Deadline: 31 augustus 2025**

Google vereist dat nieuwe apps en updates targeten:
- **Target API level 35** (Android 15) - vanaf augustus 2025

#### Huidige CalyMob status:
```
targetSdkVersion: 35 ✅ (al geconfigureerd)
```

Dit is al in orde. Maar let op bij Flutter updates:
- Zorg dat je Flutter 3.22+ gebruikt voor volledige Android 15 support
- Run `flutter upgrade` als je een oudere versie hebt

---

### 11.7 XCODE & iOS SDK VEREISTEN

**Vereist voor App Store submissions**

Apple vereist:
- **Xcode 16+** voor nieuwe submissions (sinds voorjaar 2025)
- **iOS 18 SDK** ingebouwd in de app

#### Controleer je Xcode versie:
```bash
xcodebuild -version
```

Moet zijn: **Xcode 16.0 of hoger**

#### Flutter vereisten:
- Flutter 3.22+ voor volledige iOS 18 / Xcode 16 support
- Run `flutter upgrade` indien nodig

```bash
flutter --version
```

#### Als je Xcode moet updaten:
1. Open **App Store** op je Mac
2. Zoek naar **Xcode**
3. Update naar versie 16+
4. Na installatie: `sudo xcode-select --switch /Applications/Xcode.app`

---

### 11.8 VEELVOORKOMENDE REJECTION REDENEN

Uit de deep search kwamen deze veel voorkomende redenen voor app rejection:

#### Apple App Store

| Reden | Hoe te vermijden |
|-------|------------------|
| **Guideline 2.1 - Performance** | Test app grondig, geen crashes |
| **Guideline 4.2 - Minimum Functionality** | App moet genoeg functionaliteit bieden |
| **Guideline 5.1.1 - Data Collection** | Privacy labels moeten kloppen |
| **Guideline 5.1.2 - Data Use and Sharing** | Privacy policy moet compleet zijn |
| **Sign-in Required without demo** | Altijd demo account meegeven! |
| **Incomplete metadata** | Alle velden invullen, screenshots voor alle formaten |
| **Broken links** | Test alle URLs (privacy policy, support) |

#### Google Play Store

| Reden | Hoe te vermijden |
|-------|------------------|
| **Policy violation - Deceptive behavior** | App moet doen wat beschrijving zegt |
| **Data Safety form incorrect** | Alle data types correct declareren |
| **Restricted content** | Geen content die in strijd is met beleid |
| **Store listing issues** | Screenshots moeten app content tonen |
| **Functionality issues** | App moet werken op alle getargete devices |
| **Payment policy** | Externe betalingen uitleggen (EPC QR-codes) |

---

### 11.9 BIJGEWERKTE PRE-LAUNCH CHECKLIST

Voeg deze items toe aan de checklist uit DEEL 4:

#### KRITIEKE NIEUWE VEREISTEN

- [ ] **EU Trader Status ingevuld** (Apple + Google)
  - App Store Connect: Legal > DSA compliance
  - Play Console: Policy > App content > DSA

- [ ] **Privacy Manifest aanwezig** (iOS)
  - Bestand: `ios/Runner/PrivacyInfo.xcprivacy`
  - Toegevoegd aan Xcode project

- [ ] **Financial Features Declaration** (Google Play)
  - Play Console: Policy > App content > Financial features

- [x] **Account Deletion Feature** (beide stores) ✅
  - Geïmplementeerd: Settings → "Supprimer mon compte"
  - Inclusief confirmatie dialoog en GDPR compliance

- [ ] **Xcode 16+ geïnstalleerd** (iOS)
  - Check: `xcodebuild -version`

- [ ] **Flutter up-to-date** (beide)
  - Check: `flutter --version`
  - Minimum: Flutter 3.22+

---

## HULPBRONNEN

- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policy Center](https://play.google.com/console/about/guides/releasewithconfidence/)
- [Flutter Deployment Guide iOS](https://docs.flutter.dev/deployment/ios)
- [Flutter Deployment Guide Android](https://docs.flutter.dev/deployment/android)
- [Codemagic Documentation](https://docs.codemagic.io/)
- [Apple Privacy Manifest Documentation](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files)
- [EU Digital Services Act - Apple](https://developer.apple.com/support/dsa-compliance/)
- [Google Play Financial Features Policy](https://support.google.com/googleplay/android-developer/answer/9876821)
