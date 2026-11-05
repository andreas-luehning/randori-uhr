'use strict';

// Bei jeder Änderung erhöhen (und CACHE in sw.js gleich setzen)
const APP_VERSION = '68';

/* ================= Vorlagen & Speicher ================= */

// Namensschema wie im Training üblich: Randori 3 × 3 = 3 Runden à 3 Min,
// Kakari-geiko 2 × 2 = 2 Runden à 2 Min: je Durchgang 1 Min Tori, dann Rollenwechsel, danach Partnerwechsel.
// Modi: Randori, Serie (intern 'ablauf': Abschnitte aus Formen und Inhalten, auch Kakari-geiko als einzelner Abschnitt), Zirkel.
// Der frühere Modus „Kakari“ wird beim Laden in eine Serie mit einer Form umgewandelt.
const BUILTIN = [
  { id: 'randori33', name: 'Randori 3 × 3', mode: 'randori', rounds: 3, work: 180, roundsMode: 'count', untilTime: '21:00',
    partnerChange: 'yes', transition: 'pausewait', pause: 30 },
  { id: 'kakari22', name: 'Kakari-geiko 2 × 2', mode: 'ablauf', roles: 'ab', sections: [{ name: 'Kakari-geiko', dur: 60 }],
    gap: 0, swapPause: 5, signal: 0, partners: 2, roundsMode: 'count', untilTime: '21:00', partnerChange: 'yes', transition: 'wait', pause: 30 },
];

// Startwerte beim Wechsel des Modus (Zirkel hat keine eigene Vorlage)
const ABLAUF_EXAMPLE = { name: 'Uchi-komi + Ne-waza', sections: [{ name: 'Uchi-komi', dur: 120 }, { name: 'Ne-waza', dur: 60 }] };
const MODE_DEFAULTS = {
  randori: BUILTIN[0],
  ablauf: { id: null, name: ABLAUF_EXAMPLE.name, mode: 'ablauf', roles: 'ab', sections: ABLAUF_EXAMPLE.sections,
    gap: 10, swapPause: 5, signal: 0, partners: 2, roundsMode: 'count', untilTime: '21:00', partnerChange: 'yes', transition: 'wait', pause: 30 },
  zirkel: { id: null, mode: 'zirkel', rounds: 10, work: 40, rest: 20 },
};

const ROUND_MODES = [['count', 'Anzahl'], ['open', 'Offen'], ['until', 'Bis Uhrzeit']];
const TRANSITIONS = [['auto', 'Auto-Pause'], ['wait', 'Warten'], ['pausewait', 'Pause + Warten']];
const PARTNER_CHANGE = [['yes', 'Ja'], ['no', 'Nein'], ['call', 'Nach Ansage']];
const OPEN_ROUNDS = 500; // Obergrenze für „offen“ / „bis Uhrzeit“, wird praktisch nie erreicht

// Rollen im Ablauf: A komplett, dann B / abschnittsweise abwechseln / wechselseitig ohne feste Rollen
const ROLES = [['ab', 'Nach der Serie'], ['section', 'Nach jedem Abschnitt'], ['mutual', 'Wechselseitig']];
// Kurzbeschreibung für Karte und Vorlage
const ROLE_TEXT = { ab: 'Tori/Uke-Wechsel nach der Serie', section: 'Tori/Uke-Wechsel nach jedem Abschnitt', mutual: 'Wechselseitig üben' };
const SIGNALS = [[0, 'Aus'], [15, '0:15'], [30, '0:30'], [60, '1:00']];
// Übungsformen in DJB-Schreibweise: erster Bestandteil groß, Rest klein, mit Bindestrich
const SECTION_NAMES = ['Tandoku-renshu', 'Ukemi', 'Uchi-komi', 'Nage-komi', 'Yakusoku-geiko', 'Kakari-geiko', 'Butsukari-geiko', 'Randori', 'Bodenrandori', 'Ne-waza'];
const MAX_SECTIONS = 8;

// Tiefe Kopie, damit Abschnitte von Vorlagen nicht versehentlich mitgeändert werden
function clone(o) { return JSON.parse(JSON.stringify(o)); }

// Anzahl Runden (= Partner) je Modus
function roundsOf(c) { return c.mode === 'ablauf' || c.mode === 'kakari' ? c.partners : c.rounds; }

// Kakari läuft intern als Serie mit einer Form „Kakari-geiko“ (A, dann B)
function kakariAsSerie(c) {
  return Object.assign(clone(c), { mode: 'ablauf', roles: 'ab', sections: [{ name: 'Kakari-geiko', dur: c.dur }], gap: 0, signal: 0 });
}
function isCounted(c) { return c.mode === 'zirkel' || !c.roundsMode || c.roundsMode === 'count'; }
function plannedRounds(c) { return isCounted(c) ? roundsOf(c) : OPEN_ROUNDS; }

// Alte und unvollständige Einstellungen auf den aktuellen Stand bringen (z. B. früherer Modus „Kakari“)
function normalize(src) {
  let c = clone(src || BUILTIN[0]);
  // Ganz alte Kakari-Daten (Zeit pro Partner, Rollenwechsel zur Hälfte)
  if (c.mode === 'kakari' && c.dur == null && c.perPartner != null) {
    const name = c.name ? c.name.replace(/^Kakari(?!-geiko)/, 'Kakari-geiko') : 'Kakari-geiko ' + mins(c.perPartner) + ' × ' + (c.partners || 2);
    c = Object.assign({}, c, { name, dur: Math.round(c.perPartner / 2) });
  }
  // Früherer Modus Kakari → Serie mit der einen Form Kakari-geiko (A, dann B)
  if (c.mode === 'kakari') c = kakariAsSerie(Object.assign({ dur: 60 }, c));
  if (!['randori', 'kakari', 'ablauf', 'zirkel'].includes(c.mode)) return clone(BUILTIN[0]);
  if (c.mode === 'ablauf') {
    if (!Array.isArray(c.sections) || !c.sections.length) Object.assign(c, clone(ABLAUF_EXAMPLE));
    if (!ROLES.some((r) => r[0] === c.roles)) c.roles = 'ab';
    ['gap', 'swapPause', 'signal'].forEach((k) => { if (typeof c[k] !== 'number') c[k] = k === 'swapPause' ? 5 : 0; });
    if (!c.name) c.name = c.sections.map((x) => x.name).join(' + ');
    if (!c.partners) c.partners = 2;
  }
  if (c.mode !== 'zirkel') {
    if (!ROUND_MODES.some((r) => r[0] === c.roundsMode)) c.roundsMode = 'count';
    if (!/^\d\d:\d\d$/.test(c.untilTime || '')) c.untilTime = '21:00';
    if (!PARTNER_CHANGE.some((r) => r[0] === c.partnerChange)) c.partnerChange = 'yes';
  }
  return sanitizeConfig(c);
}

/* Strenge Prüfung aller Werte: Daten aus dem Speicher oder einer importierten Datei könnten
   verändert sein. Zahlen werden echte Zahlen in festen Grenzen, Texte werden gekürzt,
   Auswahlwerte müssen aus der erlaubten Liste stammen. Unbekannte Felder fallen weg. */
function num(v, lo, hi, def) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}
function text(v, max, def) {
  if (typeof v !== 'string') return def;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  return t || def;
}
function pick(v, list, def) { return list.includes(v) ? v : def; }
const ids = (list) => list.map((x) => x[0]);

function sanitizeConfig(c) {
  const id = typeof c.id === 'string' && /^[\w-]{1,40}$/.test(c.id) ? c.id : null;
  const common = {
    roundsMode: pick(c.roundsMode, ids(ROUND_MODES), 'count'),
    untilTime: typeof c.untilTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.untilTime) ? c.untilTime : '21:00',
    partnerChange: pick(c.partnerChange, ids(PARTNER_CHANGE), 'yes'),
    transition: pick(c.transition, ids(TRANSITIONS), 'wait'),
    pause: num(c.pause, 5, 300, 30),
  };
  if (c.mode === 'randori') {
    return Object.assign({ id, name: text(c.name, 40, ''), mode: 'randori', rounds: num(c.rounds, 1, 30, 3), work: num(c.work, 15, 900, 180) }, common);
  }
  if (c.mode === 'zirkel') {
    return { id, name: text(c.name, 40, ''), mode: 'zirkel', rounds: num(c.rounds, 1, 50, 10), work: num(c.work, 5, 600, 40), rest: num(c.rest, 0, 600, 20) };
  }
  if (c.mode === 'kakari') {
    return Object.assign({ id, name: text(c.name, 40, ''), mode: 'kakari', dur: num(c.dur, 15, 900, 60),
      swapPause: num(c.swapPause, 0, 60, 5), partners: num(c.partners, 1, 30, 2) }, common);
  }
  const sections = (Array.isArray(c.sections) ? c.sections : []).slice(0, MAX_SECTIONS)
    .map((x) => ({ name: text(x && x.name, 24, ''), dur: num(x && x.dur, 15, 900, 60) }))
    .filter((x) => x.name);
  const secs = sections.length ? sections : clone(ABLAUF_EXAMPLE.sections);
  return Object.assign({
    id, name: text(c.name, 40, secs.map((x) => x.name).join(' + ').slice(0, 40)), mode: 'ablauf',
    roles: pick(c.roles, ids(ROLES), 'ab'), sections: secs,
    gap: num(c.gap, 0, 60, 10), swapPause: num(c.swapPause, 0, 60, 5), signal: pick(Number(c.signal), [0, 15, 30, 60], 0),
    partners: num(c.partners, 1, 30, 2),
  }, common);
}

function sanitizeSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  return {
    volume: Math.min(1, Math.max(0, Number.isFinite(Number(s.volume)) ? Number(s.volume) : DEFAULT_SETTINGS.volume)),
    warn: pick(Number(s.warn), [0, 10, 15, 30], DEFAULT_SETTINGS.warn),
    lead: pick(Number(s.lead), [0, 5, 10, 15], DEFAULT_SETTINGS.lead),
    media: s.media === true,
    theme: pick(s.theme, ['klassisch', 'aquarell', 'magie'], DEFAULT_SETTINGS.theme),
    signal: pick(s.signal, ids(SIGNAL_TYPES), DEFAULT_SETTINGS.signal),
    warnType: pick(s.warnType, ids(WARN_TYPES), DEFAULT_SETTINGS.warnType),
    signalCount: pick(s.signalCount, ids(SIGNAL_COUNTS), DEFAULT_SETTINGS.signalCount),
  };
}

// Gleich bis auf die Kennung? (für „Änderungen in Vorlage speichern“)
function sameConfig(a, b) {
  const x = clone(a); const y = clone(b);
  delete x.id; delete y.id;
  if (x.mode !== 'ablauf') { delete x.name; delete y.name; }
  return JSON.stringify(x) === JSON.stringify(y);
}

const THEMES = [['klassisch', 'Klassisch'], ['aquarell', 'Aquarell'], ['magie', 'Magie']];
const DEFAULT_SETTINGS = { volume: 0.9, warn: 10, lead: 5, media: false, theme: 'klassisch', signal: 'gong', warnType: 'piep', signalCount: 'multi' };
const SIGNAL_COUNTS = [['multi', 'Start 1× · Ende 2×'], ['single', 'Immer 1×']];
const SIGNAL_TYPES = [['gong', 'Gong'], ['ding', 'Ding'], ['pfiff', 'Pfiff'], ['hupe', 'Hupe']];
const WARN_TYPES = [['piep', 'Piep'], ['klopfen', 'Klopfen']];

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('randori.' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('randori.' + key, JSON.stringify(value)); } catch (e) { /* privat/voll: egal */ }
  },
};

let settings = sanitizeSettings(store.get('settings', {}));
let customPresets = store.get('presets', []).map(normalize);
let config = normalize(store.get('config', BUILTIN[0]));
let selectedPresetId = store.get('selectedPreset', BUILTIN[0].id);
let loadedPresetId = store.get('loadedPreset', selectedPresetId); // zuletzt geladene Vorlage, auch nach Änderungen
let editedSinceSave = false; // nach „Bearbeiten → Fertig“ an das Speichern erinnern

/* ================= Hilfen ================= */

const $ = (id) => document.getElementById(id);

function fmt(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

// Minuten kurz: 180 -> "3", 90 -> "1:30"
function mins(sec) { return sec % 60 === 0 ? String(sec / 60) : fmt(sec); }

// Vorschlag für den Namen einer neuen Vorlage, im Schema „Randori 3 × 3“
function shortName(c) {
  if (c.mode === 'randori') {
    if (c.roundsMode === 'open') return 'Randori à ' + mins(c.work) + ' offen';
    if (c.roundsMode === 'until') return 'Randori à ' + mins(c.work) + ' bis ' + c.untilTime;
    return 'Randori ' + c.rounds + ' × ' + mins(c.work);
  }
  if (c.mode === 'ablauf') return c.name;
  // Kakari-geiko 2 × 2: 2 Min mit einem Partner (je 1 Min Tori), 2 Runden
  if (c.mode === 'kakari') return 'Kakari-geiko ' + mins(c.dur * 2) + ' × ' + (c.roundsMode === 'count' ? c.partners : '…');
  return 'Zirkel ' + c.work + '/' + c.rest + ' × ' + c.rounds;
}

// Erklärung unter dem Vorlagennamen
function roundsText(c) {
  if (c.roundsMode === 'open') return 'Runden offen';
  if (c.roundsMode === 'until') return 'bis ' + c.untilTime;
  return roundsOf(c) + ' Runden';
}

function describe(c) {
  if (c.mode === 'randori') return roundsText(c) + ' à ' + fmt(c.work) + ' · ' + transitionText(c);
  if (c.mode === 'kakari') return roundsText(c) + ' · je Durchgang ' + fmt(c.dur) + ' Tori';
  if (c.mode === 'ablauf') {
    if (c.sections.length === 1 && c.roles !== 'mutual') return c.sections[0].name + ' · ' + roundsText(c) + ' · je ' + fmt(c.sections[0].dur) + ' Tori';
    return ROLE_TEXT[c.roles] + ' · ' + c.sections.map((x) => x.name).join(' + ') + ' · ' + roundsText(c);
  }
  return c.rounds + ' Runden · ' + fmt(c.work) + ' Arbeit / ' + fmt(c.rest) + ' Pause';
}

function transitionText(c) {
  if (c.transition === 'auto') return 'dazwischen ' + fmt(c.pause) + ' Pause';
  if (c.transition === 'wait') return 'Halt bis „Hajime“';
  return 'Pause + Warten';
}

/* ================= Ablauf berechnen ================= */

function buildSegments(c) {
  const segs = [];
  if (settings.lead > 0) segs.push({ type: 'prep', dur: settings.lead });

  // Übergang zwischen zwei Runden; bei „bis Uhrzeit“ wird hier geprüft, ob Schluss ist
  const transition = (round, total) => {
    if (c.transition === 'auto' || c.transition === 'pausewait') segs.push({ type: 'pause', dur: c.pause, round, total, transition: true });
    if (c.transition === 'wait' || c.transition === 'pausewait') segs.push({ type: 'wait', dur: null, round, total, transition: true });
  };

  if (c.mode === 'randori') {
    const n = plannedRounds(c);
    for (let r = 1; r <= n; r++) {
      segs.push({ type: 'work', dur: c.work, round: r, total: n });
      if (r < n) transition(r, n);
    }
  } else if (c.mode === 'ablauf') {
    buildAblauf(c, segs, transition);
  } else if (c.mode === 'kakari') {
    buildAblauf(kakariAsSerie(c), segs, transition);
  } else {
    for (let r = 1; r <= c.rounds; r++) {
      segs.push({ type: 'work', dur: c.work, round: r, total: c.rounds });
      if (r < c.rounds && c.rest > 0) segs.push({ type: 'pause', dur: c.rest, round: r, total: c.rounds });
    }
  }
  return segs;
}

// Ablauf: Abschnitte je nach Rollen-Einstellung, kurze Pausen dazwischen, Rollenwechsel, Partnerwechsel
function buildAblauf(c, segs, transition) {
  const secs = c.sections;
  // Reihenfolge der Übungsteile in einer Runde
  let order = [];
  if (c.roles === 'ab') {
    ['A', 'B'].forEach((who) => secs.forEach((x, i) => order.push({ sec: x, idx: i, attacker: who })));
  } else if (c.roles === 'section') {
    secs.forEach((x, i) => ['A', 'B'].forEach((who) => order.push({ sec: x, idx: i, attacker: who })));
  } else {
    order = secs.map((x, i) => ({ sec: x, idx: i, attacker: null }));
  }
  const roundDur = order.reduce((a, o) => a + o.sec.dur, 0);
  const n = plannedRounds(c);
  for (let p = 1; p <= n; p++) {
    let t = 0;
    order.forEach((o, k) => {
      const prev = order[k - 1];
      if (prev) {
        const roleChange = o.attacker && prev.attacker !== o.attacker;
        const base = { round: p, total: n, from: t, partDur: roundDur, attacker: o.attacker, nextName: o.sec.name };
        if (roleChange && c.swapPause > 0) segs.push(Object.assign({ type: 'swap', dur: c.swapPause }, base));
        else if (!roleChange && c.gap > 0) segs.push(Object.assign({ type: 'pause', dur: c.gap, gap: true }, base));
      }
      const swapStart = !!(prev && o.attacker && prev.attacker !== o.attacker && !(c.swapPause > 0));
      segs.push({ type: 'work', dur: o.sec.dur, round: p, total: n, attacker: o.attacker, section: o.sec.name,
        part: k, swapStart, from: t, partDur: roundDur, signal: o.attacker ? 0 : c.signal });
      t += o.sec.dur;
    });
    if (p < n) transition(p, n);
  }
}

/* ================= Töne ================= */

let audioCtx = null;
function ctx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(freq, start, dur, gain, type) {
  const ac = ctx();
  if (!ac || settings.volume <= 0) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * settings.volume), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function gong(at) {
  // Glockenartig: Grundton plus unharmonische Obertöne
  const base = 220;
  [[1, 0.5, 2.6], [2.76, 0.28, 1.8], [5.4, 0.16, 1.2], [8.93, 0.08, 0.8]].forEach(([m, g, d]) => tone(base * m, at, d, g));
}

// Helle Glocke
function ding(at) {
  [[1, 0.5, 1.6], [2.0, 0.18, 1.0], [3.01, 0.1, 0.6]].forEach(([m, g, d]) => tone(880 * m, at, d, g));
}

// Trillerpfeife: hoher Ton mit schnellem Flattern
function pfiff(at) {
  const ac = ctx();
  if (!ac || settings.volume <= 0) return;
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  const g = ac.createGain();
  osc.frequency.value = 2600;
  lfo.frequency.value = 28;
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(osc.frequency);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.35 * settings.volume, t0 + 0.02);
  g.gain.setValueAtTime(0.35 * settings.volume, t0 + 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
  osc.connect(g).connect(ac.destination);
  osc.start(t0); lfo.start(t0);
  osc.stop(t0 + 0.6); lfo.stop(t0 + 0.6);
}

// Hupe / Buzzer wie in der Halle
function hupe(at) {
  [[349, 'sawtooth'], [440, 'sawtooth'], [523, 'square']].forEach(([f, type]) => {
    const ac = ctx();
    if (!ac || settings.volume <= 0) return;
    const t0 = ac.currentTime + at;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.12 * settings.volume, t0 + 0.02);
    g.gain.setValueAtTime(0.12 * settings.volume, t0 + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.58);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + 0.62);
  });
}

