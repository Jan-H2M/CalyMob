# Configuration Resend pour l'envoi d'emails

CalyCompta utilise maintenant **Resend** pour l'envoi d'emails - beaucoup plus simple que Gmail OAuth !

## Étapes de configuration (10 minutes)

### 1. Créer un compte Resend

1. Allez sur https://resend.com
2. Créez un compte (gratuit - 3,000 emails/mois)
3. Vérifiez votre email

### 2. Obtenir votre clé API

1. Une fois connecté, allez dans **API Keys** : https://resend.com/api-keys
2. Cliquez sur **"Create API Key"**
3. Donnez-lui un nom (ex: "CalyCompta Production")
4. Sélectionnez les permissions : **"Sending access"**
5. Cliquez sur **"Add"**
6. **Copiez la clé API** (elle commence par `re_...`)

⚠️ **Important** : Copiez la clé maintenant, elle ne sera plus visible après !

### 3. Configurer les variables d'environnement

#### Pour le développement local :

Créez un fichier `.env.local` à la racine du projet :

```bash
RESEND_API_KEY=re_votre_cle_api_ici
```

#### Pour la production (Vercel) :

1. Allez sur https://vercel.com/h2m/calycompta/settings/environment-variables
2. Ajoutez une nouvelle variable :
   - **Name** : `RESEND_API_KEY`
   - **Value** : `re_votre_cle_api_ici`
   - **Environment** : Production (et Preview si vous voulez)
3. Cliquez sur **"Save"**
4. **Redéployez** votre application pour que la variable soit prise en compte

### 4. (Optionnel) Vérifier votre domaine

Par défaut, les emails sont envoyés depuis `onboarding@resend.dev`. Pour utiliser votre propre domaine :

1. Allez dans **Domains** : https://resend.com/domains
2. Cliquez sur **"Add Domain"**
3. Entrez votre domaine : `caly.club`
4. Suivez les instructions pour ajouter les enregistrements DNS :
   - Enregistrement SPF
   - Enregistrement DKIM
   - Enregistrement DMARC (optionnel mais recommandé)
5. Une fois vérifié, mettez à jour `fromEmail` dans les paramètres de l'application

### 5. Tester l'envoi d'emails

1. Lancez l'application en local : `npm run dev`
2. Allez dans **Paramètres > Intégrations > Services Email**
3. Cliquez sur **"📧 Envoyer un email de test"**
4. Vérifiez que vous recevez l'email
5. Consultez les logs dans le dashboard Resend : https://resend.com/emails

## Différences avec Gmail OAuth

| Aspect | Gmail OAuth (ancien) | Resend (nouveau) |
|--------|---------------------|------------------|
| **Setup** | 2-3 heures | 10 minutes |
| **Configuration** | Client ID, Client Secret, Refresh Token | 1 seule clé API |
| **Complexité** | ⭐⭐⭐⭐⭐ | ⭐ |
| **Fiabilité** | Moyen (erreurs OAuth) | Excellent |
| **Limite gratuite** | 500 emails/jour | 3,000 emails/mois |
| **Support** | Documentation complexe | Excellent support dev |

## En cas de problème

### L'email n'est pas envoyé - Problème Vercel Protection

**PROBLÈME IDENTIFIÉ** : Vercel Deployment Protection bloque l'accès à `/api/send-resend`

**SOLUTION** :
1. Allez sur https://vercel.com/h2m/calycompta/settings/deployment-protection
2. Soit **désactivez temporairement** "Deployment Protection"
3. Soit ajoutez `/api/*` dans les **Path Bypass** pour que les APIs soient accessibles
4. Redéployez votre application

### L'email n'est pas envoyé - Autres causes

1. Vérifiez que `RESEND_API_KEY` est bien configurée dans Firestore
2. Regardez les logs Vercel : https://vercel.com/h2m/calycompta/logs
3. Vérifiez le dashboard Resend : https://resend.com/emails
4. Ouvrez la console du navigateur (F12 → Console) pour voir les erreurs

### Erreur "Missing API Key"

- La variable d'environnement n'est pas configurée
- Ajoutez-la dans Vercel et redéployez

### Emails marqués comme spam

- Vérifiez votre domaine dans Resend
- Configurez SPF, DKIM et DMARC
- Évitez les mots "spam" dans le contenu

## Ressources

- Documentation Resend : https://resend.com/docs
- Dashboard Resend : https://resend.com/overview
- Support : https://resend.com/support

## Migration depuis Gmail OAuth

Si vous aviez Gmail OAuth configuré :

1. Les anciens paramètres (Client ID, Client Secret, Refresh Token) ne sont plus utilisés
2. Vous pouvez les supprimer de Firestore si vous le souhaitez
3. Seuls `fromEmail` et `fromName` sont encore utilisés (pour personnaliser l'expéditeur)

---

**C'est tout ! Beaucoup plus simple que Gmail OAuth 🎉**
