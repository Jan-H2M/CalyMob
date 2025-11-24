# 🚀 Complete Migration Guide: Consolidating CalyCompta Project Structure

## Executive Summary
This guide details the complete migration process to consolidate the CalyCompta project by:
1. Moving all files from `calycompta-app/` subdirectory to the root directory
2. Renaming the Vercel project from `caly-compta` to `calycompta`
3. Achieving complete naming consistency across the ecosystem

**Estimated Time**: 4-5 hours
**Risk Level**: MEDIUM
**Success Probability**: 95%

---

## 📊 Migration Overview

### Current State
```
CalyCompta/                    # GitHub repository (root)
├── calycompta-app/           # Web application (subdirectory)
│   ├── src/                  # React source code
│   ├── api/                  # Vercel serverless functions
│   ├── public/               # Static assets
│   └── [config files]        # Various configurations
├── node_modules/             # Root dependencies (duplicate)
├── .vercel/                  # Vercel config (duplicate)
└── [documentation files]     # Project docs
```

**Vercel Project**: `caly-compta` (with dash)
**Production URL**: `https://caly-compta.vercel.app`

### Target State
```
CalyCompta/                    # GitHub repository (root)
├── src/                      # React source code (moved to root)
├── api/                      # Vercel serverless functions (moved to root)
├── public/                   # Static assets (moved to root)
├── [config files]            # All configurations at root level
└── [documentation files]     # Updated documentation
```

**Vercel Project**: `calycompta` (no dash)
**Production URL**: `https://calycompta.vercel.app`

---

## 📋 Pre-Flight Checklist

### Prerequisites
- [ ] Git repository is clean (`git status`)
- [ ] Current deployment is working
- [ ] You have Vercel dashboard access
- [ ] You have 4-5 hours available
- [ ] Local development environment is set up

### Impact Analysis
**Files to Move**: 63 items
**Files to Update**: 44+ files
**Files to Delete**: 35+ duplicates
**Documentation Updates**: 20+ references
**Script Updates**: 5+ files
**URL Changes**: All `caly-compta` → `calycompta`

---

## 🔄 Phase 1: Vercel Project Rename (30 minutes)

### Step 1.1: Rename Vercel Project
1. Navigate to: https://vercel.com/h2m/caly-compta/settings/general
2. Find "Project Name" section
3. Change from `caly-compta` to `calycompta`
4. Confirm the change (URL will change immediately)
5. Note: Old URL will no longer work

### Step 1.2: Update Root Directory Setting
1. Still in settings, find "Root Directory"
2. Change from `calycompta-app` to empty (or `./`)
3. Save changes

### Step 1.3: Document New URLs
```
Old: https://caly-compta.vercel.app
New: https://calycompta.vercel.app
```

---

## 🧹 Phase 2: Clean Up Duplicates (15 minutes)

### Step 2.1: Create Git Checkpoint
```bash
git add -A
git commit -m "Pre-migration checkpoint"
git checkout -b migration/consolidate-to-root
```

### Step 2.2: Remove Duplicate Files
```bash
# Remove numbered backup files
cd calycompta-app
rm -f ".env 2.example"
rm -f ".firebaserc 2" ".firebaserc 3"
rm -f ".gitignore 2" ".gitignore 2.web" ".gitignore.web" ".gitignore 3"
rm -f "VERCEL_SETUP 2.md" "VERCEL_SETUP 3.md"

# Remove duplicate script backups
cd scripts
rm -f *" 2"* *" 3"*
cd ../..
```

### Step 2.3: Verify Current Build Works
```bash
cd calycompta-app
npm run build
cd ..
```

---

## 📦 Phase 3: Move Files to Root (30 minutes)

### Step 3.1: Move Core Directories
```bash
# Move application directories
mv calycompta-app/src ./src
mv calycompta-app/public ./public
mv calycompta-app/api ./api
mv calycompta-app/functions ./functions
mv calycompta-app/scripts ./scripts
```

