# 🚨 CREATE FIRESTORE INDEX - ACTION REQUIRED

**Status**: ⚠️ BLOCKING - System cannot query transactions without this index

**Why**: Your screenshot showed an index for `bank_transactions` (old) but we need one for `transactions_bancaires` (correct French collection name).

---

## 📋 Step-by-Step Instructions

### 1. Open Firestore Indexes Page

Go to: https://console.firebase.google.com/project/calycompta/firestore/indexes

You should see the indexes page (like in your screenshot).

---

### 2. Click "Create Index" Button

- Look for the blue **"Create Index"** or **"Créer un index"** button (top right)
- Click it

---

### 3. Fill in Index Configuration

You'll see a form with these fields:

#### **Collection ID**:
```
transactions_bancaires
```
⚠️ **IMPORTANT**: Use `transactions_bancaires` (French) NOT `bank_transactions` (English)

#### **Fields to index**:

**Field 1:**
- Field path: `code_comptable`
- Query scope: Ascending

Click **"Add field"** or **"Ajouter un champ"**

**Field 2:**
- Field path: `date_execution`
- Query scope: Descending

#### **Query scope**:
- Select: **Collection**

---

### 4. Create the Index

- Click **"Create"** or **"Créer"**
- You'll see a progress indicator
- **Status will be**: "Building" → "Enabled"
- ⏱️ **Wait 2-5 minutes** for status to become **"Enabled"**

---

### 5. Verify Index is Enabled

Once the index shows **"Enabled"** status, the system is ready!

You should see in the index list:
- Collection ID: `transactions_bancaires`
- Fields indexed: `code_comptable ASC, date_execution DESC`
- Status: **Enabled** (green checkmark)

---

## 🧪 Test After Index Creation

Once the index is **Enabled**, test the system:

```bash
curl -s -X POST https://calycompta.vercel.app/api/run-communication-jobs \
  -H "Authorization: Bearer xR7mK9pL3nV8qT2wY6sB4hF1jD5gA9zE0uN3vC8xM=" \
  -H "Content-Type: application/json"
```

**Expected result**:
- ✅ Status: "All jobs executed successfully"
- ✅ `transactionsMarked: 1` (or more)
- ✅ Email received with Calypso logos
- ✅ Table showing transaction with code `618-00-732`

---

## ❓ What If Index Creation Fails?

If you see error "No indexes to be created or updated":
1. Close that popup
2. Click **"Add index"** button (different from auto-generated)
3. Manually enter the configuration above

---

## 📊 Index Configuration Summary

| Setting | Value |
|---------|-------|
| Collection ID | `transactions_bancaires` |
| Field 1 | `code_comptable` (Ascending) |
| Field 2 | `date_execution` (Descending) |
| Query scope | Collection |

---

## ✅ Checklist

- [ ] Open Firestore Indexes page
- [ ] Click "Create Index"
- [ ] Enter collection: `transactions_bancaires`
- [ ] Add field 1: `code_comptable` (Ascending)
- [ ] Add field 2: `date_execution` (Descending)
- [ ] Set query scope: Collection
- [ ] Click "Create"
- [ ] Wait 2-5 minutes for "Enabled" status
- [ ] Run test curl command
- [ ] Check email inbox for message with logos

---

**Once you've created the index and see "Enabled" status, let me know and we'll test the system!** 🚀
