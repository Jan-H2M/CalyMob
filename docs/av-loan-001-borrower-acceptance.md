# AV-LOAN-001 — borrower financial-liability acknowledgement (DEV)

Only the member's own material request is changed. The specific note remains
optional (500 characters). No checkbox is preselected, including on an amendment.
The app guards all request-create methods; a note and versioned acceptance with
borrower UID and server timestamp are saved in the same document write. Existing
acceptance is immutable on edits; legacy absent evidence is never backfilled.

Firestore rules require actual authenticated borrower UID, exact terms/version
and request-time timestamp. Staff cannot sign for another member, rewrite proof
or move a request to another owner. An owner may edit only submitted request
fields. Existing staff-role differences in the two repositories remain intact.
Rules must be tested in both copies; the canonical CalyCompta production rules
remain unchanged until separate approval. No new rights are granted to clients.

Calypso board must review the candidate financial-liability wording before any
production activation. The recording is technical evidence, not a legal opinion
or a determination of debt. Nothing debits an account, determines compensation
or changes a live order/payment. Existing signed handover remains distinct.

Rollout requires a compatible native release BEFORE enforcing new request rules
in production, otherwise older clients will correctly be rejected. DEV merge is
not store/public approval. For rollback, restore only the previous request rules
and client code; preserve all immutable acceptance evidence. Never mark old
requests as accepted. The local `loan-liability` scenario uses the actual form
and service against a narrowly bound in-memory write sink (not an SDK platform
mock, which is unavailable in release builds). Its displayed receipt explicitly
is not a server acknowledgement; negative rules tests use only a demo emulator.
CI smoke tests include both P1 scenarios in the actual release-compiled lab.