// Gewählter Signalton für Start und Ende
function signal(at) {
  ({ gong, ding, pfiff, hupe }[settings.signal] || gong)(at);
}
// Abstand zwischen den Wiederholungen (Gong klingt länger nach)
function signalGap() { return settings.signal === 'gong' ? 0.7 : 0.75; }

const sounds = {
  start() { signal(0); },
  // Ende 2×, Sore-made 3× – außer der Signalton soll immer nur einmal klingen
  end() { signal(0); if (settings.signalCount !== 'single') signal(signalGap()); },
  finish() { signal(0); if (settings.signalCount !== 'single') { signal(signalGap()); signal(signalGap() * 2); } },
  warn() {
    if (settings.warnType === 'klopfen') {
      // Holz-Klopfen: kurz und trocken
      [0, 0.16].forEach((t) => { tone(300, t, 0.06, 0.9); tone(620, t, 0.04, 0.4, 'triangle'); });
    } else {
      tone(1200, 0, 0.08, 0.6, 'square'); tone(1200, 0.18, 0.08, 0.6, 'square');
    }
  },
  swap() { tone(660, 0, 0.18, 0.6, 'triangle'); tone(990, 0.2, 0.3, 0.6, 'triangle'); },
  tick() { tone(880, 0, 0.12, 0.45); },
};

/* ================= Medientasten (Handsender) ================= */

let silentAudio = null;
// 10 s lang: Android zeigt eine Mediensitzung erst ab ca. 5 s Länge an
function silentWavUrl() {
  const rate = 8000, len = rate * 10, buf = new ArrayBuffer(44 + len * 2), v = new DataView(buf);
  const s = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, len * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function mediaOn() {
  if (!settings.media || !('mediaSession' in navigator)) return;
  if (!silentAudio) { silentAudio = new Audio(silentWavUrl()); silentAudio.loop = true; }
  silentAudio.play().then(updateMediaState).catch(updateMediaState);
  try { navigator.mediaSession.metadata = new MediaMetadata({ title: 'Randori-Uhr' }); } catch (e) { /* alt */ }
  const handlers = { play: primary, pause: primary, stop: primary, nexttrack: secondary, previoustrack: secondary };
  Object.keys(handlers).forEach((a) => {
    try {
      navigator.mediaSession.setActionHandler(a, () => {
        showKey('Medien: ' + a);
        handlers[a]();
        if (silentAudio) silentAudio.play().catch(() => {});
        navigator.mediaSession.playbackState = 'playing';
      });
    } catch (e) { /* nicht unterstützt */ }
  });
  navigator.mediaSession.playbackState = 'playing';
}

function mediaOff() {
  if (silentAudio) silentAudio.pause();
  updateMediaState();
}

function mediaActive() { return !!(silentAudio && !silentAudio.paused); }

// Medientasten bleiben aktiv, solange die Uhr offen ist, nicht nur im Training.
// Der Browser erlaubt den (stummen) Ton erst nach einer Berührung, darum beim ersten Tippen starten.
document.addEventListener('pointerdown', () => {
  if (settings.media && !mediaActive()) mediaOn();
}, true);

// Symbol oben auf der Startseite: nur sichtbar, wenn Medientasten an sind
function updateMediaState() {
  const el = $('remoteState');
  if (!el) return;
  el.hidden = !settings.media;
  const ready = mediaActive();
  el.classList.toggle('ready', ready);
  el.setAttribute('aria-label', ready ? 'Handsender bereit' : 'Handsender: einmal auf den Bildschirm tippen');
  el.title = el.getAttribute('aria-label');
}

/* ================= Bildschirm wach halten ================= */

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { /* abgelehnt */ }
}
function releaseAwake() {
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && run) keepAwake();
});

/* ================= Uhr ================= */

let run = null; // { segs, i, endAt, remaining, paused, waitSince, lastSec, cfg }
let timer = null;

function startTraining() {
  ctx();
  const segs = buildSegments(config);
  run = { segs, i: -1, endAt: 0, remaining: 0, paused: false, waitSince: 0, lastSec: null, done: false,
    cfg: config.mode === 'kakari' ? kakariAsSerie(config) : clone(config),
    untilTs: config.roundsMode === 'until' ? untilTimestamp(config.untilTime) : 0 };
  show('run');
  keepAwake();
  mediaOn();
  try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* egal */ }
  enter(0);
  clearInterval(timer);
  timer = setInterval(tick, 100);
}

function seg() { return run && run.segs[run.i]; }

// Zeitpunkt der Endzeit heute; liegt sie mehr als 12 h zurück, ist morgen gemeint
function untilTimestamp(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (Date.now() - d.getTime() > 12 * 3600 * 1000) d.setDate(d.getDate() + 1);
  return d.getTime();
}
function untilPassed() { return !!(run && run.untilTs && Date.now() >= run.untilTs); }

function enter(i) {
  const prev = seg();
  run.i = i;
  const s = seg();
  if (!s) return finish();
  // Bis Uhrzeit: die laufende Runde wird zu Ende gemacht, danach ist Schluss
  if (s.transition && untilPassed()) return finish();
  run.paused = false;
  run.lastSec = null;
  if (s.type === 'work' && run.cfg.mode !== 'zirkel') callHajime();
  if (s.dur != null) {
    run.remaining = s.dur * 1000;
    run.endAt = Date.now() + run.remaining;
  } else {
    run.waitSince = Date.now();
  }
  if (s.type === 'work') {
    // Wechsel ohne Tauschpause: Wechselton, sonst Startgong
    if (s.swapStart && !(prev && prev.type === 'swap')) sounds.swap();
    else sounds.start();
  } else if (s.type === 'swap') {
    sounds.swap();
  } else if ((s.type === 'pause' || s.type === 'wait') && prev && prev.type === 'work') {
    sounds.end();
  }
  render();
}

function finish() {
  run.done = true;
  run.i = run.segs.length;
  sounds.finish();
  clearInterval(timer);
  releaseAwake();
  render();
}

function stopTraining() {
  clearInterval(timer);
  run = null;
  releaseAwake();
  show('setup');
}

function tick() {
  const s = seg();
  if (!s) return;
  if (s.dur == null) { renderWaitSince(); return; }
  if (run.paused) return;
  run.remaining = run.endAt - Date.now();
  const sec = Math.ceil(run.remaining / 1000);
  if (sec !== run.lastSec) {
    run.lastSec = sec;
    if (s.type === 'work' && settings.warn > 0 && sec === settings.warn && s.dur > settings.warn) sounds.warn();
    if (s.type !== 'work' && sec >= 1 && sec <= 3) sounds.tick();
    // Wechselseitig: kurzes Wechselsignal im eingestellten Abstand
    if (s.type === 'work' && s.signal > 0 && sec > 0 && sec < s.dur && (s.dur - sec) % s.signal === 0) sounds.swap();
  }
  if (run.remaining <= 0) { enter(run.i + 1); return; }
  renderTime();
}

// „Hajime“ oben nur kurz einblenden, so lange wie das Kommando gerufen wird
const CALL_MS = 2600;
function callHajime() {
  run.callUntil = Date.now() + CALL_MS;
  run.callNew = true;
  clearTimeout(run.callTimer);
  run.callTimer = setTimeout(() => { if (run) render(); }, CALL_MS + 50);
}

function togglePause() {
  const s = seg();
  if (!s || s.dur == null) return;
  if (run.paused) {
    run.paused = false;
    run.endAt = Date.now() + run.remaining;
    if (s.type === 'work' && run.cfg.mode !== 'zirkel') callHajime();
  } else {
    run.remaining = run.endAt - Date.now();
    run.paused = true;
  }
  render();
}

function skip() { if (run && !run.done) enter(run.i + 1); }

function plus30() {
  const s = seg();
  if (!s || s.dur == null) return;
  if (run.paused) run.remaining += 30000; else run.endAt += 30000;
  renderTime();
}

/* Haupttaste (Bildschirm-Knopf und Handsender) */
function primary() {
  if (current === 'setup') { startTraining(); return; }
  if (current !== 'run' || !run) return;
  if (run.done) { stopTraining(); return; }
  const s = seg();
  if (s.type === 'wait') { enter(run.i + 1); return; }
  togglePause();
}

/* Zweite Taste: überspringt nur Pausen und Wartezeiten, nie eine laufende Kampfzeit */
function secondary() {
  if (current !== 'run' || !run || run.done) return;
  const s = seg();
  if (s.type !== 'work') skip();
}

