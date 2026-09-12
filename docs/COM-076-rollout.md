# COM-076 safe rollout

Event capacity is now reserved only by the `registerForEvent` callable. Older
clients wrote directly to `operations/{operationId}/inscriptions`; those writes
cannot participate in the callable's Firestore transaction and would therefore
still be able to overbook the last place.

Deploy in this order:

1. Deploy `firestore.rules`. Ordinary direct self/guest creates then fail
   closed. Existing registrations remain readable and keep their permitted
   non-accounting owner updates; authenticated administrators retain manual
   registration.
2. Verify the rules with `npm run test:rules:event-registration`. This command
   is standalone: it starts an isolated Firestore emulator, executes the rule
   suite and stops the emulator again. No separately running emulator is
   required; it uses the Java runtime bundled with Android Studio on the release
   Mac.
3. Deploy `registerForEvent,addGuestToEvent`.
4. Release the matching CalyMob client.

Do not deploy the callable before the rules. The brief interval after step 1 is
intentionally fail-closed for member self-registration; it cannot overbook.
