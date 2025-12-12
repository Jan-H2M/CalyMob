# Incident Report: Verloren Code - 12 december 2025

## Samenvatting
Na ~12 uur werk aan maritieme thema-verbeteringen voor CalyMob is een significant deel van de code verloren gegaan door een combinatie van factoren.

## Wat er gebeurd is (Chronologie)

### Fase 1: Productieve sessie (vorige context)
Er werd uitgebreid gewerkt aan:
- **Splash animatie** op profile screen
- **Sea turtle** animatie op operations list
- **Seaweed animaties** decoratief
- **Bubbles** op login screen
- **Jellyfish** op Communication screen
- **Who is Who** page met glass-effect cards
- **Landing screen** met:
  - Ocean wave background
  - GlossyButton widgets
  - 4 zwemmende vissen (Lottie animaties)
  - Visjes die uit het water springen in het witte gebied

### Fase 2: Context verloren
De Claude Code sessie liep uit context (AI geheugen limiet). Dit is normaal, maar het probleem was dat de laatste wijzigingen NIET gecommit waren naar Git.

### Fase 3: Git index.lock fout
Bij poging tot backup verscheen:
```
fatal: Unable to create '.git/index.lock': File exists
```

### Fase 4: Fatale fout - `git restore .`
Om de index.lock op te lossen, werd uitgevoerd:
```bash
rm -f .git/index.lock
git restore .
```

**Dit was de kritieke fout.** `git restore .` zet ALLE niet-gecommitte wijzigingen terug naar de laatste commit. Alle 12 uur werk was in één commando weg.

### Fase 5: Herstelpoging
De landing screen werd opnieuw geschreven op basis van:
- Screenshots die de gebruiker had gemaakt
- Beschrijvingen van de gewenste functionaliteit
- Kennis uit de vorige sessie (samenvatting)

### Fase 6: `flutter clean` problemen
Na `flutter clean` worden alle assets niet meer gevonden in Chrome. De assets bestaan wel in de filesystem maar laden niet.

## Wat WEL bewaard is gebleven

### Git commits die gemaakt zijn:
```
d9763d8 fix: Use correct asset name backgroundWave
701e1eb fix: Move fish to white area - jumping out of water effect
d4abb36 feat: Add 4 swimming fish at different times and depths in ocean area
36e2ef4 feat: Restore maritime landing screen with glossy buttons and swimming fish
50cf593 feat: Add maritime Lottie animations and glass-effect UI
```

### Bestanden die veilig zijn:
- `/lib/screens/home/landing_screen.dart` - Hersteld met 4 visjes
- `/lib/widgets/glossy_button.dart` - GlossyButton widget
- `/lib/config/app_assets.dart` - Asset paths
- `/lib/screens/announcements/announcements_screen.dart` - Met jellyfish
- `/lib/screens/profile/who_is_who_screen.dart` - Met glass effect
- Alle Lottie animatie bestanden in `assets/animations/`

## Wat VERLOREN is

Het is onduidelijk welke specifieke code verloren is omdat:
1. De exacte staat voor `git restore .` niet gedocumenteerd was
2. De sessie-context eindigde voordat alles gecommit was

Mogelijke verloren items:
- Fijnafstellingen aan animaties
- Specifieke styling details
- Andere screens die bewerkt waren

## Root Cause Analyse

| Factor | Impact | Preventie |
|--------|--------|-----------|
| **AI Context Compactering** | **KRITIEK** | **Commit VOOR context vol raakt** |
| Geen frequente commits | Hoog | Commit elke 30 min of na elke feature |
| `git restore .` zonder check | Kritiek | NOOIT `git restore .` uitvoeren |
| Context verlies AI | Medium | Maak backups voor sessie eindigt |
| Geen lokale backup | Hoog | Time Machine / git stash gebruiken |

## Het Compactering Probleem (BELANGRIJK)

### Wat is Context Compactering?
Claude Code heeft een beperkte "context window" - hoeveel informatie hij kan onthouden. Wanneer de conversatie te lang wordt:
1. De oude berichten worden **samengevat** (gecompacteerd)
2. Details gaan verloren in de samenvatting
3. Claude kan niet meer exact herinneren wat er gedaan is
4. Als code niet gecommit was, is die kennis WEG

### Waarom dit kritiek is
- Claude kan 12 uur aan werk doen
- Maar als dat niet gecommit is, en de context compacteert...
- Dan heeft Claude alleen een vage samenvatting
- De exacte code wijzigingen zijn VERLOREN

### Signalen dat compactering komt
- Lange sessie (meerdere uren)
- Veel bestanden gelezen/bewerkt
- Veel ToolUse outputs
- Claude zegt "context is running low" of iets dergelijks

### Preventie
**VOOR de context vol raakt:**
1. Vraag Claude om ALLES te committen
2. Push naar GitHub
3. Maak een samenvatting document
4. Start een nieuwe sessie

**Regel:** Na 2-3 uur werk of na complexe features, ALTIJD committen!

## Preventieve Maatregelen

### 1. Git Workflow Verbeteringen
```bash
# NOOIT DOEN:
git restore .          # Verliest ALLE uncommitted changes!
git checkout .         # Zelfde effect
git reset --hard       # Nog gevaarlijker

# ALTIJD EERST DOEN:
git stash              # Bewaart wijzigingen veilig
git diff > backup.patch  # Maakt patch bestand
```

### 2. Frequente Commits
- Commit na elke werkende feature
- Commit na elke 30-60 minuten werk
- Gebruik beschrijvende commit messages

### 3. Backup Strategie
```bash
# Maak backup voor grote operaties:
git stash push -m "backup voor [actie]"

# Of maak een patch:
git diff > ~/Desktop/backup-$(date +%Y%m%d-%H%M).patch
```

### 4. Time Machine
Zorg dat macOS Time Machine actief is voor automatische backups.

### 5. Git hooks (optioneel)
Maak een pre-commit hook die waarschuwt bij grote uncommitted changes.

## Huidige Status

### Wat werkt:
- Landing screen code is hersteld
- 4 visjes met verschillende groottes en starttijden
- GlossyButtons voor navigatie
- Commits zijn gepusht naar GitHub

### Wat nog opgelost moet worden:
- Assets laden niet in Chrome na `flutter clean`
- Testen op iOS device nodig

## Geleerde Lessen

1. **Commit vaak, commit vroeg** - Liever 20 kleine commits dan 1 grote
2. **Gebruik `git stash`** - Nooit `git restore .` zonder stash
3. **Maak screenshots** - De screenshots hebben het herstel mogelijk gemaakt
4. **Documenteer je werk** - Schrijf op wat je gedaan hebt

## Actie Items

- [ ] Test app op iOS device
- [ ] Fix Chrome asset loading issue
- [ ] Maak commit
- [ ] Push naar GitHub
- [ ] Overweeg git hooks voor bescherming

---

*Dit rapport is gemaakt om te voorkomen dat dit ooit nog gebeurt.*