/* ================= Anzeige: Uhr ================= */

function nextText(i) {
  const n = run.segs[i];
  const c = run.cfg;
  if (!n) return 'Ende';
  if (n.transition && untilPassed()) return 'Ende · ' + c.untilTime + ' erreicht';
  if (n.type === 'work' && c.mode === 'ablauf') {
    if (n.attacker && c.sections.length === 1) return 'Partner ' + n.attacker + ' ist Tori · ' + fmt(n.dur);
    return n.section + (n.attacker ? ' · Partner ' + n.attacker + ' ist Tori' : ' · wechselseitig') + ' · ' + fmt(n.dur);
  }
  if (n.type === 'pause' && n.gap) return 'Pause ' + fmt(n.dur) + ' · dann ' + n.nextName;
  if (n.type === 'work') return (c.mode === 'zirkel' ? 'Arbeit ' : 'Runde ' + n.round + ' · ') + fmt(n.dur);
  // Bei Randori und Geiko ist die Pause zugleich die Zeit für den Partnerwechsel (je nach Einstellung)
  if (n.type === 'pause') return c.mode === 'zirkel' || c.partnerChange !== 'yes' ? 'Pause ' + fmt(n.dur) : 'Pause + Partnerwechsel · ' + fmt(n.dur);
  if (n.type === 'swap') return 'Rollenwechsel';
  if (n.type === 'wait') {
    const before = run.segs[i - 1];
    return before && before.type === 'pause' || c.partnerChange !== 'yes' ? 'Uhr wartet auf „Hajime“' : 'Partnerwechsel · Uhr wartet auf „Hajime“';
  }
  return '';
}

function renderTime() {
  const s = seg();
  if (!s || s.dur == null) return;
  $('time').textContent = fmt(run.remaining / 1000);
  const info = $('subInfo');
  if (s.type === 'work' && s.signal > 0) {
    const elapsed = s.dur - run.remaining / 1000;
    const next = s.signal - (elapsed % s.signal);
    info.hidden = next >= run.remaining / 1000;
    info.textContent = 'Nächstes Wechselsignal in ' + fmt(next);
  } else {
    info.hidden = true;
  }
  renderProgress();
}

function renderWaitSince() {
  $('waitSince').textContent = 'Wartet seit ' + fmt((Date.now() - run.waitSince) / 1000);
}

function renderProgress() {
  const s = seg();
  const c = run.cfg;
  const counted = isCounted(c);
  const total = counted ? roundsOf(c) : 1; // offen: nur ein Balken für die laufende Runde
  const box = $('progress');
  if (box.children.length !== total) {
    box.innerHTML = '';
    for (let k = 0; k < total; k++) box.appendChild(document.createElement('div')).appendChild(document.createElement('i'));
  }
  let round = s && s.round ? (counted ? s.round : 1) : 0;
  let frac = 0;
  if (run.done) { round = total; frac = 1; }
  else if (s && s.type === 'work') {
    const elapsed = s.dur - run.remaining / 1000;
    frac = s.partDur ? (s.from + elapsed) / s.partDur : elapsed / s.dur;
  } else if (s && (s.type === 'swap' || s.gap)) {
    frac = s.from / s.partDur;
  } else if (s && (s.type === 'pause' || s.type === 'wait')) {
    frac = 1;
  }
  Array.prototype.forEach.call(box.children, (el, k) => {
    const n = k + 1;
    el.firstChild.style.width = (n < round ? 100 : n === round ? Math.min(100, Math.max(0, frac * 100)) : 0) + '%';
  });
}

function render() {
  if (!run) return;
  const s = seg();
  const c = run.cfg;
  const type = run.done ? 'done' : s.type;
  const body = document.body;
  body.classList.remove('phase-work', 'phase-pause', 'phase-wait', 'phase-swap', 'phase-prep', 'phase-done');
  body.classList.add('phase-' + type);
  body.classList.toggle('paused', !!run.paused);

  // Kanji nur als Deko neben dem lesbaren Begriff
  if (c.mode === 'ablauf') {
    const kakari = c.sections.length === 1 && c.sections[0].name === 'Kakari-geiko';
    // Kanji nur bei Kakari-geiko; „Serie“ ist ein deutscher Begriff
    $('runMode').innerHTML = kakari ? esc(c.name || 'Kakari-geiko') + jp('掛かり稽古') : esc(c.name);
  } else {
    $('runMode').innerHTML = c.mode === 'zirkel' ? 'Zirkel' : 'Randori' + jp('乱取り');
  }
  let roundText = '';
  if (run.done) roundText = 'Fertig';
  else if (s.round && isCounted(c)) roundText = 'Runde ' + s.round + ' / ' + roundsOf(c);
  else if (s.round) roundText = 'Runde ' + s.round + (c.roundsMode === 'until' ? ' · bis ' + c.untilTime : '');
  $('runRound').textContent = roundText;

  const showRoles = c.mode === 'ablauf' && !!(s && s.attacker) && (type === 'work' || type === 'swap' || (type === 'pause' && s.gap));
  $('roles').hidden = !showRoles;
  body.classList.toggle('has-roles', showRoles);
  if (showRoles) {
    ['A', 'B'].forEach((p) => {
      const el = $('role' + p);
      const attacking = s.attacker === p;
      el.classList.toggle('attack', attacking);
      el.querySelector('small').textContent = (type === 'swap' ? 'GLEICH ' : '') + (attacking ? 'TORI' : 'UKE');
    });
  }
  renderStrip();

  const isWait = type === 'wait';
  $('waitBox').hidden = !isWait;
  if (isWait) {
    const pc = c.partnerChange || 'yes';
    $('waitTitle').textContent = pc === 'yes' ? 'Neue Partner suchen' : 'Bereit?';
    $('waitHint').textContent = pc === 'yes' ? 'Haben alle einen Partner? Dann hier tippen:'
      : pc === 'call' ? 'Partnerwechsel nach Ansage – dann hier tippen:' : 'Wenn alle bereit sind, hier tippen:';
  }
  $('time').hidden = isWait || type === 'done';
  $('doneBox').hidden = type !== 'done';
  let label = '';
  // Mate / Hajime nur in der Kampfzeit; Zirkel, Pausen, Rollenwechsel und Vorlauf bleiben neutral
  const combat = !run.done && type === 'work' && c.mode !== 'zirkel';
  const calling = combat && !run.paused && run.callUntil > Date.now();
  if (run.paused) label = combat ? 'Mate' : 'Angehalten';
  else if (calling) label = 'Hajime';
  else if (type === 'prep') label = 'Gleich geht’s los';
  else if (type === 'work' && c.mode === 'ablauf') {
    if (s.attacker && c.sections.length === 1) label = 'Partner ' + s.attacker + ' ist Tori';
    else label = s.section + (s.attacker ? '' : ' · wechselseitig');
  }
  else if (type === 'work') label = c.mode === 'zirkel' ? 'Arbeit' : '';
  else if (type === 'pause' && s.gap) label = 'Pause · gleich ' + s.nextName;
  else if (type === 'pause') {
    const pc = c.partnerChange || 'yes';
    label = c.mode === 'zirkel' || pc === 'no' ? 'Pause' : pc === 'call' ? 'Pause · Partnerwechsel nach Ansage' : 'Pause · Partner wechseln';
  }
  else if (type === 'swap') label = 'Rollenwechsel';
  $('phaseLabel').textContent = label;
  const pl = $('phaseLabel');
  if (calling && run.callNew) {
    // Animation neu starten
    pl.classList.remove('call');
    void pl.offsetWidth;
    pl.classList.add('call');
    run.callNew = false;
  } else if (!calling) {
    pl.classList.remove('call');
  }
  $('phaseLabel').hidden = isWait || type === 'done';

  $('nextInfo').textContent = run.done ? 'Zurück zur Auswahl' : nextText(run.i + 1);
  $('btnPlus').hidden = run.done || isWait;
  $('btnMain').hidden = isWait;
  $('btnSkip').hidden = run.done;
  $('btnStop').hidden = run.done;
  // Kommandos wie auf der Matte: Mate unterbricht, Hajime geht weiter
  let main = run.paused ? 'Weiter' : 'Anhalten';
  if (run.done) main = 'Fertig';
  else if (combat) main = run.paused ? 'Hajime' + jp('始め') : 'Mate' + jp('待て');
  $('btnMain').innerHTML = '<span>' + main + '</span>';

  if (isWait) renderWaitSince(); else renderTime();
  renderProgress();
}

// Ablaufleiste: alle Übungsteile der aktuellen Runde, der laufende hervorgehoben
function renderStrip() {
  const box = $('strip');
  const c = run.cfg;
  const s = seg();
  // Nur bei mehreren Abschnitten sinnvoll (bei Kakari-geiko reicht die Tori/Uke-Anzeige)
  if (c.mode !== 'ablauf' || c.sections.length < 2 || run.done || !s || !s.round) { box.hidden = true; return; }
  const parts = run.segs.filter((x) => x.type === 'work' && x.round === s.round);
  const nextWork = s.type === 'work' ? s : run.segs.slice(run.i).find((x) => x.type === 'work' && x.round === s.round);
  box.hidden = false;
  box.innerHTML = parts.map((x) => {
    const cls = x === s ? 'now' : x === nextWork ? 'next' : '';
    return '<div class="' + cls + '" style="flex:' + x.dur + '"><small>' + (x.attacker || 'beide') + '</small>' + esc(x.section) + '</div>';
  }).join('');
}

