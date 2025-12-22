# Vercel Deployment Setup

This guide explains how to set up environment variables for the Vercel deployment to fix the SSL certificate error with the activate-user API endpoint.

## Problem

The error `ERR_CERT_COMMON_NAME_INVALID` when calling `/api/activate-user` occurs because:
- The app is deployed on `caly.club` domain
- The SSL certificate for `caly.club` may not be properly configured

## Solution

We've created a Vercel serverless function at `/api/activate-user` that requires Firebase Admin SDK credentials.

## Environment Variables Required

You need to add the following environment variables to your Vercel project:

### 1. Firebase Service Account Key

Go to your Vercel project settings:
1. Navigate to https://vercel.com/your-team/your-project/settings/environment-variables
2. Add the following environment variables:

#### `FIREBASE_SERVICE_ACCOUNT_KEY`
- **Value**: The entire service account JSON as a string
- **How to get it**:
  1. Go to https://console.firebase.google.com/project/calycompta/settings/serviceaccounts/adminsdk
  2. Click "Generate new private key"
  3. Copy the entire JSON content
  4. In Vercel, paste it as a single-line string (Vercel will handle JSON parsing)

#### `FIREBASE_PROJECT_ID`
- **Value**: `calycompta`
- **Description**: Your Firebase project ID

### Example Service Account JSON Structure
```json
{
  "type": "service_account",
  "project_id": "calycompta",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-...@calycompta.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

## Domain Configuration

### Setting up SSL for caly.club

1. Go to your Vercel project dashboard
2. Navigate to "Settings" → "Domains"
3. Ensure `caly.club` is added as a domain
4. Verify that SSL certificate is properly configured:
   - Should show "Valid" or "Verified" status
   - If not, click "Refresh" or "Regenerate Certificate"

### Alternative: Use Vercel Default Domain

If you want to temporarily use the Vercel default domain instead:
1. Use `https://calycompta.vercel.app` instead of `caly.club`
2. Update your custom domain DNS settings if needed

## Testing the API Endpoint

After deployment, you can test the endpoint:

```bash
curl -X POST https://caly.club/api/activate-user \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "clubId": "calypso",
    "authToken": "your-firebase-auth-token"
  }'
```

## Deployment Steps

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Build locally** to verify:
   ```bash
   npm run build
   ```

3. **Deploy to Vercel**:
   ```bash
   vercel deploy --prod
   ```

   Or use the Vercel GitHub integration for automatic deployments.

4. **Verify environment variables** are set in Vercel dashboard

5. **Test the endpoint** using the activate user button in the app

## Troubleshooting

### Error: "Missing required fields"
- Ensure all environment variables are set in Vercel
- Check that `FIREBASE_SERVICE_ACCOUNT_KEY` is valid JSON

### Error: "Invalid auth token"
- The user's Firebase auth token may have expired
- Try logging out and logging back in

### Error: "Insufficient permissions"
- Only admin and superadmin roles can activate users
- Check the user's role in Firebase Auth custom claims

### SSL Certificate Still Invalid
1. Go to Vercel dashboard → Domains
2. Remove and re-add the `caly.club` domain
3. Wait for DNS propagation (can take up to 48 hours)
4. Consider using Cloudflare for SSL/DNS management

## Security Notes

- The service account key provides full access to your Firebase project
- Keep it secure and never commit it to version control
- Use Vercel's environment variables feature (encrypted at rest)
- Rotate service account keys periodically

## Additional Resources

- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Firebase Admin SDK Setup](https://firebase.google.com/docs/admin/setup)
- [Vercel Serverless Functions](https://vercel.com/docs/concepts/functions/serverless-functions)
- [Custom Domains on Vercel](https://vercel.com/docs/concepts/projects/domains)