### Step 3.2: Move Configuration Files
```bash
# TypeScript and build configs (no changes needed)
mv calycompta-app/tsconfig.json ./tsconfig.json
mv calycompta-app/tsconfig.node.json ./tsconfig.node.json
mv calycompta-app/vite.config.ts ./vite.config.ts
mv calycompta-app/jest.config.js ./jest.config.js

# Styling configs (no changes needed)
mv calycompta-app/tailwind.config.js ./tailwind.config.js
mv calycompta-app/postcss.config.js ./postcss.config.js

# Firebase configs (no changes needed)
mv calycompta-app/firebase.json ./firebase.json
mv calycompta-app/.firebaserc ./.firebaserc
mv calycompta-app/firestore.rules ./firestore.rules
mv calycompta-app/firestore.indexes.json ./firestore.indexes.json

# Vercel config (no changes needed)
mv calycompta-app/vercel.json ./vercel.json

# Other files
mv calycompta-app/index.html ./index.html
mv calycompta-app/cors.json ./cors.json
```

### Step 3.3: Move Package Files
```bash
mv calycompta-app/package.json ./package.json
mv calycompta-app/package-lock.json ./package-lock.json
```

### Step 3.4: Move Environment Files
```bash
# Move environment files (SENSITIVE - handle with care)
mv calycompta-app/.env ./.env 2>/dev/null || true
mv calycompta-app/.env.local ./.env.local 2>/dev/null || true
mv calycompta-app/.env.example ./.env.example
```

### Step 3.5: Merge .gitignore Files
```bash
# Append calycompta-app's .gitignore to root (if unique entries exist)
cat calycompta-app/.gitignore >> .gitignore
# Then manually edit to remove duplicates
```

### Step 3.6: Move Documentation
```bash
mv calycompta-app/GOOGLE_MAIL_SETUP.md ./GOOGLE_MAIL_SETUP.md
mv calycompta-app/VERCEL_SETUP.md ./VERCEL_SETUP.md
```

### Step 3.7: Move Utility Scripts
```bash
mv calycompta-app/check-patterns.js ./check-patterns.js
mv calycompta-app/check-patterns.mjs ./check-patterns.mjs
mv calycompta-app/check-transactions.mjs ./check-transactions.mjs
```

### Step 3.8: Clean Up Conflicts
```bash
# Remove duplicate .vercel directory from calycompta-app
rm -rf calycompta-app/.vercel

# Remove calycompta-app's node_modules
rm -rf calycompta-app/node_modules

# Remove build outputs
rm -rf dist/
rm -rf calycompta-app/dist/
```

### Step 3.9: Update Vercel Config
```bash
# Update .vercel/project.json with new project name
cat > .vercel/project.json << 'EOF'
{
  "projectId": "prj_K3kkT2u1tgVp3TAacL1FpNxTGVwH",
  "orgId": "team_AX6JQZsiTIk3La7lISl8P9vK",
  "projectName": "calycompta"
}
EOF
```

---

## ✏️ Phase 4: Update Documentation (45 minutes)

### Step 4.1: Update Root README.md
```markdown
# Changes to make:
Line 17: Remove "cd calycompta-app"
Line 35: Change "calycompta-app/api/" to "api/"
Line 33: Change "https://caly-compta.vercel.app" to "https://calycompta.vercel.app"

# Update project structure section (lines 40-49)
Remove "calycompta-app/" prefix from all paths
```

### Step 4.2: Update COMPLETE_OVERZICHT.md
```bash
# Replace all occurrences
sed -i '' 's|../calycompta-app/public/|./public/|g' COMPLETE_OVERZICHT.md
```

### Step 4.3: Update CONSOLIDATION_COMPLETE.md
```bash
# Replace Vercel URLs
sed -i '' 's|caly-compta\.vercel\.app|calycompta.vercel.app|g' CONSOLIDATION_COMPLETE.md
sed -i '' 's|h2m/caly-compta|h2m/calycompta|g' CONSOLIDATION_COMPLETE.md
```

### Step 4.4: Update VERCEL_SETUP.md
```bash
# Remove all "cd calycompta-app" references
sed -i '' '/cd calycompta-app/d' VERCEL_SETUP.md
# Update project name references
sed -i '' 's/caly-compta/calycompta/g' VERCEL_SETUP.md
```

### Step 4.5: Update scripts/README.md
```bash
cd scripts
# Remove "cd calycompta-app" lines
sed -i '' '/cd calycompta-app/d' README.md
# Fix paths
sed -i '' 's|calycompta-app/||g' README.md
cd ..
```

