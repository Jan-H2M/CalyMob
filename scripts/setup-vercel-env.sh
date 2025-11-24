#!/bin/bash

# Script to help set up Vercel environment variables for CalyCompta
# This script will guide you through configuring the required environment variables

echo "🚀 CalyCompta - Vercel Environment Setup"
echo "========================================"
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI is not installed."
    echo "Install it with: npm install -g vercel"
    exit 1
fi

echo "This script will help you set up the following environment variables:"
echo "  1. RESEND_API_KEY - For sending emails"
echo "  2. FIREBASE_SERVICE_ACCOUNT_KEY - For Firebase Admin SDK"
echo ""

# Get project details
echo "📂 Detecting Vercel project..."
PROJECT_NAME=$(vercel ls 2>/dev/null | grep calycompta | head -1 | awk '{print $1}')

if [ -z "$PROJECT_NAME" ]; then
    echo "⚠️  Could not detect Vercel project automatically."
    echo "Please run this from your project directory or link it first with: vercel link"
    exit 1
fi

echo "✅ Found project: $PROJECT_NAME"
echo ""

# RESEND_API_KEY
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  RESEND_API_KEY Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Get your Resend API key from: https://resend.com/api-keys"
echo ""
read -p "Enter your Resend API Key (starts with re_): " RESEND_KEY

if [ ! -z "$RESEND_KEY" ]; then
    echo "Setting RESEND_API_KEY..."
    vercel env add RESEND_API_KEY production <<< "$RESEND_KEY"
    echo "✅ RESEND_API_KEY configured for production"
else
    echo "⚠️  Skipped RESEND_API_KEY"
fi

echo ""

# FIREBASE_SERVICE_ACCOUNT_KEY
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  FIREBASE_SERVICE_ACCOUNT_KEY Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This should be the contents of your serviceAccountKey.json file."
echo ""

if [ -f "serviceAccountKey.json" ]; then
    echo "✅ Found serviceAccountKey.json in current directory"
    echo ""
    read -p "Use this file for FIREBASE_SERVICE_ACCOUNT_KEY? (y/n): " USE_LOCAL

    if [ "$USE_LOCAL" = "y" ] || [ "$USE_LOCAL" = "Y" ]; then
        echo "Setting FIREBASE_SERVICE_ACCOUNT_KEY..."
        SERVICE_ACCOUNT=$(cat serviceAccountKey.json | tr -d '\n' | tr -d ' ')
        vercel env add FIREBASE_SERVICE_ACCOUNT_KEY production <<< "$SERVICE_ACCOUNT"
        echo "✅ FIREBASE_SERVICE_ACCOUNT_KEY configured for production"
    else
        echo "⚠️  Skipped FIREBASE_SERVICE_ACCOUNT_KEY"
    fi
else
    echo "⚠️  serviceAccountKey.json not found in current directory"
    echo "Please ensure you have this file before continuing."
    echo ""
    read -p "Enter path to serviceAccountKey.json (or press Enter to skip): " SERVICE_ACCOUNT_PATH

    if [ ! -z "$SERVICE_ACCOUNT_PATH" ] && [ -f "$SERVICE_ACCOUNT_PATH" ]; then
        echo "Setting FIREBASE_SERVICE_ACCOUNT_KEY..."
        SERVICE_ACCOUNT=$(cat "$SERVICE_ACCOUNT_PATH" | tr -d '\n' | tr -d ' ')
        vercel env add FIREBASE_SERVICE_ACCOUNT_KEY production <<< "$SERVICE_ACCOUNT"
        echo "✅ FIREBASE_SERVICE_ACCOUNT_KEY configured for production"
    else
        echo "⚠️  Skipped FIREBASE_SERVICE_ACCOUNT_KEY"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Environment Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Verify your environment variables at:"
echo "     https://vercel.com/settings/environment-variables"
echo ""
echo "  2. Redeploy your application:"
echo "     vercel --prod"
echo ""
echo "  3. Test the communication settings:"
echo "     - Go to Paramètres > Communications Automatisées"
echo "     - Click the Test button on a configured job"
echo ""
