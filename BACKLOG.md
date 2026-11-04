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
- (umgesetzt in Version 26) Oben „Hajime“ nur kurz zum Rundenbeginn (etwa so lange, wie man das Kommando ruft, 2–3 s),
  dann ausblenden. „Mate“ oben, solange die Uhr unterbrochen ist. Knöpfe bleiben Mate / Hajime.

## Neuer Modus „Ablauf“ (erste Testfassung im Branch `ablauf`, Version 27)

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
- Rollen-Einstellung mit drei Möglichkeiten (Beispiel Uchikomi 2:00 + Ne-waza 1:00):
  1. „A komplett, dann B“: A Uchikomi → A Ne-waza → Wechsel → B Uchikomi → B Ne-waza
  2. „Abschnittsweise“: A Uchikomi → B Uchikomi → A Ne-waza → B Ne-waza
  3. „Wechselseitig“: Abschnitt läuft einmal, die Paare wechseln selbst ab (immer der eine, dann der andere)
     bis die Zeit um ist; keine Tori/Uke-Anzeige. Optional (i-Tüpfelchen): Wechselsignal alle X s.
  Kakari und Randori sind damit Sonderfälle; beide bleiben als schnelle Modi/Vorlagen erhalten.
- Mock-up-Erkenntnis: Einstellungen werden eng (Start-Knopf rutscht raus) → Ablauf-Editor auf eigenen
  Bildschirm oder Teile einklappbar; Ablaufleiste auf dem Handy vereinfachen.
- Sätze vorerst weglassen (nur für Konditionseinheiten nötig, macht die Einstellungen unübersichtlich)

## Branch `ablauf`: gesammelte Rückmeldungen (noch nicht umgesetzt)

- Bedienung braucht Einarbeitung; voreingestellter Ablauf sieht gut aus.
- Eigene Vorlagen ändern: bisher nur „neu speichern + alte löschen“. Gewünscht: geladene eigene Vorlage
  direkt aktualisieren („Änderungen in Vorlage speichern“), Löschen-× gut sichtbar.
- Manchmal kein Partnerwechsel zwischen den Runden: Einstellung „Partnerwechsel ja/nein“; bei „nein“
  neutrale Texte („Pause“, „Bereit? Hajime“ statt „Neue Partner suchen“).
- Eigene Schwachstellen: Reihenfolge der Abschnitte nicht änderbar; eigener Abschnittsname braucht zwei Schritte;
  nach „Fertig“ ist nicht klar, dass man als Vorlage speichern muss.
- Speichern / Ändern / Benennen von Vorlagen ist zu kompliziert (vereinfachen).
- Namensvorschläge für Abschnitte: Tachi-waza raus, Tandoku-renshu rein. Schreibweisen nach DJB
  (Liste vom Nutzer abwarten: z. B. Uchi-komi / Nage-komi / Ne-waza / Randori / Tandoku-renshu).
- Widerspruch Kakari-Modus und Ablauf: Vorschlag drei Reiter „Randori · Geiko 稽古 · Zirkel“;
  Kakari Geiko 2 × 2 wird fest eingebaute Vorlage im Reiter Geiko. Name „Geiko“ oder „Übung“ offen.
- (umgesetzt in Version 29) Schreibweisen nach DJB: erster Bestandteil groß, Rest klein, Bindestrich.
  Abschnitts-Vorschläge: Tandoku-renshu, Ukemi, Uchi-komi, Nage-komi, Yakusoku-geiko, Kakari-geiko,
  Butsukari-geiko, Randori, Bodenrandori, Ne-waza. Titel „Kakari-geiko“.
- Idee für später: Vorlagen nach DJB-Oberbegriffen ordnen (Technikerwerbstraining, Technikanwendungstraining,
  technisches Ergänzungstraining).