/* ================= Anzeige: Setup ================= */

const FIELDS = {
  randori: [
    { k: 'work', label: 'Rundenzeit', type: 'time', step: 15, min: 15, max: 900 },
    { k: 'rounds', label: 'Runden', type: 'rounds', min: 1, max: 30 },
    { type: 'partner' },
    { k: 'transition', type: 'transition' },
    { k: 'pause', label: 'Pause', type: 'time', step: 5, min: 5, max: 300, when: (c) => c.transition !== 'wait' },
  ],
  kakari: [
    { k: 'dur', label: 'Zeit je Durchgang', type: 'time', step: 15, min: 15, max: 900, sub: () => 'erst Tori A, dann Tori B' },
    { k: 'swapPause', label: 'Zeit für Rollenwechsel', type: 'time', step: 5, min: 0, max: 60 },
    { k: 'partners', label: 'Runden', type: 'rounds', min: 1, max: 30 },
    { type: 'partner' },
    { k: 'transition', type: 'transition' },
    { k: 'pause', label: 'Pause', type: 'time', step: 5, min: 5, max: 300, when: (c) => c.transition !== 'wait' },
  ],
  ablauf: [
    { type: 'ablauf' },
    { k: 'partners', label: 'Runden', type: 'rounds', min: 1, max: 30 },
    { type: 'partner' },
    { k: 'transition', type: 'transition' },
    { k: 'pause', label: 'Pause', type: 'time', step: 5, min: 5, max: 300, when: (c) => c.transition !== 'wait' },
  ],
  zirkel: [
    { k: 'rounds', label: 'Runden', type: 'count', min: 1, max: 50 },
    { k: 'work', label: 'Arbeit', type: 'time', step: 5, min: 5, max: 600 },
    { k: 'rest', label: 'Pause', type: 'time', step: 5, min: 0, max: 600 },
  ],
};


// Japanische Schriftzeichen als dezente Verzierung (feste Texte, kein Nutzereingabe)
function jp(text) { return '<span class="jp-deco" lang="ja">' + text + '</span>'; }

function esc(t) { return String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

function renderSetup() {
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === config.mode)));

  const html = FIELDS[config.mode].filter((f) => !f.when || f.when(config)).map((f) => {
    if (f.type === 'ablauf') {
      const c = config;
      const info = (c.sections.length > 1 && c.gap ? 'Pause ' + fmt(c.gap) + ' · ' : '') +
        (c.roles !== 'mutual' ? 'Rollenwechsel ' + fmt(c.swapPause) : c.signal ? 'Wechselsignal alle ' + fmt(c.signal) : 'ohne Wechselsignal');
      // Zeiten direkt hier einstellbar; „Bearbeiten“ nur für den Aufbau
      // Aufbau: Name und Rollen oben, Zeiten in der Mitte, „Serie bearbeiten“ als eigene Zeile unten
      return '<div class="ablauf-card"><div class="ablauf-head"><span><b>' + esc(c.name) + '</b><small class="muted">' +
        ROLE_TEXT[c.roles] + '</small></span></div>' +
        c.sections.map((x, i) => '<div class="field"><span class="lbl">' + esc(x.name) + (c.roles !== 'mutual' ? '<small>je Durchgang</small>' : '') + '</span><span class="stepper">' +
          '<button type="button" data-qsec="' + i + '" data-d="-1" aria-label="' + esc(x.name) + ' kürzer">−</button><output>' + fmt(x.dur) + '</output>' +
          '<button type="button" data-qsec="' + i + '" data-d="1" aria-label="' + esc(x.name) + ' länger">+</button></span></div>').join('') +
        '<small class="muted">' + info + '</small>' +
        '<button type="button" class="edit-row" data-edit="1">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M14 6l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>' +
        'Serie bearbeiten<small>Ablauf, Tori/Uke, Pausen</small></button></div>';
    }
    if (f.type === 'rounds') {
      const rm = config.roundsMode || 'count';
      let ctl = '';
      if (rm === 'count') {
        ctl = '<span class="stepper"><button type="button" data-k="' + f.k + '" data-d="-1" aria-label="Runden weniger">−</button><output>' + config[f.k] + '</output>' +
          '<button type="button" data-k="' + f.k + '" data-d="1" aria-label="Runden mehr">+</button></span>';
      } else if (rm === 'until') {
        ctl = '<label class="until"><span>Ende um</span><input id="untilTime" type="time" value="' + esc(config.untilTime) + '"></label>';
      } else {
        ctl = '<output class="open-val" aria-label="unbegrenzt">∞</output>';
      }
      return '<div class="field-col"><div class="field"><span class="lbl">Runden' + (rm === 'open' ? '<small>bis du die Uhr beendest</small>' : '') + '</span>' + ctl + '</div>' +
        '<div class="seg" role="radiogroup" aria-label="Runden">' +
        ROUND_MODES.map(([v, t]) => '<button type="button" role="radio" data-rmode="' + v + '" aria-checked="' + (rm === v) + '">' + t + '</button>').join('') +
        '</div>' + (rm === 'until' ? '<small class="muted">Die laufende Runde wird zu Ende gemacht, danach ist Schluss.</small>' : '') + '</div>';
    }
    if (f.type === 'partner') {
      const pc = config.partnerChange || 'yes';
      return '<div class="field-col"><span class="lbl">Partnerwechsel</span><div class="seg" role="radiogroup" aria-label="Partnerwechsel">' +
        PARTNER_CHANGE.map(([v, t]) => '<button type="button" role="radio" data-pc="' + v + '" aria-checked="' + (pc === v) + '">' + t + '</button>').join('') + '</div></div>';
    }
    if (f.type === 'transition') {
      const hint = { auto: 'Pause, danach startet die nächste Runde von selbst.', wait: 'Die Uhr hält an, bis du auf „Hajime“ tippst.', pausewait: 'Erst Pause, danach hält die Uhr bis „Hajime“.' }[config.transition];
      return '<div class="field-col"><span class="lbl">' + 'Nach jeder Runde' + '</span>' +
        '<div class="seg" role="radiogroup" aria-label="Übergang">' +
        TRANSITIONS.map(([v, t]) => '<button type="button" role="radio" data-transition="' + v + '" aria-checked="' + (config.transition === v) + '">' + t + '</button>').join('') +
        '</div><small class="muted">' + hint + '</small></div>';
    }
    const val = f.type === 'time' ? fmt(config[f.k]) : config[f.k];
    const sub = f.sub ? '<small>' + esc(f.sub(config)) + '</small>' : '';
    return '<div class="field"><span class="lbl">' + f.label + sub + '</span><span class="stepper">' +
      '<button type="button" data-k="' + f.k + '" data-d="-1" aria-label="' + f.label + ' weniger">−</button>' +
      '<output>' + val + '</output>' +
      '<button type="button" data-k="' + f.k + '" data-d="1" aria-label="' + f.label + ' mehr">+</button></span></div>';
  }).join('');
  $('fields').innerHTML = html;

  $('summary').textContent = summaryText(config);

  // Geladene eigene Vorlage geändert? Dann direkt aktualisieren können
  const loaded = customPresets.find((p) => p.id === loadedPresetId);
  const dirty = !!(loaded && !sameConfig(loaded, config));
  const upd = $('btnUpdatePreset');
  upd.hidden = !dirty;
  if (loaded) upd.setAttribute('aria-label', 'Änderungen in Vorlage „' + loaded.name + '“ speichern');
  $('btnSavePreset').classList.toggle('attention', editedSinceSave);

  const all_presets = BUILTIN.concat(customPresets);
  $('presetList').innerHTML = '<button type="button" class="preset preset-new" data-newpreset="1"><b>+ Neu</b><span>Randori, Serie oder Zirkel</span></button>' +
    all_presets.map((p) => {
    const custom = !BUILTIN.includes(p);
    return '<button type="button" class="preset" data-preset="' + esc(p.id) + '" aria-pressed="' + (p.id === selectedPresetId) + '">' +
      '<b>' + esc(p.name) + '</b><span>' + esc(describe(p)) + '</span>' +
      (dirty && p.id === loadedPresetId ? '<em class="badge">geändert</em>' : '') +
      (custom ? '<span class="del" role="button" tabindex="0" data-del="' + esc(p.id) + '" aria-label="Vorlage löschen">×</span>' : '') +
      '</button>';
  }).join('');
}

function saveConfig() {
  store.set('config', config);
  store.set('selectedPreset', selectedPresetId);
  store.set('loadedPreset', loadedPresetId);
}

