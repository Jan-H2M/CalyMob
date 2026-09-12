# COM-076 safe rollout

Event capacity is now reserved only by the `registerForEvent` callable. Older
clients wrote directly to `operations/{operationId}/inscriptions`; those writes
cannot participate in the callable's Firestore transaction and would therefore
still be able to overbook the last place.

Deploy in this order:

1. Deploy the additive `registerForEvent,addGuestToEvent` functions. The new
   `payloadFingerprint` field is optional at this stage and is recomputed by
   the server, so the immediately preceding app remains compatible.
2. Release the matching CalyMob client and enforce its minimum version before
   closing direct writes. Confirm from callable metrics that supported clients
   have adopted both transactional registration endpoints.
3. Put event registration briefly in maintenance mode (or otherwise stop new
   registrations), wait for in-flight old-client writes to settle, then deploy
   `firestore.rules`. Ordinary direct self/guest creates now fail closed;
   authenticated administrators retain the existing explicit manual override.
4. Verify the rules with `npm run test:rules:event-registration`. This command
   is standalone: it starts an isolated Firestore emulator, executes the rule
   suite and stops the emulator again. No separately running emulator is
   required; it uses the Java runtime bundled with Android Studio on the release
   Mac.

Do not deploy the restrictive rules before the functions and adopted client:
that would unnecessarily break registration. Conversely, do not leave the
rules permissive after the forced minimum-version gate. During that mixed-client
window an old direct write cannot participate in the callable transaction and
can still race for the final place; the short maintenance gate before step 3 is
therefore mandatory, followed by a capacity audit before registrations reopen.