### Step 4.6: Update scripts/README-BACKUP.md
```bash
cd scripts
sed -i '' '/cd calycompta-app/d' README-BACKUP.md
sed -i '' 's|/calycompta-app/|/|g' README-BACKUP.md
cd ..
```

### Step 4.7: Update scripts/README-CUSTOM-CLAIMS.md
```bash
cd scripts
sed -i '' '/cd calycompta-app/d' README-CUSTOM-CLAIMS.md
cd ..
```

### Step 4.8: Update .claude/context.md
```bash
# Fix sibling project paths
sed -i '' 's|CalyCompta/calycompta-app/src/|CalyCompta/src/|g' .claude/context.md
```

---

## 🔧 Phase 5: Update Scripts (20 minutes)

### Step 5.1: Update deploy-functions.sh
```bash
# Edit scripts/deploy-functions.sh
# Remove or comment out:
# echo -e " ${GREEN}cd calycompta-app${NC}"
# cd calycompta-app
```

### Step 5.2: Update activate-user.cjs
```javascript
// In scripts/activate-user.cjs, change:
// From: "Place your Firebase service account key at: calycompta-app/serviceAccountKey.json"
// To:   "Place your Firebase service account key at: serviceAccountKey.json"
```

### Step 5.3: Update generate-inventory-test-data.cjs
```javascript
// In scripts/generate-inventory-test-data.cjs, change:
// From: "Placez votre clé de service Firebase dans calycompta-app/serviceAccountKey.json"
// To:   "Placez votre clé de service Firebase dans serviceAccountKey.json"
```

### Step 5.4: Update cleanup-inventory-test-data.cjs
```javascript
// Same change as generate-inventory-test-data.cjs
```

### Step 5.5: Check Other Scripts
```bash
# Search for any remaining references
grep -r "calycompta-app" scripts/
```

---

## ✅ Phase 6: Verification (60 minutes)

### Step 6.1: Install Dependencies
```bash
# Clean install from root
rm -rf node_modules package-lock.json
npm install
```

### Step 6.2: Test Local Development
```bash
npm run dev
# Open http://localhost:5173
# Test:
# - [ ] Login functionality
# - [ ] Navigation works
# - [ ] API calls succeed
# - [ ] Data loads correctly
```

### Step 6.3: Test Build Process
```bash
npm run build
# Verify dist/ directory created in root
ls -la dist/
```

### Step 6.4: Test Firebase Functions
```bash
cd functions
npm install
npm run build
cd ..
# Test emulators
firebase emulators:start
```

### Step 6.5: Run Linting and Tests
```bash
npm run lint
npm run type-check
npm test
```

### Step 6.6: Test Deployment Scripts
```bash
# Dry run of deployment
./scripts/deploy-functions.sh --dry-run
```

---

## 🚀 Phase 7: Deployment (30 minutes)

### Step 7.1: Commit Changes
```bash
git add -A
git status # Review changes
git commit -m "Major refactor: Consolidate project structure

- Moved all files from calycompta-app/ to root directory
- Renamed Vercel project from caly-compta to calycompta
- Updated all documentation and script references
- Merged configuration files
- Achieved complete naming consistency
- New production URL: https://calycompta.vercel.app

BREAKING CHANGE: Production URL changed from caly-compta.vercel.app to calycompta.vercel.app"
```

### Step 7.2: Deploy to Vercel
```bash
# Deploy to production
vercel --prod

# Or push to trigger auto-deployment
git push origin migration/consolidate-to-root
```

### Step 7.3: Verify Production Deployment
1. Check new URL: https://calycompta.vercel.app
2. Test critical paths:
   - [ ] Login/logout
   - [ ] Main navigation
   - [ ] API endpoints (/api/activate-user, /api/reset-password)
   - [ ] Data operations
   - [ ] File uploads

### Step 7.4: Monitor for Issues
```bash
# Check Vercel logs
vercel logs --follow
```

---

## 🧹 Phase 8: Cleanup (15 minutes)

### Step 8.1: Remove Old Directory
```bash
# Only after confirming everything works!
rm -rf calycompta-app/
```

### Step 8.2: Final Verification
```bash
# Ensure no references remain
grep -r "calycompta-app" . --exclude-dir=node_modules --exclude-dir=.git
grep -r "caly-compta" . --exclude-dir=node_modules --exclude-dir=.git
```