- Entscheidung: Kakari und Ablauf zusammenführen zu einem Reiter „Geiko“ (Reiter: Randori · Geiko · Zirkel).
  Geiko kann alles, was der Ablauf kann; Kakari-geiko wird fest eingebaute Kachel. Zeiten der Abschnitte und
  Runden direkt auf der Karte mit − / + änderbar, Bearbeiten-Bildschirm nur für den Aufbau.
- Neu: Runden „offen“ (für Randori und Geiko) mit optionalem Ende um eine Uhrzeit (z. B. 21:00);
  Anzeige „Runde 3 · bis 21:00“. Entschieden: drei Möglichkeiten bei Runden – „Anzahl“, „Offen“ (bis man
  beendet), „Bis Uhrzeit“. Bei Erreichen der Uhrzeit läuft die aktuelle Runde zu Ende, danach Sore-made
  (Abbrechen geht jederzeit). Vorteil: kein Bedienen mehr nötig.
- Kakari-geiko ist keine eigene Karte/kein Modus, sondern eine Vorlage: antippen lädt die Einstellungen in Geiko,
  danach direkt auf der Startseite fein justieren (Zeiten, Runden). „Bearbeiten“ nur für den Aufbau.
- Partnerwechsel: „Ja“ / „Nein“ / „Nach Ansage“ (neutrale Texte, Trainer entscheidet mündlich).
- (umgesetzt in Version 30) Reiter Randori · Geiko · Zirkel; Kakari-geiko ist Vorlage in Geiko (alte Kakari-Daten
  werden automatisch umgewandelt); Zeiten direkt auf der Karte; Runden Anzahl / Offen / Bis Uhrzeit;
  Partnerwechsel Ja / Nein / Nach Ansage; „Änderungen in Vorlage speichern“; Abschnitte nach oben verschieben;
  eigener Abschnittsname in einem Schritt; Start-Knopf bleibt immer sichtbar.
- Rückmeldung zu Version 30: schwebender Start-Knopf ist neu und ungewohnt. Alternativen: nur auf dem Handy
  schweben, auf dem Tablet fest unten (Einstellungen enger) – oder gar nicht schweben. Entscheidung offen.
- (umgesetzt in Version 32) „Ablauf bearbeiten“ deutlicher (Rahmen, Stift-Symbol); Tontest heißt „Signale anhören“
  mit Erklärung. Offen: im Editor „Neu beginnen“ (leerer Ablauf) als Alternative zum Abwandeln einer Vorlage?
- Signaltöne auswählen statt nur anhören: „Signalton“ Gong / Ding (Glocke) / Pfiff / Hupe für Start und Ende
  (Start 1×, Ende 2×, Sore-made 3×); „Vorwarnung“ Klopfen / Piep / aus; Wechselsignal bleibt eigener Doppelton.
  Antippen spielt den Ton sofort ab, eigener Testbereich entfällt. Zuordnung pro Ereignis vorerst nicht.
- (umgesetzt in Version 33) Signalton wählbar (Gong / Ding / Pfiff / Hupe), Vorwarnung Piep / Klopfen,
  Antippen spielt zur Probe; „+ Neuer Ablauf“ im Geiko-Kasten startet mit leerem Ablauf.
- Offen: schwebender Start-Knopf (bleibt vorerst so).
- (umgesetzt in Version 34) „+ Neu“ als Kachel bei den Vorlagen für alle Modi (Geiko: leerer Ablauf,
  Randori/Zirkel: Standardwerte); aus dem Geiko-Kasten entfernt.
- (umgesetzt in Version 35) Start-Knopf auf dem Handy nicht mehr schwebend (Tablet bleibt schwebend);
  „Bearbeiten“ statt „Ablauf bearbeiten“.
- Alternative, falls die „+ Neu“-Kachel nicht intuitiv ist: „+ Neu“ öffnet kurze Auswahl, was erstellt werden soll
  (Randori / Geiko-Ablauf / Zirkel).
- (umgesetzt in Version 36) „+ Neu“ öffnet eine Auswahl: Randori / Geiko-Ablauf / Zirkel.
