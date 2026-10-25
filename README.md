# Randori-Uhr

Trainingsuhr fürs Tablet (PWA) für Randori, Kakari Geiko mit Rollenwechsel und Zirkeltraining.

- Übergänge zwischen den Runden: Auto-Pause, Warten auf „Los“ oder Pause + Warten
- Gongs, Vorwarnung, eigener Wechselton
- Bildschirm bleibt an, läuft offline, Vorlagen werden auf dem Gerät gespeichert
- Steuerung per Bluetooth-Handsender: Leertaste, Enter, Bild↓, Pfeil rechts/unten = Start/Pause/Los;
  Bild↑, Pfeil links/oben = Pause bzw. Wartezeit überspringen. Optional Medientasten (Play/Pause).

## Veröffentlichen mit GitHub Pages

Settings → Pages → „Deploy from a branch“ → Branch `main`, Ordner `/ (root)`.
Danach im Chrome auf dem Tablet die Pages-Adresse öffnen und „App installieren“ wählen.

Nach Änderungen die Versionsnummer `CACHE` in `sw.js` erhöhen, damit installierte Apps das Update laden.