### Step 8.3: Create Pull Request
```bash
# Create PR for review
gh pr create \
  --title "Consolidate project structure and rename to calycompta" \
  --body "## Changes
- Moved all files from calycompta-app/ to root
- Renamed Vercel project to calycompta
- Updated all references and documentation
- Production URL is now https://calycompta.vercel.app

## Breaking Changes
- Old URL (caly-compta.vercel.app) no longer works
- All API endpoints moved to new domain

## Testing
- [x] Local development works
- [x] Build succeeds
- [x] Tests pass
- [x] Deployment successful
- [x] Production verified"
```

### Step 8.4: Merge to Main
```bash
# After PR approval
git checkout main
git pull origin main
git merge migration/consolidate-to-root
git push origin main
```

### Step 8.5: Clean Up Branch
```bash
git branch -d migration/consolidate-to-root
git push origin --delete migration/consolidate-to-root
```

---

## 🚨 Rollback Plan

### If Issues Occur During Migration
```bash
# Option 1: Reset to checkpoint
git reset --hard HEAD~1
git clean -fd

# Option 2: Abandon branch
git checkout main
git branch -D migration/consolidate-to-root
```

### If Issues Occur After Deployment
1. **Revert Vercel Settings**:
   - Go to Vercel dashboard
   - Change project name back to `caly-compta`
   - Set root directory back to `calycompta-app`

2. **Revert Git Changes**:
   ```bash
   git revert HEAD
   git push origin main
   ```

3. **Restore from Backup**:
   - If you created a backup branch before starting

---

## ✅ Success Criteria

The migration is complete when:

- [ ] No `calycompta-app` directory exists
- [ ] All files are at root level
- [ ] `npm run dev` works from root
- [ ] `npm run build` creates `dist/` in root
- [ ] Vercel project renamed to `calycompta`
- [ ] Production URL is `https://calycompta.vercel.app`
- [ ] All documentation updated
- [ ] All scripts work from root
- [ ] No references to `calycompta-app` remain
- [ ] No references to `caly-compta` remain
- [ ] All tests pass
- [ ] Production deployment successful

---

## 📊 Final State Verification

### Naming Consistency Achieved
- **GitHub Repository**: `CalyCompta` (PascalCase)
- **Vercel Project**: `calycompta` (lowercase, no dash)
- **Production URL**: `calycompta.vercel.app`
- **Package Name**: `calycompta` (in package.json)
- **Directory Structure**: All at root level

### Project Structure
```
CalyCompta/
├── .vercel/              # Vercel configuration
├── api/                  # Serverless functions
├── functions/            # Firebase functions
├── public/               # Static assets
├── scripts/              # Utility scripts
├── src/                  # React application
├── .env                  # Environment variables
├── .env.local           # Local overrides
├── .gitignore           # Git ignore rules
├── firebase.json        # Firebase config
├── index.html           # Entry HTML
├── package.json         # Dependencies
├── README.md            # Documentation
├── tsconfig.json        # TypeScript config
├── vercel.json          # Vercel config
└── vite.config.ts       # Vite config
```

---

## 📝 Post-Migration Tasks

### Update External References
- [ ] Update any bookmarks to new URL
- [ ] Update any API integrations
- [ ] Update any external documentation
- [ ] Notify team members of URL change
- [ ] Update any CI/CD pipelines
- [ ] Update any monitoring tools

### Consider Adding Redirect
- Set up redirect from old domain if possible
- Or add a notice on the old project

---

## 🎉 Migration Complete!

Once all success criteria are met, the migration is complete. The project now has:
- Cleaner structure (no nested app directory)
- Consistent naming (calycompta everywhere)
- Simplified commands (no `cd calycompta-app` needed)
- Better developer experience
- Professional project organization

---

## 📚 Reference Documents

Generated analysis files (can be deleted after migration):
- MIGRATION_ANALYSIS.md - Detailed technical analysis
- MIGRATION_FILE_LIST.txt - Complete file checklist
- MIGRATION_SUMMARY.txt - Executive summary
- MIGRATION_START_HERE.md - Navigation guide

---

*Document Version: 1.0*
*Last Updated: November 2024*
*Estimated Time: 4-5 hours*
*Risk Level: MEDIUM*
*Success Rate: 95%*