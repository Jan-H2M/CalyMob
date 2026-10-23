# CalyMob

Application mobile du Calypso Diving Club.

## Repertoire

Projet mobile:

- `/Users/jan/Documents/GitHub/Calypso/CalyMob`

## Documentation

Documentation canonique partagee avec CalyCompta:

- [../CalyCompta/docs/product/auth-and-onboarding.md](/Users/jan/Documents/GitHub/Calypso/CalyCompta/docs/product/auth-and-onboarding.md)
- [../CalyCompta/docs/product/email-and-communications.md](/Users/jan/Documents/GitHub/Calypso/CalyCompta/docs/product/email-and-communications.md)
- [../CalyCompta/docs/public/privacy.md](/Users/jan/Documents/GitHub/Calypso/CalyCompta/docs/public/privacy.md)

Dans ce repo, ne garder que la documentation mobile-specifique:

- build
- publication stores
- Firebase mobile
- deep links
- biometrie


## Firestore / Storage rules and indexes

The security rules and Firestore indexes of Firebase project `calycompta` are owned by **Jan-H2M/CalyCompta** and deployed only from there. CalyMob's `firebase.json` therefore deploys Functions only. `firestore.rules`, `storage.rules` and `firestore.indexes.json` in this repo are not deployed; they remain as fixtures for the rules tests in `scripts/`. Change rules in CalyCompta.
