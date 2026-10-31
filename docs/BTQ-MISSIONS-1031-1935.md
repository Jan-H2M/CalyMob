# Boutique member supplier missions — DEV only

Contract: [boutique-member-missions-v1](contracts/boutique-member-missions-v1.md).

CalyCompta owns the authenticated per-piece API, supplier/member links, invoice
exemption, atomic reception/stock update and read-only admin overview. CalyMob
owns Mes missions, the member check-off and optional per-expense association.
No CalyCompta access is necessary for member actions. Supplier handoff confirms
receipt by the club; it does not record delivery to the buyer. Unembroidered
arrivals stay not_ready until the existing finishing/inspection workflow.

The existing production supplier-mail implementation was reused from main, with
its durable send receipt and matching-item fingerprint. This branch changes only
the member notification wording. Preview/cancel/failure never marks ordered.
No real mail is sent during this work. Future sending remains an explicit action.

## Run the shared local DEV

Keep the two clean repo worktrees as siblings named `btq-missions-compta` and
`btq-missions-mob` (the existing task worktrees). Neither ordinary app entrypoint
is used for the DEV deployment. No .env, service account, cloud config, mobile
version bump or store workflow is needed. Existing Vercel configuration skips
non-production Git builds; it must not be changed for this task.

From CalyMob:

```sh
node scripts/build-boutique-missions-dev.mjs /Users/jan/flutter/bin/flutter
```

From CalyCompta:

```sh
npx --no-install vite build --configLoader runner --config scripts/boutique-missions-dev/vite.config.ts
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home firebase emulators:exec --only auth,firestore --project demo-btq-missions --config firebase.member-missions.json 'node scripts/boutique-missions-dev/runtime.mjs'
```

Open http://127.0.0.1:7387/admin/ and http://127.0.0.1:7387/mobile/ visibly.
The runtime refuses every emulator target except Auth 9107 and Firestore 8297
on loopback. CSP allows same-origin resources only. It has no outbound email,
payment, notification or store transport. Restarting resets only synthetic data
in `demo-btq-missions`; it never connects to the production Firebase project.
The normal CalyMob `ENV=dev` is not a substitute for this isolated entrypoint.

The Geoffroy fixture preserves the observed order shape, BTQ-2026-0106, one
Brevet 2★ homologation and the exact 31/10/2026 06:38 placement time. Customer
identity, contacts, images, prices and credentials have been removed. Synthetic
Auth users have new local IDs. The live order and live supplier are unchanged.

Check Geoffroy's own task, switch to `other` (no tasks), and Jim's two independent
pieces (En cours → Prêt → Remis). Cancelling Remis writes nothing. Completing
requires the place of handoff. Refresh admin to see the same status. The expense
shortcut in the isolated lab explains the actual app flow without submitting an
expense or triggering existing notification functions.

## Backfill

`node scripts/boutique-member-supplier-backfill.mjs --project demo-btq-missions --club calypso --mapping /path/to/explicit-mapping.json`
prints the plan. Add `--apply` to apply atomically in the loopback emulator only.
The mapping is supplier document ID → canonical member document ID. All named
members need an exact active match before any write. External suppliers default
to External. The script updates supplier types and batch snapshots, without
changing placement, quantities, dates or payment. A repeat produces no changes.
The shared DEV startup applies this migration to its synthetic fixtures.

Production backfill, production rules/API/client deployment, actual notification
sending and any TestFlight/store action remain unapproved. A cloud DEV project
would require a separately approved isolated configuration; this local runtime
must never be deployed to the existing production-backed project.