// Kurzinfo über dem Start-Knopf
function summaryText(c) {
  const one = Object.assign(clone(c), { roundsMode: 'count' });
  if (c.mode === 'ablauf' || c.mode === 'kakari') one.partners = 1; else one.rounds = 1;
  const roundSegs = buildSegments(one).filter((s) => s.type !== 'prep');
  const perRound = roundSegs.filter((s) => s.type === 'work').reduce((a, s) => a + s.dur, 0);
  if (c.roundsMode === 'open') return 'Runden offen · je Runde ' + fmt(perRound) + ' Kampf-/Übungszeit';
  if (c.roundsMode === 'until') {
    const left = (untilTimestamp(c.untilTime) - Date.now()) / 1000;
    const cycle = roundSegs.reduce((a, s) => a + (s.dur || 0), 0) + (c.transition === 'auto' ? c.pause : c.transition === 'pausewait' ? c.pause + 30 : 30);
    const n = Math.max(1, Math.ceil(left / cycle));
    return 'Bis ' + c.untilTime + ' · ca. ' + n + ' Runden à ' + fmt(perRound);
  }
  const segs = buildSegments(c).filter((s) => s.type !== 'prep');
  const work = segs.filter((s) => s.type === 'work').reduce((a, s) => a + s.dur, 0);
  const all = segs.reduce((a, s) => a + (s.dur || 0), 0);
  const waits = segs.filter((s) => s.type === 'wait').length;
  return 'Kampf-/Übungszeit ' + fmt(work) + ' · gesamt ca. ' + Math.round(all / 60) + ' Min' + (waits ? ' + ' + waits + '× Warten' : '');
}

// Änderung an den Einstellungen: Auswahl der Vorlage aufheben, aber merken, welche geladen war
function changed() {
  selectedPresetId = null;
  saveConfig();
  renderSetup();
}

function stepField(k, d) {
  const f = FIELDS[config.mode].find((x) => x.k === k);
  if (!f) return;
  const max = typeof f.max === 'function' ? f.max(config) : f.max;
  let step = f.type === 'count' || f.type === 'rounds' ? 1 : f.step;
  const old = config[k];
  let v = Math.min(max, Math.max(f.min, old + d * step));
  if (f.type === 'time' && step > 1) v = Math.round(v / step) * step || (d > 0 ? step : f.min);
  v = Math.min(max, Math.max(f.min, v));
  config[k] = v;
  changed();
}

/* ================= Bildschirme ================= */

let current = 'setup';
function show(name) {
  current = name;
  ['setup', 'settings', 'run', 'editor'].forEach((n) => { $(n).hidden = n !== name; });
  document.body.classList.toggle('on-setup', name === 'setup');
  if (name !== 'run') document.body.className = 'on-' + name;
  if (name === 'setup') renderSetup();
  showUpdateBar();
  if (name === 'settings') { renderSettings(); updateInstallUi(); }
  if (name === 'editor') renderEditor();
}

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && bg) meta.content = bg;
}

function renderSettings() {
  $('setSignal').innerHTML = SIGNAL_TYPES.map(([v, t]) => '<button type="button" role="radio" data-signaltype="' + v + '" aria-checked="' + (settings.signal === v) + '">' + t + '</button>').join('');
  $('setSignalCount').innerHTML = SIGNAL_COUNTS.map(([v, t]) => '<button type="button" role="radio" data-signalcount="' + v + '" aria-checked="' + (settings.signalCount === v) + '">' + t + '</button>').join('');
  $('setWarnType').innerHTML = WARN_TYPES.map(([v, t]) => '<button type="button" role="radio" data-warntype="' + v + '" aria-checked="' + (settings.warnType === v) + '">' + t + '</button>').join('');
  $('setTheme').innerHTML = THEMES.map(([v, t]) => '<button type="button" role="radio" data-themeval="' + v + '" aria-checked="' + (settings.theme === v) + '">' + t + '</button>').join('');
  $('setVolume').value = settings.volume;
  $('setWarn').value = String(settings.warn);
  $('setLead').value = String(settings.lead);
  $('setMedia').checked = !!settings.media;
}

function saveSettings() { store.set('settings', settings); }

/* ================= Ablauf bearbeiten ================= */

let draft = null; // Arbeitskopie, wird erst mit „Fertig“ übernommen

// „+ Neu“ bei den Vorlagen: erst fragen, was angelegt werden soll
function openNewDialog() {
  $('newDialog').hidden = false;
  document.querySelector('[data-newmode="' + config.mode + '"]').focus();
}
function closeNewDialog() { $('newDialog').hidden = true; }
$('newCancel').addEventListener('click', closeNewDialog);
$('newDialog').addEventListener('click', (e) => { if (e.target === $('newDialog')) closeNewDialog(); });

// Serie öffnet eine leere Serie, die anderen Modi beginnen mit Standardwerten ohne Bezug zu einer Vorlage
function newPreset(mode) {
  if (mode === 'ablauf') {
    if (config.mode !== 'ablauf') config = normalize(MODE_DEFAULTS.ablauf);
    openEditor(true);
    return;
  }
  config = normalize(Object.assign(clone(MODE_DEFAULTS[mode]), { id: null, name: '' }));
  loadedPresetId = null;
  editedSinceSave = true;
  changed();
}

// Bearbeiten: Kopie der aktuellen Einstellungen; neu: leerer Ablauf mit den übrigen Einstellungen
function openEditor(fresh) {
  draft = clone(config);
  if (fresh) {
    Object.assign(draft, { id: null, name: '', roles: 'ab', sections: [], gap: 10, swapPause: 5, signal: 0 });
    draftIsNew = true;
  } else {
    draftIsNew = false;
  }
  show('editor');
}
let draftIsNew = false;

// Vorschau „So läuft eine Runde“
function roundPreview(d) {
  const tmp = [];
  buildAblauf(Object.assign({}, d, { partners: 1, roundsMode: 'count' }), tmp, () => {});
  return tmp.filter((x) => x.type === 'work').map((x) => (x.attacker ? x.attacker + ' ' : '') + x.section);
}

const TRASH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function edStepper(key, label, val, sub) {
  return '<div class="field"><span class="lbl">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="stepper">' +
    '<button type="button" data-ed="' + key + '" data-d="-1" aria-label="' + label + ' weniger">−</button><output>' + fmt(val) + '</output>' +
    '<button type="button" data-ed="' + key + '" data-d="1" aria-label="' + label + ' mehr">+</button></span></div>';
}

function renderEditor() {
  const d = draft;
  if (document.activeElement !== $('edName')) $('edName').value = d.name;
  $('edTitle').textContent = draftIsNew ? 'Neue Serie' : 'Serie bearbeiten';
  $('edDone').disabled = !d.sections.length;
  $('edEmpty').hidden = !!d.sections.length;
  $('edRoles').innerHTML = ROLES.map(([v, t]) => '<button type="button" role="radio" data-roles="' + v + '" aria-checked="' + (d.roles === v) + '">' + t + '</button>').join('');
  $('edRolesHint').textContent = {
    ab: 'Partner A ist die ganze Serie über Tori, danach Partner B.',
    section: 'Jeder Abschnitt erst mit Partner A als Tori, dann mit Partner B.',
    mutual: 'Jeder Abschnitt kommt einmal dran, die Paare wechseln sich dabei selbst ab.',
  }[d.roles];
  const prev = roundPreview(d);
  $('edPreview').innerHTML = prev.map((p, i) => {
    const sep = i && d.roles !== 'mutual' && p[0] !== prev[i - 1][0] ? '<span class="muted">⇄</span>' : '';
    return sep + '<span class="sec-pill' + (p.startsWith('A ') ? ' a' : '') + '">' + esc(p) + '</span>';
  }).join('');
  let times = '';
  $('edGapWrap').hidden = d.sections.length < 2;
  $('edGap').innerHTML = edStepper('gap', 'Alle Pausen', d.gap);
  if (d.roles === 'mutual') {
    times += '<div class="field-col"><span class="lbl">Wechselsignal<small>kurzer Ton als Erinnerung zum Tauschen</small></span><div class="seg" role="radiogroup" aria-label="Wechselsignal">' +
      SIGNALS.map(([v, t]) => '<button type="button" role="radio" data-signal="' + v + '" aria-checked="' + (d.signal === v) + '">' + t + '</button>').join('') + '</div></div>';
  } else {
    times += edStepper('swapPause', 'Zeit für Rollenwechsel', d.swapPause);
  }
  $('edTimes').innerHTML = times;
  $('edSections').innerHTML = d.sections.map((x, i) =>
    (i && d.gap ? '<div class="sec-gap">Pause ' + fmt(d.gap) + '</div>' : '') +
    '<div class="sec-row"><button type="button" class="sec-up" data-secup="' + i + '" aria-label="' + esc(x.name) + ' nach oben"' + (i ? '' : ' disabled') + '>↑</button>' +
    '<span class="nm"><span class="sec-no">' + (i + 1) + ' · </span>' + esc(x.name) + '</span><span class="stepper">' +
    '<button type="button" data-sec="' + i + '" data-d="-1" aria-label="' + esc(x.name) + ' kürzer">−</button><output>' + fmt(x.dur) + '</output>' +
    '<button type="button" data-sec="' + i + '" data-d="1" aria-label="' + esc(x.name) + ' länger">+</button></span>' +
    '<button type="button" class="sec-del" data-secdel="' + i + '" aria-label="' + esc(x.name) + ' entfernen"' + (d.sections.length < 2 ? ' disabled' : '') + '>' + TRASH_ICON + '</button></div>'
  ).join('');
  const full = d.sections.length >= MAX_SECTIONS;
  $('edAdd').innerHTML = SECTION_NAMES.map((n) => '<button type="button" class="chip" data-secadd="' + n + '"' + (full ? ' disabled' : '') + '>' + n + '</button>').join('');
  $('edCustomName').disabled = full;
}

function addSection(name) {
  if (!name || draft.sections.length >= MAX_SECTIONS) return;
  draft.sections.push({ name: name.slice(0, 24), dur: 60 });
  renderEditor();
}

