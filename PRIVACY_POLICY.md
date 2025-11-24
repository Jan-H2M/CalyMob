# Politique de Confidentialité - CalyMob

**Dernière mise à jour**: 24 novembre 2025

## À propos de CalyMob

CalyMob est une application mobile de gestion des événements, des dépenses et du profil des membres, développée pour le Calypso Diving Club (Belgique). L'application aide les membres du club à gérer leur profil, à s'inscrire aux événements de plongée, à soumettre des demandes de remboursement, et à consulter l'annuaire des membres.

## Responsable du Traitement

**Calypso Diving Club ASBL**
Belgique
Email: contact@calypsodc.be

## Données Collectées

### Informations obligatoires:
- Adresse email (pour l'authentification Firebase)
- Nom et prénom (pour l'identification des membres)
- Niveau de plongée LIFRAS (pour la gestion des activités)

### Informations optionnelles:
- **Photo de profil** (avec consentement explicite - voir section détaillée ci-dessous)
- Numéro de téléphone (pour WhatsApp et notifications)
- Photos de reçus (pour les demandes de remboursement)
- Rôle dans le club (Comité, Président, Trésorier, etc.)

### Données d'utilisation:
- Inscriptions aux événements et activités
- Notes de frais et justificatifs
- Historique des approbations/refus de dépenses
- Token FCM (Firebase Cloud Messaging) pour les notifications push
- Préférences de partage de contact (email, téléphone)
- Préférences de notifications

## Photo de Profil et Consentement

### Système de Consentement à Deux Niveaux

L'utilisation de votre photo de profil nécessite votre **consentement explicite** selon deux niveaux distincts, conformément au RGPD (Article 6(1)(a) et Article 7):

#### 1. Usage Interne (REQUIS)
**Finalité**: Votre photo sera visible uniquement par les membres du club Calypso DC dans:
- L'application mobile CalyMob (écran "Who's Who")
- Le site web réservé aux membres

**Base légale**: Consentement explicite (RGPD Article 6(1)(a))

**Données stockées**:
- Photo de profil (format JPEG, compressée)
- Date de téléchargement (`photo_uploaded_at`)
- Date du consentement (`consent_internal_photo_date`)

#### 2. Usage Externe (OPTIONNEL)
**Finalité**: Votre photo pourra être utilisée dans les communications externes du club:
- Réseaux sociaux (Facebook, Instagram, etc.)
- Site web public du club
- Publications dans les médias
- Articles de presse ou magazines de plongée
- Supports promotionnels

**Base légale**: Consentement explicite additionnel (RGPD Article 6(1)(a))

**Données stockées**:
- Date du consentement externe (`consent_external_photo_date`)

### Détection de Visage (Face Detection)

Lors de l'ajout de votre photo de profil, nous utilisons **Google ML Kit Face Detection** pour:
- Vérifier qu'un visage humain est présent sur la photo
- Améliorer automatiquement le cadrage de la photo
- Garantir une qualité minimale de la photo

**Important - Protection de vos données biométriques**:
- ✅ Le traitement de détection de visage se fait **localement sur votre appareil**
- ✅ Aucune donnée biométrique (vecteurs faciaux, empreintes, etc.) n'est stockée sur nos serveurs
- ✅ Seule la photo finale (image JPEG) est conservée avec votre consentement
- ✅ Conforme au RGPD Article 9 (traitement local uniquement, pas de stockage de données biométriques)

### Modification et Retrait du Consentement

Conformément au **RGPD Article 7(3)** (droit de retrait du consentement):

**Vous pouvez à tout moment**:
- Modifier vos consentements depuis votre profil (Profil → Modifier les consentements)
- Retirer votre consentement interne ou externe

**Conséquences du retrait du consentement interne**:
- ⚠️ Votre photo sera **automatiquement et définitivement supprimée** de nos serveurs (Firebase Storage)
- ⚠️ Les deux consentements (interne ET externe) seront retirés
- ⚠️ Conformément au RGPD Article 17 (droit à l'effacement), votre photo ne sera plus accessible
- ℹ️ Vous devrez ajouter une nouvelle photo si vous souhaitez en avoir une à l'avenir

**Transparence du traitement**:
- Les dates de consentement sont horodatées et conservées dans notre base de données
- Vous pouvez consulter l'état de vos consentements à tout moment dans votre profil

## Finalités du Traitement des Données

Vos données personnelles sont traitées pour les finalités suivantes (RGPD Article 5(1)(b) - limitation des finalités):

1. **Gestion de compte**: Authentification et identification des membres
2. **Gestion des activités**: Organisation des événements de plongée, inscriptions
3. **Annuaire interne**: "Who's Who" - répertoire des membres avec photos et coordonnées
4. **Gestion financière**: Traitement des notes de frais et remboursements
5. **Communication**: Envoi de notifications push sur les événements
6. **Contact entre membres**: Partage d'email et WhatsApp selon vos préférences

**Base légale**:
- Consentement (Article 6(1)(a)) pour les photos et notifications
- Exécution d'un contrat (Article 6(1)(b)) pour la gestion de l'adhésion au club
- Intérêt légitime (Article 6(1)(f)) pour la gestion administrative du club

## Stockage et Sécurité des Données

### Infrastructure d'hébergement

Toutes les données sont stockées en toute sécurité sur **Firebase (Google Cloud Platform)**:
- **Cloud Firestore**: Base de données NoSQL pour les profils et données structurées
- **Firebase Storage**: Stockage sécurisé des photos de profil et reçus
- **Firebase Authentication**: Gestion sécurisée des comptes utilisateurs
- **Firebase Cloud Messaging**: Notifications push chiffrées

**Localisation**: Serveurs situés en Europe (conformité RGPD)

### Mesures de sécurité techniques

Nous mettons en œuvre des mesures techniques et organisationnelles appropriées (RGPD Article 32):

1. **Chiffrement**:
   - Chiffrement en transit (HTTPS/TLS 1.3)
   - Chiffrement au repos (Google Cloud encryption)

2. **Contrôle d'accès**:
   - Règles de sécurité Firestore et Storage (backend enforcement)
   - Authentification sécurisée Firebase Auth
   - Accès limité selon les rôles (RBAC - Role-Based Access Control)

3. **Consentement enforced at backend**:
   - Les règles Firestore empêchent l'accès aux photos sans consentement interne
   - Les règles Storage vérifient le consentement avant de permettre l'accès aux fichiers

4. **Sauvegarde et disponibilité**:
   - Sauvegardes automatiques Firebase
   - Réplication multi-régionale

5. **Monitoring**:
   - Journalisation des accès administrateurs
   - Alertes de sécurité Google Cloud

## Partage et Divulgation des Données

### Avec qui vos données sont-elles partagées?

**Au sein du club**:
- Votre nom, prénom et niveau de plongée sont visibles par tous les membres
- Votre email est visible selon votre préférence de partage (`share_email`)
- Votre téléphone/WhatsApp est visible selon votre préférence de partage (`share_phone`)
- Votre photo est visible uniquement si vous avez donné votre consentement interne (`consent_internal_photo`)

**Services tiers** (sous-traitants au sens du RGPD Article 28):
1. **Firebase / Google Cloud Platform**:
   - Hébergement sécurisé des données
   - Localisation: Europe (serveurs conformes RGPD)
   - Politique de confidentialité: [Google Privacy Policy](https://policies.google.com/privacy?hl=fr)

2. **Firebase Cloud Messaging (FCM)**:
   - Notifications push chiffrées
   - Token FCM stocké uniquement si vous activez les notifications

3. **Google ML Kit** (Face Detection):
   - Traitement LOCAL uniquement (sur votre appareil)
   - Aucune transmission de données biométriques à Google

**Nous ne vendons JAMAIS vos données personnelles à des tiers.**

## Durée de Conservation des Données

Conformément au RGPD Article 5(1)(e) (limitation de la conservation):

### Données de profil:
- **Pendant votre adhésion active**: Conservation complète de vos données
- **Après départ du club**: Suppression dans les **30 jours** sauf obligations légales

### Photos de profil:
- Conservées tant que vous donnez votre consentement
- **Suppression immédiate** en cas de retrait du consentement interne

### Notes de frais:
- Conservées **7 ans minimum** (obligation comptable légale belge)
- Suppression après expiration du délai légal

### Données d'événements:
- Historique des inscriptions conservé pendant **3 ans** (gestion administrative)
- Suppression après 3 ans sauf archivage légal

### Token FCM (notifications):
- Supprimé immédiatement si vous désactivez les notifications
- Mis à jour automatiquement lors de la réinstallation de l'app

## Vos Droits RGPD

Conformément aux Articles 15 à 22 du RGPD, vous disposez des droits suivants:

### 1. Droit d'accès (Article 15)
Vous pouvez consulter toutes vos données personnelles dans l'application (section Profil).

### 2. Droit de rectification (Article 16)
Vous pouvez modifier vos informations directement depuis votre profil:
- Numéro de téléphone
- Consentements photo
- Préférences de partage de contact
- Préférences de notifications

### 3. Droit à l'effacement / "Droit à l'oubli" (Article 17)
Vous pouvez demander la suppression complète de vos données en contactant: contact@calypsodc.be

**Cas de suppression automatique**:
- Retrait du consentement photo → suppression immédiate de la photo

### 4. Droit à la limitation du traitement (Article 18)
Vous pouvez demander la limitation du traitement de vos données pendant la vérification de leur exactitude ou de la légalité du traitement.

### 5. Droit à la portabilité (Article 20)
Vous pouvez demander une copie de vos données dans un format structuré et lisible par machine (JSON/CSV).

### 6. Droit d'opposition (Article 21)
Vous pouvez vous opposer au traitement de vos données pour des raisons tenant à votre situation particulière.

### 7. Droit de retrait du consentement (Article 7(3))
Vous pouvez retirer vos consentements à tout moment:
- Consentements photo (depuis votre profil)
- Notifications push (depuis les paramètres)

### Exercer vos droits

Pour exercer vos droits RGPD:
- **Email**: contact@calypsodc.be
- **Délai de réponse**: Maximum 1 mois (Article 12(3))

Si vous n'êtes pas satisfait de notre réponse, vous pouvez introduire une réclamation auprès de:
**Autorité de Protection des Données (APD) de Belgique**
Website: [https://www.autoriteprotectiondonnees.be](https://www.autoriteprotectiondonnees.be)

## Notifications Push

Vous pouvez activer ou désactiver les notifications push à tout moment depuis les Paramètres.

**Données collectées pour les notifications**:
- Token FCM (Firebase Cloud Messaging)
- Date d'activation/désactivation

**Finalité**: Vous informer des nouveaux événements, modifications d'événements, et approbations de notes de frais.

**Désactivation**: Paramètres → Notifications → Désactiver
→ Le token FCM sera immédiatement supprimé de notre base de données.

## Cookies et Technologies de Suivi

CalyMob n'utilise **aucun cookie ou technologie de suivi** à des fins publicitaires ou de profilage.

Les seuls identifiants techniques utilisés sont:
- **Firebase Auth UID**: Identifiant utilisateur pour l'authentification
- **Token FCM**: Pour les notifications push (si activées)

## Transferts de Données hors UE

Toutes les données sont stockées sur des serveurs Firebase situés en **Europe**.

Aucun transfert de données personnelles hors de l'Union Européenne n'est effectué, sauf:
- Services Firebase/Google avec garanties RGPD (Clauses Contractuelles Types)

## Modifications de la Politique

Nous pouvons mettre à jour cette politique de confidentialité. Les modifications importantes seront communiquées:
- Par notification dans l'application
- Par email à l'adresse enregistrée

La date de "Dernière mise à jour" en haut de ce document indique la version actuelle.

## Sécurité des Mineurs

CalyMob est destiné aux membres du club de plongée. Conformément au RGPD Article 8, les mineurs de moins de 16 ans doivent obtenir le consentement de leurs parents ou tuteurs légaux avant d'utiliser l'application et de fournir des données personnelles.

## Violations de Données

En cas de violation de données à caractère personnel susceptible d'engendrer un risque élevé pour vos droits et libertés, nous vous en informerons dans les **72 heures** conformément au RGPD Article 33 et 34.

## Contact et Questions

Pour toute question concernant la protection de vos données personnelles:

**Email**: contact@calypsodc.be
**Organisation**: Calypso Diving Club ASBL
**Réponse sous**: 1 mois maximum

## Résumé de vos Choix

| Donnée | Obligatoire | Modifiable | Supprimable |
|--------|-------------|------------|-------------|
| Nom, Prénom, Email | ✅ Oui | ❌ Non | ✅ Sur demande |
| Niveau de plongée | ✅ Oui | ❌ Non* | ❌ Non |
| Photo de profil | ❌ Non | ✅ Oui | ✅ Oui (automatique si retrait consentement) |
| Téléphone | ❌ Non | ✅ Oui | ✅ Oui |
| Partage email | Par défaut: Oui | ✅ Oui | N/A |
| Partage téléphone | Par défaut: Non | ✅ Oui | N/A |
| Notifications push | Par défaut: Non | ✅ Oui | ✅ Oui |

*Modifiable uniquement par les administrateurs du club (données synchronisées depuis le système de gestion des membres)

---

**CalyMob** - Application Mobile pour Calypso Diving Club
Conforme au RGPD (UE 2016/679)
