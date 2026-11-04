# Backlog Randori-Uhr

Ideen für später, noch nicht umgesetzt.

## Android-App mit echtem Ducking (eigener Branch)

Zielgerät: Samsung Galaxy Tab S8.

Vorher ausprobieren (ohne Programmierung, nur Samsung-Funktionen):
- „Separater App-Sound“ (Einstellungen → Töne und Vibration): Spotify auf die Bluetooth-Box,
  die Uhr über den Tablet-Lautsprecher
- „Sound Assistant“ (Good Lock, Galaxy Store): Lautstärke pro App, Spotify leiser als die Uhr

Ziel: Spotify läuft parallel auf demselben Tablet, beim Gong wird die Musik automatisch leiser.

- Die Uhr als Android-App verpacken (App-Hülle mit WebView um die vorhandene Web-App)
- Vor jedem Gong kurzzeitig Audio-Fokus „vorübergehend, andere dürfen leiser werden“ anfordern,
  danach wieder freigeben: Android regelt Spotify dann selbst kurz herunter
- Lautstärketasten in der App abfangen: Selfie-Stick funktioniert direkt, ohne Button Mapper und Medientasten
- APK automatisch mit GitHub Actions bauen, Installation per „Unbekannte Apps erlauben“
- Die PWA auf `main` bleibt unverändert

## Musik im Zirkel

- Eigene Musikdateien (z. B. MP3 vom Tablet) auswählen, die Uhr spielt sie selbst ab
- Musik nur in der Arbeitsphase, in der Pause leise oder aus
- Ducking beim Gong ist hier auch ohne Android-App möglich, weil die Uhr die Musik selbst steuert
- Selfie-Stick über Medientasten bleibt nutzbar

## Signale, die sich gegen Musik durchsetzen

- Auswahl des Signaltons: Gong / Hupe / Pfiff (höhere, schärfere Töne)
- Bildschirm blinkt beim Rundenwechsel mehrmals hell auf
- Vorwarnung lauter oder länger

## Fernbedienung

- Presenter (Bluetooth, sendet Bild↑/↓) funktioniert ohne Medientasten und verträgt sich mit Spotify
- Selfie-Stick sendet „Lauter“: in der Web-App nur über Button Mapper → Play/Pause, kollidiert mit Spotify

## Branch `kanji-deko`: gesammelte Rückmeldungen (umgesetzt in Version 24)

- Mate / Hajime auf dem Hauptknopf nur während der Kampfzeit. Bei „Pause · Partner wechseln“,
  beim Rollenwechsel und im Vorlauf („Gleich geht’s los“) ergibt das keinen Sinn,
  dort neutral „Anhalten / Weiter“.
- Großer Hajime-Knopf bei „Neue Partner suchen“ bleibt so (startet wirklich die nächste Runde).
- Kanji bei Tori / Uke (取り / 受け) eher wieder wegnehmen.
- Kanji 始め am großen Hajime-Knopf bei „Neue Partner suchen“ wirkt zu schwach (zu blass, zu klein):
  kräftiger darstellen. Der kleine Hauptknopf unten bleibt wie er ist.
- „Mate · unterbrochen“ ist doppelt gemoppelt: nur „Mate“.
- Zirkel: Hauptknopf durchgehend neutral „Anhalten / Weiter“ (kein Kampf, also kein Mate / Hajime).
- Oben „Hajime“ während der Randori-Runde bleibt so.
- Kakari: oben „Partner A ist Tori“ statt „A ist Tori“ (ebenso in der „Danach“-Zeile).
- Technisch: Kopfzeile auf dem Handy mit eingeschalteten Medientasten prüfen; alte Stilregeln der Versionsanzeige entfernen.
- Oben „Hajime“ nur kurz zum Rundenbeginn (etwa so lange, wie man das Kommando ruft, 2–3 s),
  dann ausblenden. „Mate“ oben, solange die Uhr unterbrochen ist. Knöpfe bleiben Mate / Hajime.

## Neuer Modus „Eigener Ablauf“ (später, eigener Branch)

Beispiel: 2:00 Uchikomi-Form, kurze Pause, 1:00 Bodentechnik – erst für Partner A, dann für Partner B,
danach Partnerwechsel. Keine feste Übungsform, sondern frei zusammenstellbar.

- Abschnitte frei anlegen: Name + Dauer (z. B. „Uchikomi 2:00“, „Boden 1:00“)
- Kurze Pause zwischen den Abschnitten (z. B. 0:10)
- Ablauf für Partner A und B wiederholen (wie Rollenwechsel bei Kakari), mit Zeit für den Wechsel
- Runden = Partnerwechsel, Übergang wie gehabt: Auto-Pause / Warten / Pause + Warten
- Als Vorlage speichern

Struktur (von klein nach groß):

| Ebene | Was es ist | Beispiel |
|---|---|---|
| Abschnitt | Eine Übung mit Name und Dauer | Uchikomi 2:00, Boden 1:00 |
| Durchgang | Alle Abschnitte nacheinander, kurze Pause dazwischen; optional für A und dann B | A: Uchikomi + Boden, B: dasselbe |
| Runde | Ein Partner, danach Partnerwechsel (Auto-Pause / Warten / Pause + Warten) | 4 Runden = 4 Partner |
| Satz (optional, Standard 1) | Mehrere Runden als Block, danach längere Satzpause | 2 Sätze à 4 Runden, 3:00 Satzpause |

- Begriffe deutsch lassen (Abschnitt, Runde, Satz); kein gängiger japanischer Judo-Begriff für Runde/Satz
- Beim Anlegen eines Abschnitts Namen zum Antippen: Uchikomi, Nagekomi, Tachi-waza, Ne-waza, Randori,
  Kakari Geiko oder eigener Name
- Name des Modus: „Eigene Routine“, Deko-Kanji 稽古 (Keiko)
- Kakari ist ein Sonderfall (ein Abschnitt, für A und B); später ggf. als feste Vorlage darin aufgehen lassen