function editorClick(t) {
  const d = draft;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  if (t.dataset.roles) { d.roles = t.dataset.roles; renderEditor(); return; }
  if (t.dataset.signal != null) { d.signal = Number(t.dataset.signal); renderEditor(); return; }
  if (t.dataset.ed) { const k = t.dataset.ed; d[k] = clamp(d[k] + Number(t.dataset.d) * 5, 0, 60); renderEditor(); return; }
  if (t.dataset.sec) { const x = d.sections[Number(t.dataset.sec)]; x.dur = clamp(x.dur + Number(t.dataset.d) * 15, 15, 900); renderEditor(); return; }
  if (t.dataset.secdel) { if (d.sections.length > 1) d.sections.splice(Number(t.dataset.secdel), 1); renderEditor(); return; }
  if (t.dataset.secup) { const i = Number(t.dataset.secup); if (i > 0) d.sections.splice(i - 1, 0, d.sections.splice(i, 1)[0]); renderEditor(); return; }
  if (t.dataset.secadd) { addSection(t.dataset.secadd); return; }
}

$('edName').addEventListener('input', (e) => { draft.name = e.target.value.slice(0, 40); });
$('edCustom').addEventListener('submit', (e) => {
  e.preventDefault();
  const n = $('edCustomName').value.trim();
  $('edCustomName').value = '';
  addSection(n);
});
$('edCancel').addEventListener('click', () => { draft = null; show('setup'); });
$('edDone').addEventListener('click', () => {
  if (!draft.sections.length) return;
  if (!draft.name.trim()) draft.name = draft.sections.map((x) => x.name).join(' + ');
  draft.name = draft.name.trim();
  const was = config;
  config = draft;
  draft = null;
  if (draftIsNew) loadedPresetId = null; // neuer Ablauf gehört zu keiner Vorlage
  if (draftIsNew || !sameConfig(was, config)) { selectedPresetId = null; editedSinceSave = true; }
  saveConfig();
  show('setup');
});

/* ================= Eingaben ================= */

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-del]');
  if (!t) return;
  if (t.dataset.del) {
    e.stopPropagation();
    customPresets = customPresets.filter((p) => p.id !== t.dataset.del);
    if (loadedPresetId === t.dataset.del) loadedPresetId = null;
    store.set('presets', customPresets);
    renderSetup();
    return;
  }
  if (t.dataset.mode) {
    if (config.mode !== t.dataset.mode) {
      config = normalize(MODE_DEFAULTS[t.dataset.mode]);
      selectedPresetId = loadedPresetId = config.id;
      editedSinceSave = false;
      saveConfig();
    }
    renderSetup();
    return;
  }
  if (t.dataset.preset) {
    const p = BUILTIN.concat(customPresets).find((x) => x.id === t.dataset.preset);
    if (p) { config = normalize(p); selectedPresetId = loadedPresetId = p.id; editedSinceSave = false; saveConfig(); renderSetup(); }
    return;
  }
  if (t.dataset.transition) { config.transition = t.dataset.transition; changed(); return; }
  if (t.dataset.rmode) { config.roundsMode = t.dataset.rmode; changed(); return; }
  if (t.dataset.pc) { config.partnerChange = t.dataset.pc; changed(); return; }
  if (t.dataset.qsec) {
    const x = config.sections[Number(t.dataset.qsec)];
    x.dur = Math.min(900, Math.max(15, x.dur + Number(t.dataset.d) * 15));
    changed();
    return;
  }
  if (t.dataset.k) { stepField(t.dataset.k, Number(t.dataset.d)); return; }
  if (t.dataset.sound) { ctx(); sounds[t.dataset.sound](); return; }
  // Signaltöne: Antippen wählt aus und spielt den Ton zur Probe
  if (t.dataset.signaltype) { settings.signal = t.dataset.signaltype; saveSettings(); renderSettings(); ctx(); sounds.end(); return; }
  if (t.dataset.signalcount) { settings.signalCount = t.dataset.signalcount; saveSettings(); renderSettings(); ctx(); sounds.end(); return; }
  if (t.dataset.warntype) { settings.warnType = t.dataset.warntype; saveSettings(); renderSettings(); ctx(); sounds.warn(); return; }
  if (t.dataset.newpreset) { openNewDialog(); return; }
  if (t.dataset.newmode) { closeNewDialog(); newPreset(t.dataset.newmode); return; }
  if (t.dataset.edit) { openEditor(); return; }
  if (current === 'editor') editorClick(t);
});

$('btnStart').addEventListener('click', startTraining);
$('btnSettings').addEventListener('click', () => show('settings'));
$('btnFullscreen').addEventListener('click', () => {
  try {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  } catch (e) { /* nicht unterstützt */ }
});
function updateFullscreenButton() {
  const fs = !!document.fullscreenElement;
  $('btnFullscreen').textContent = fs ? 'Vollbild aus' : 'Vollbild';
  // In der installierten App gibt es keine Browserleiste, der Knopf ist dort unnötig
  $('btnFullscreen').hidden = !document.fullscreenEnabled || (isStandalone() && !fs);
}
document.addEventListener('fullscreenchange', updateFullscreenButton);
$('btnSettingsBack').addEventListener('click', () => show('setup'));
// Eingebettet (z. B. als Artifact) sind prompt()/confirm() gesperrt, darum eigene Bedienelemente
$('btnSavePreset').addEventListener('click', () => {
  $('btnSavePreset').hidden = true;
  $('presetForm').hidden = false;
  $('presetName').value = shortName(config);
  $('presetName').focus();
  $('presetName').select();
});
function closePresetForm() {
  $('presetForm').hidden = true;
  $('btnSavePreset').hidden = false;
}
$('presetCancel').addEventListener('click', closePresetForm);
// Geladene eigene Vorlage mit den aktuellen Einstellungen überschreiben
$('btnUpdatePreset').addEventListener('click', () => {
  const i = customPresets.findIndex((p) => p.id === loadedPresetId);
  if (i < 0) return;
  const old = customPresets[i];
  customPresets[i] = Object.assign(clone(config), { id: old.id, name: config.mode === 'ablauf' ? config.name : old.name });
  store.set('presets', customPresets);
  selectedPresetId = old.id;
  editedSinceSave = false;
  saveConfig();
  renderSetup();
});
// Endzeit bei „Bis Uhrzeit“
document.addEventListener('change', (e) => {
  if (e.target.id === 'untilTime' && /^\d\d:\d\d$/.test(e.target.value)) { config.untilTime = e.target.value; changed(); }
});
$('presetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('presetName').value.trim();
  if (!name) return;
  closePresetForm();
  const p = Object.assign(clone(config), { id: 'c' + Date.now(), name: name.slice(0, 40) });
  if (p.mode === 'ablauf') config.name = p.name;
  customPresets.push(p);
  selectedPresetId = loadedPresetId = p.id;
  editedSinceSave = false;
  store.set('presets', customPresets);
  saveConfig();
  renderSetup();
});

$('btnMain').addEventListener('click', primary);
$('btnLos').addEventListener('click', primary);
$('btnSkip').addEventListener('click', skip);
$('btnPlus').addEventListener('click', plus30);
// Beenden nur durch langes Drücken (1 s), damit es nicht aus Versehen passiert
const STOP_HOLD_MS = 1000;
let stopHold = null;
let stopHintTimer = null;
function cancelStopHold() {
  if (!stopHold) return;
  clearTimeout(stopHold);
  stopHold = null;
  $('btnStop').classList.remove('holding');
}
$('btnStop').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  $('btnStop').classList.add('holding');
  stopHold = setTimeout(() => { stopHold = null; $('btnStop').classList.remove('holding'); stopTraining(); }, STOP_HOLD_MS);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => $('btnStop').addEventListener(ev, () => {
  if (stopHold) {
    // Zu kurz gedrückt: kurzer Hinweis
    cancelStopHold();
    clearTimeout(stopHintTimer);
    $('btnStop').classList.add('hint');
    stopHintTimer = setTimeout(() => $('btnStop').classList.remove('hint'), 1500);
  }
}));
$('btnStop').addEventListener('contextmenu', (e) => e.preventDefault());

$('setTheme').addEventListener('click', (e) => {
  const b = e.target.closest('[data-themeval]');
  if (!b) return;
  settings.theme = b.dataset.themeval; saveSettings(); applyTheme(); renderSettings();
});
$('setVolume').addEventListener('input', (e) => { settings.volume = Number(e.target.value); saveSettings(); });
$('setWarn').addEventListener('change', (e) => { settings.warn = Number(e.target.value); saveSettings(); });
$('setLead').addEventListener('change', (e) => { settings.lead = Number(e.target.value); saveSettings(); });
$('setMedia').addEventListener('change', (e) => { settings.media = e.target.checked; saveSettings(); if (settings.media) mediaOn(); else mediaOff(); });

/* Handsender / Tastatur */
const PRIMARY_KEYS = [' ', 'Enter', 'PageDown', 'ArrowRight', 'ArrowDown', 'AudioVolumeUp', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'F5'];
const SECONDARY_KEYS = ['PageUp', 'ArrowLeft', 'ArrowUp', 'AudioVolumeDown', 'MediaTrackNext', 'MediaTrackPrevious'];

function showKey(text) { const el = $('keyTest'); if (el) el.textContent = text; }

