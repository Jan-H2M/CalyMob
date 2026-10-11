# Eén CalyMob-testaccount met echte gegevens

Werkitem QA-002. Jan heeft één vaste technische aanmelding gevraagd waarmee Codex zichtbaar zelfstandig kan inloggen en het profiel kan wisselen. Geen oude testaccounts herstellen, geen andere leden hergebruiken en geen appstore-reviewaccount aanpassen.

## Identiteit en opslag

- Firebase-project: `calycompta`; club: `calypso`.
- Vast UID: `calymob-qa-jan`; aanmelding: `qa.roles@calypsodc.be`.
- Het willekeurige wachtwoord staat alleen in macOS Sleutelhanger: service `club.caly.calymob.qa`, account het bovenstaande e-mailadres. Het wordt nooit door het script afgedrukt en staat niet in Git, logs of gedeeld geheugen.
- Controleer toegang tot deze specifieke Sleutelhanger-entry bij het aanmelden. Publiceer de waarde niet in chat of tooloutput. Nieuwe toestemmingsdialogen vereisen zo nodig Jans medewerking.
- Sleutelhangerverlies of een geblokkeerd account is geen garantie op automatische toegang: stop en herstel uitsluitend dit technische account via een bevoegde beheerder. Rotatie van het wachtwoord is een afzonderlijke herstelactie, niet stilzwijgend onderdeel van profielwisselen.

## Voorwaarde: afscherming eerst online

Publicatie van `syncMemberProjections` en `updateBirthdaySharing` vereist afzonderlijke toestemming. Beide moeten expliciet gemarkeerde testaccounts uit de publieke directory houden voordat dit account wordt aangemaakt. Een voorkeurwijziging of opnieuw afgeleverde achtergrondtrigger mag de publieke kaart niet terugzetten. De private Auth-/ledenidentiteit blijft behouden. Voer geen algemene productiebackfill of opschoning van andere accounts uit.

## Aanmaken of wisselen

Gebruik de bestaande veilig opgeslagen serviceaccountreferentie via `QA_SERVICE_ACCOUNT_FILE`; nooit de sleutel kopiëren naar deze werkboom. De standaardopdracht is alleen inspectie:

```sh
NODE_PATH="$PWD/functions/node_modules" node scripts/qa/single-live-account.cjs
```

Na toestemming, geverifieerde serverpublicatie en onafhankelijke review:

```sh
NODE_PATH="$PWD/functions/node_modules" node scripts/qa/single-live-account.cjs --apply --visibility-ready --operator=BEVOEGDE_BEHEERDER_UID --profile=mc
```

Vaste profielen: `mc` (Encadrant E + MC), `encadrant` (E + 4★), `piscine` (Encadrants et assistants P + 4★), `am` (P + AM) en `eleve` (Membre + 1★). De applicatierol blijft `user`; MC is een duikniveau, geen administratierol. Een admin-/financieel profiel hoort niet bij deze basisinrichting en vereist specifiek afgesproken uitbreiding.

Het script werkt uitsluitend op het vaste UID/e-mailadres en stopt bij botsingen. Aanmaak en elke wissel worden in `clubs/calypso/audit_logs` vastgelegd met bevoegde operator, uitvoering door Codex en vorige/nieuwe functie en niveau. Tokens worden ingetrokken; daarna opnieuw aanmelden via de normale app. Het wachtwoord verandert niet bij een profielwissel. Bij een gedeeltelijke fout kan de technische account uit veiligheid uitgeschakeld blijven; niet opnieuw een tweede account maken.

## Zichtbaar testen

### Automatisch aanmelden op deze Mac

Gebruik de lokale hulp `scripts/qa/live-preview-login.cjs`, met de bestaande
beveiligde serviceaccountreferentie in `QA_SERVICE_ACCOUNT_FILE` en de bestaande
volledige productieverbonden Flutter-releasebuild:

```sh
NODE_PATH="$PWD/functions/node_modules" node scripts/qa/live-preview-login.cjs --web-root=/ABSOLUUT/PAD/NAAR/build/web
```

Open zichtbaar `http://localhost:7359/__qa/login`. De hulp controleert eerst het
vaste verborgen actieve account, functie Encadrant, niveau MC en gewone
gebruikersrechten. Ze verandert geen rollen of accounts. Eén kortlevende
same-origin POST met nonce haalt het wachtwoord rechtstreeks uit Sleutelhanger;
de officiële Firebase SDK voert normale e-mail/wachtwoordaanmelding uit. De SDK
bewaart de gewone sessie op deze aparte lokale oorsprong; daarna opent dezelfde
volledige Flutter-build. Geen handmatige tokeninjectie, custom token,
admin-impersonatie of demo-authenticatie. Andere lokale app-oorsprongen en Jans
eigen sessie blijven gescheiden.

De hulp luistert alleen op loopback, weigert vreemde Host-/Origin-headers,
cross-site requests, frames, CORS en hergebruik. De aanmeldroute is na maximaal
120 seconden of één poging gesloten. Het wachtwoord staat niet in URL, Git,
stdout, logs of bestanden; het gaat alleen kort door geheugen naar de normale
Firebase-aanmelding. Start de hulp opnieuw als opnieuw aanmelden nodig is. De
beveiligde Sleutelhanger moet toegankelijk blijven; macOS kan bij gewijzigde
toegangsrechten alsnog Jans lokale bevestiging vragen. Verzwak geen OS-beveiliging
en roteer het wachtwoord niet automatisch. Stoppen van de hulp beëindigt de lokale
assetserver. Log bij gedeeld Mac-gebruik ook uit in de app.

De app start normaal altijd op `LoginScreen`, zelfs met een bestaande Firebase-
sessie. Bouw daarom voor deze lokale start eenmaal de volledige normale app met
`flutter build web --release --dart-define=CALYMOB_LIVE_QA_AUTOSTART=true`.
Deze opt-in herstelt uitsluitend op `http://localhost:7359` de echte sessie van
het vaste verborgen MC-account. De private ledengegevens worden opnieuw met de
gewone Firebase-rechten geladen en gecontroleerd vóór normale navigatie naar het
startscherm. Andere gebruikers, omgevingen en appstore-builds blijven ongewijzigd;
zonder de compile-time opt-in is deze overgang uitgeschakeld. Een vereiste
wachtwoordwijziging wordt niet omzeild.

Dit is een lokale testvoorziening, niet ingeschakeld in een appstore-release.
De JS SDK-versie volgt `firebase_core_web` (momenteel 12.3.0).
De bestaande serviceaccountreferentie wordt uitsluitend voor read-only
preflight gebruikt, nooit aan de browser doorgegeven. Alle echte appgegevens
worden vervolgens met de gewone rechten van het aangemelde QA-account geladen.

Gebruik de volledige normale Flutter-app, zonder `CALYMOB_LOCAL_QA`, op de productieverbonden preview. Controleer browser, oorsprong, technische identiteit en huidig profiel vóór handelingen. Het aparte emulatorpaneel op 7358 heeft fictieve dossiers en is niet deze aanmelding.

Bekijk eerst alleen de echte leerlingen en voortgang. Toegang hebben is geen opdracht om echte dossiers te wijzigen, financiële acties te doen of berichten te versturen. Voer zulke handelingen alleen uit binnen Jans concrete opdracht. Schrijf nooit synthetische leerlinggegevens naar productie. Het testaccount blijft buiten de gewone directory, zoek- en daarop gebaseerde leerlinglijsten; bevoegde beheerders kunnen de private technische identiteit wel beheren.
