# COM-147 — guest opt-in for all callers

Jan confirmed on 28 October 2026 that a disabled guest policy applies equally
to members, instructors, organizers and administrators. Existing registrations
are not deleted or reclassified.

- `addGuestToEvent` checks explicit `allow_guests == true` before either the
  linked-member or standalone-staff creation path, inside the transaction.
- An already successful idempotent receipt still returns its existing result;
  it does not create another guest after opt-out.
- Mobile guest actions and the open dialog obey the same policy. Normal free
  guest registrations remain available when explicitly allowed.
- The paired CalyCompta candidate guards create and member-to-guest conversion
  in canonical rules, plus both web entry points. It retains existing guests.

Verification: 73 callable tests, 21 focused Flutter tests green. The paired web
candidate has 4 widget tests, TypeScript and 44 genuine local rules-emulator
checks green; all 61 existing MOB-044 accounting-rule checks also remain green.
All fixtures are synthetic; no Firebase login, real inscription, member,
payment, tariff, notification, deployment or publication. Independent exact
candidate review and the consolidated release checks remain required.