window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  // Offenes Auswahlfenster: Escape schließt, sonst keine Uhr-Tasten
  if (!$('newDialog').hidden) { if (e.key === 'Escape') closeNewDialog(); return; }
  showKey(e.key === ' ' ? 'Leertaste' : e.key);
  if (current === 'settings') return;
  if (PRIMARY_KEYS.includes(e.key)) {
    e.preventDefault();
    if (!e.repeat) primary();
  } else if (SECONDARY_KEYS.includes(e.key)) {
    e.preventDefault();
    if (!e.repeat) secondary();
  }
});

/* ================= Vorlagen sichern und teilen (Datei) ================= */

const EXPORT_FORMAT = 1;
const MAX_IMPORT_BYTES = 200 * 1024;
const MAX_IMPORT_PRESETS = 100;

function exportData() {
  const data = { app: 'randori-uhr', format: EXPORT_FORMAT, version: APP_VERSION, exported: new Date().toISOString(),
    presets: customPresets.map(clone) };
  if ($('expSettings').checked) data.settings = clone(settings);
  return data;
}
function exportFileName() { return 'randori-uhr-vorlagen-' + new Date().toISOString().slice(0, 10) + '.json'; }

function setBackupMsg(text, bad) {
  const el = $('backupMsg');
  el.textContent = text;
  el.hidden = !text;
  el.classList.toggle('bad', !!bad);
}

$('btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = exportFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  setBackupMsg(customPresets.length + ' eigene Vorlage(n) exportiert' + ($('expSettings').checked ? ' (mit Einstellungen)' : '') + '.');
});

// Teilen (z. B. per WhatsApp oder Mail), wo der Browser Dateien teilen kann
function canShareFiles() {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] })); } catch (e) { return false; }
}
$('btnShare').hidden = !canShareFiles();
$('btnShare').addEventListener('click', async () => {
  const file = new File([JSON.stringify(exportData(), null, 2)], exportFileName(), { type: 'application/json' });
  try { await navigator.share({ files: [file], title: 'Randori-Uhr Vorlagen' }); } catch (e) { /* abgebrochen */ }
});

let pendingImport = null;

$('btnImport').addEventListener('click', () => { $('importFile').value = ''; $('importFile').click(); });
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  pendingImport = null;
  $('importBox').hidden = true;
  if (file.size > MAX_IMPORT_BYTES) { setBackupMsg('Die Datei ist zu groß für eine Vorlagen-Datei.', true); return; }
  let data;
  try { data = JSON.parse(await file.text()); } catch (err) { setBackupMsg('Die Datei konnte nicht gelesen werden. Ist es eine exportierte Randori-Uhr-Datei?', true); return; }
  if (!data || typeof data !== 'object' || data.app !== 'randori-uhr' || !Array.isArray(data.presets)) {
    setBackupMsg('Das ist keine Vorlagen-Datei der Randori-Uhr.', true);
    return;
  }
  if (Number(data.format) > EXPORT_FORMAT) { setBackupMsg('Die Datei stammt aus einer neueren Version der Uhr. Bitte die Uhr erst aktualisieren.', true); return; }
  const presets = data.presets.slice(0, MAX_IMPORT_PRESETS).filter((p) => p && typeof p === 'object').map(normalize);
  const hasSettings = !!(data.settings && typeof data.settings === 'object');
  if (!presets.length && !hasSettings) { setBackupMsg('Die Datei enthält keine Vorlagen.', true); return; }
  pendingImport = { presets, settings: hasSettings ? sanitizeSettings(data.settings) : null };
  setBackupMsg('');
  $('importSummary').textContent = 'Die Datei enthält ' + presets.length + ' Vorlage(n)' + (hasSettings ? ' und Einstellungen' : '') + ': ' +
    presets.slice(0, 6).map((p) => p.name || shortName(p)).join(', ') + (presets.length > 6 ? ' …' : '');
  $('impSettingsRow').hidden = !hasSettings;
  $('impSettings').checked = false;
  $('importBox').hidden = false;
});

// Gleiche Namen beim Hinzufügen unterscheidbar machen: „Name (2)“
function uniqueName(name, taken) {
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(name + ' (' + n + ')')) n++;
  return name + ' (' + n + ')';
}

function applyImport(replace) {
  if (!pendingImport) return;
  const base = replace ? [] : customPresets.slice();
  const taken = new Set(BUILTIN.concat(base).map((p) => p.name));
  const stamp = Date.now();
  const added = pendingImport.presets.map((p, i) => {
    const name = uniqueName(p.name || shortName(p), taken);
    taken.add(name);
    return Object.assign(clone(p), { id: 'c' + stamp + '-' + i, name });
  });
  customPresets = base.concat(added);
  store.set('presets', customPresets);
  if (!customPresets.some((p) => p.id === loadedPresetId)) loadedPresetId = null;
  let msg = added.length + ' Vorlage(n) ' + (replace ? 'übernommen, eigene Vorlagen ersetzt' : 'hinzugefügt');
  if (pendingImport.settings && $('impSettings').checked) {
    settings = pendingImport.settings;
    saveSettings();
    applyTheme();
    renderSettings();
    updateMediaState();
    msg += ', Einstellungen übernommen';
  }
  pendingImport = null;
  $('importBox').hidden = true;
  saveConfig();
  setBackupMsg(msg + '.');
}
$('impAdd').addEventListener('click', () => applyImport(false));
$('impReplace').addEventListener('click', () => applyImport(true));
$('impCancel').addEventListener('click', () => { pendingImport = null; $('importBox').hidden = true; });

/* ================= Update-Hinweis ================= */

// Neue Version ist geladen: Hinweis zeigen (nicht mitten im Training)
let updateReady = false;
function showUpdateBar() { $('updateBar').hidden = !(updateReady && current !== 'run'); }
$('updateBar').addEventListener('click', () => location.reload());

/* ================= Installation & Diagnose ================= */

let installEvent = null;
let installSignal = false;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  installSignal = true;
  updateInstallUi();
});
window.addEventListener('appinstalled', () => {
  installEvent = null;
  $('installHint').textContent = 'Installiert. Die App liegt jetzt auf dem Startbildschirm.';
  $('btnInstall').hidden = true;
});

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
}

function updateInstallUi() {
  const hint = $('installHint');
  if (isStandalone()) { hint.textContent = 'Läuft bereits als installierte App.'; $('btnInstall').hidden = true; return; }
  if (installEvent) { hint.textContent = 'Chrome meldet: installierbar.'; $('btnInstall').hidden = false; return; }
  hint.textContent = 'Chrome hat (noch) kein Installationssignal gegeben. Diagnose hilft weiter.';
  $('btnInstall').hidden = true;
}

$('btnInstall').addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt();
  const res = await installEvent.userChoice;
  $('installHint').textContent = res.outcome === 'accepted' ? 'Installation gestartet …' : 'Installation abgebrochen.';
  installEvent = null;
  $('btnInstall').hidden = true;
});

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth + '×' + img.naturalHeight);
    img.onerror = () => resolve('FEHLER');
    img.src = src;
  });
}

$('btnDiag').addEventListener('click', async () => {
  const out = $('diagOut');
  out.hidden = false;
  const lines = [];
  const add = (k, v) => { lines.push(k + ': ' + v); out.textContent = lines.join('\n'); };
  add('Version', APP_VERSION);
  add('Adresse', location.href);
  add('Browser', (navigator.userAgent.match(/(Chrome|SamsungBrowser|Firefox|EdgA|OPR)\/[\d.]+/g) || ['?']).join(' '));
  add('Android', (navigator.userAgent.match(/Android [\d.]+/) || ['nein'])[0]);
  add('Modus', isStandalone() ? 'installierte App' : 'Browser-Tab');
  add('Installationssignal', installSignal ? 'ja' : 'nein');
  add('HTTPS', location.protocol === 'https:' ? 'ja' : 'NEIN');
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    add('Service Worker', reg ? (reg.active ? 'aktiv' : 'registriert, nicht aktiv') + (navigator.serviceWorker.controller ? ', steuert Seite' : ', steuert Seite noch nicht') : 'KEINER');
  } catch (e) { add('Service Worker', 'FEHLER ' + e.message); }
  const link = document.querySelector('link[rel="manifest"]');
  try {
    const res = await fetch(link.href, { cache: 'no-store' });
    add('Manifest', res.status + ' ' + (res.headers.get('content-type') || ''));
    const m = await res.json();
    add('  name / id', m.name + ' / ' + (m.id || '-'));
    add('  start_url / scope', m.start_url + ' / ' + m.scope);
    add('  display', m.display + (m.orientation ? ', ' + m.orientation : ''));
    for (const ic of m.icons || []) {
      const url = new URL(ic.src, link.href).href;
      add('  Icon ' + ic.sizes + (ic.purpose ? ' ' + ic.purpose : ''), await loadImage(url + '?d=' + Date.now()));
    }
  } catch (e) { add('Manifest', 'FEHLER ' + e.message); }
  try {
    if (navigator.getInstalledRelatedApps) add('Verwandte Apps', (await navigator.getInstalledRelatedApps()).length);
  } catch (e) { /* egal */ }
});

/* ================= Start ================= */

store.set('presets', customPresets); // umgewandelte alte Vorlagen sichern
applyTheme();
$('appVersion').textContent = APP_VERSION;
updateMediaState();
updateFullscreenButton();
show('setup');

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) { updateReady = true; showUpdateBar(); }
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then((reg) => {
    // Beim Zurückkehren zur App nach Updates sehen
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {}));
}
