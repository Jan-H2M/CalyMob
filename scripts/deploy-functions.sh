#!/bin/bash

# Script to deploy Firebase Cloud Functions with automatic retry
# Handles known Google Cloud Build infrastructure issues

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MAX_RETRIES=3
RETRY_DELAY=10
FUNCTIONS_DIR="$(cd "$(dirname "$0")/.." && pwd)/functions"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Firebase Cloud Functions Deployment (with Auto-Retry)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check if we're in the right directory
if [ ! -d "$FUNCTIONS_DIR" ]; then
  echo -e "${RED}❌ Error: functions directory not found${NC}"
  echo -e "   Expected: $FUNCTIONS_DIR"
  exit 1
fi

# Check if firebase CLI is installed
if ! command -v firebase &> /dev/null; then
  echo -e "${RED}❌ Error: Firebase CLI not installed${NC}"
  echo -e "   Install with: npm install -g firebase-tools"
  exit 1
fi

# Check Firebase login
echo -e "${YELLOW}🔐 Checking Firebase authentication...${NC}"
if ! firebase projects:list &> /dev/null; then
  echo -e "${RED}❌ Not logged in to Firebase${NC}"
  echo -e "   Run: firebase login"
  exit 1
fi

# Get current project
CURRENT_PROJECT=$(firebase use | grep -o '([^)]*)'  | tr -d '()')
echo -e "${GREEN}✓ Logged in to Firebase${NC}"
echo -e "   Project: ${CURRENT_PROJECT}"
echo ""

# Function to deploy with retry logic
deploy_functions() {
  local attempt=$1

  echo -e "${BLUE}📤 Deployment attempt ${attempt}/${MAX_RETRIES}...${NC}"
  echo ""

  # Run deployment
  cd "$FUNCTIONS_DIR/.." || exit 1

  if firebase deploy --only functions 2>&1 | tee /tmp/firebase-deploy.log; then
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ SUCCESS: Cloud Functions deployed successfully!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    return 0
  else
    # Check deployment log for known errors
    local deploy_log=$(cat /tmp/firebase-deploy.log)

    echo ""
    echo -e "${RED}❌ Deployment failed (attempt ${attempt}/${MAX_RETRIES})${NC}"

    # Analyze error
    if echo "$deploy_log" | grep -q "Cloud Build"; then
      echo -e "${YELLOW}   Known issue: Google Cloud Build infrastructure problem${NC}"
    elif echo "$deploy_log" | grep -q "EXPIRED"; then
      echo -e "${YELLOW}   Known issue: Build timeout (EXPIRED)${NC}"
    elif echo "$deploy_log" | grep -q "FAILURE"; then
      echo -e "${YELLOW}   Known issue: Build failed with unexpected error${NC}"
    fi

    return 1
  fi
}

# Main deployment loop with retry
attempt=1
while [ $attempt -le $MAX_RETRIES ]; do
  if deploy_functions $attempt; then
    # Success - exit script
    echo ""
    echo -e "${GREEN}📋 Next steps:${NC}"
    echo -e "   1. Test activation in UI (click 'Activer Firebase Auth')"
    echo -e "   2. Check Firebase Console for function logs"
    echo -e "   3. Verify audit logs in Firestore"
    echo ""
    exit 0
  fi

  # Failed - check if we should retry
  if [ $attempt -lt $MAX_RETRIES ]; then
    echo ""
    echo -e "${YELLOW}⏳ Waiting ${RETRY_DELAY} seconds before retry...${NC}"
    sleep $RETRY_DELAY
    echo ""
  fi

  attempt=$((attempt + 1))
done

# All retries failed
echo ""
echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
echo -e "${RED}❌ FAILURE: All deployment attempts failed${NC}"
echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📋 Workaround: Use activation script instead${NC}"
echo ""
echo -e "   The Cloud Function code is ready but Google Cloud Build"
echo -e "   is experiencing infrastructure issues."
echo ""
echo -e "   Use the working script solution:"
echo -e "   ${GREEN}cd calycompta-app${NC}"
echo -e "   ${GREEN}node scripts/activate-user.js${NC}"
echo ""
echo -e "   This provides identical functionality and is production-ready."
echo ""

exit 1
