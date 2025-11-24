#!/bin/bash

# Test manual du cron job
# Récupère le CRON_SECRET depuis Vercel et appelle l'endpoint

echo "🔍 Test manuel du cron job de communication..."
echo ""

# Récupérer le CRON_SECRET
CRON_SECRET=$(vercel env pull .env.local 2>&1 | grep -q "Downloaded" && grep CRON_SECRET .env.local | cut -d'=' -f2)

if [ -z "$CRON_SECRET" ]; then
  echo "❌ CRON_SECRET non trouvé"
  echo "Utilisation du secret par défaut..."
  CRON_SECRET="xR7mK9pL3nV8qT2wY6sB4hF1jD5gA9zE0uN3vC8xM="
fi

echo "📡 Appel de l'endpoint: https://caly.app/api/run-communication-jobs"
echo ""

# Appeler l'endpoint
curl -X GET "https://caly.app/api/run-communication-jobs" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -w "\n\n📊 Status: %{http_code}\n" \
  -s | python3 -m json.tool

echo ""
echo "✅ Test terminé"
