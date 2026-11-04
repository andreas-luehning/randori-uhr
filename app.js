'use strict';

// Bei jeder Änderung erhöhen (und CACHE in sw.js gleich setzen)
const APP_VERSION = '30';

/* ================= Vorlagen & Speicher ================= */

// Namensschema wie im Training üblich: Randori 3 × 3 = 3 Runden à 3 Min,
// Kakari-geiko 2 × 2 = 2 Runden, je Partner 1 Min Tori, dann Rollenwechsel, danach Partnerwechsel.
// Kakari-geiko ist eine Vorlage im Modus „Geiko“ (intern 'ablauf').
const BUILTIN = [
  { id: 'randori33', name: 'Randori 3 × 3', mode: 'randori', rounds: 3, work: 180, roundsMode: 'count', untilTime: '21:00',
    partnerChange: 'yes', transition: 'pausewait', pause: 30 },
  { id: 'kakari22', name: 'Kakari-geiko 2 × 2', mode: 'ablauf', roles: 'ab', sections: [{ name: 'Kakari-geiko', dur: 60 }],
    gap: 0, swapPause: 5, signal: 0, partners: 2, roundsMode: 'count', untilTime: '21:00', partnerChange: 'yes', transition: 'wait', pause: 30 },
];

// Startwerte beim Wechsel des Modus (Zirkel hat keine eigene Vorlage)
const MODE_DEFAULTS = {
  randori: BUILTIN[0],
  ablauf: BUILTIN[1],
  zirkel: { id: null, mode: 'zirkel', rounds: 10, work: 40, rest: 20 },
};
const ABLAUF_EXAMPLE = { name: 'Uchi-komi + Ne-waza', sections: [{ name: 'Uchi-komi', dur: 120 }, { name: 'Ne-waza', dur: 60 }] };

const ROUND_MODES = [['count', 'Anzahl'], ['open', 'Offen'], ['until', 'Bis Uhrzeit']];
const PARTNER_CHANGE = [['yes', 'Ja'], ['no', 'Nein'], ['call', 'Nach Ansage']];
const OPEN_ROUNDS = 500; // Obergrenze für „offen“ / „bis Uhrzeit“, wird praktisch nie erreicht

// Rollen im Ablauf: A komplett, dann B / abschnittsweise abwechseln / wechselseitig ohne feste Rollen
const ROLES = [['ab', 'A komplett, dann B'], ['section', 'Abschnittsweise'], ['mutual', 'Wechselseitig']];
const SIGNALS = [[0, 'Aus'], [15, '0:15'], [30, '0:30'], [60, '1:00']];
// Übungsformen in DJB-Schreibweise: erster Bestandteil groß, Rest klein, mit Bindestrich
const SECTION_NAMES = ['Tandoku-renshu', 'Ukemi', 'Uchi-komi', 'Nage-komi', 'Yakusoku-geiko', 'Kakari-geiko', 'Butsukari-geiko', 'Randori', 'Bodenrandori', 'Ne-waza'];
const MAX_SECTIONS = 8;

// Tiefe Kopie, damit Abschnitte von Vorlagen nicht versehentlich mitgeändert werden
function clone(o) { return JSON.parse(JSON.stringify(o)); }

// Anzahl Runden (= Partner) je Modus
function roundsOf(c) { return c.mode === 'ablauf' ? c.partners : c.rounds; }
function isCounted(c) { return c.mode === 'zirkel' || !c.roundsMode || c.roundsMode === 'count'; }
function plannedRounds(c) { return isCounted(c) ? roundsOf(c) : OPEN_ROUNDS; }

// Alte und unvollständige Einstellungen auf den aktuellen Stand bringen (z. B. früherer Modus „Kakari“)
function normalize(src) {
  let c = clone(src || BUILTIN[0]);
  if (c.mode === 'kakari') {
    const name = c.name ? c.name.replace(/^Kakari(?!-geiko)/, 'Kakari-geiko') : 'Kakari-geiko ' + mins(c.perPartner || 120) + ' × ' + (c.partners || 2);
    c = { id: c.id || null, name, mode: 'ablauf', roles: 'ab', sections: [{ name: 'Kakari-geiko', dur: Math.max(15, Math.round((c.perPartner || 120) / 2)) }],
      gap: 0, swapPause: c.swapPause != null ? c.swapPause : 5, signal: 0, partners: c.partners || 2, transition: c.transition || 'wait', pause: c.pause || 30 };
  }
  if (!['randori', 'ablauf', 'zirkel'].includes(c.mode)) return clone(BUILTIN[0]);
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
  return c;
}

// Gleich bis auf die Kennung? (für „Änderungen in Vorlage speichern“)
function sameConfig(a, b) {
  const x = clone(a); const y = clone(b);
  delete x.id; delete y.id;
  if (x.mode !== 'ablauf') { delete x.name; delete y.name; }
  return JSON.stringify(x) === JSON.stringify(y);
}

const DEFAULT_SETTINGS = { volume: 0.9, warn: 10, lead: 5, media: false, theme: 'klassisch' };

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

let settings = Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));
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
  if (c.mode === 'ablauf') {
    if (c.sections.length === 1 && c.roles !== 'mutual') return roundsText(c) + ' · je ' + fmt(c.sections[0].dur) + ' Tori';
    return ROLES.find((r) => r[0] === c.roles)[1] + ' · ' + c.sections.map((x) => x.name).join(' + ') + ' · ' + roundsText(c);
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

const sounds = {
  start() { gong(0); },
  end() { gong(0); gong(0.7); },
  finish() { gong(0); gong(0.7); gong(1.4); },
  warn() { tone(1200, 0, 0.08, 0.6, 'square'); tone(1200, 0.18, 0.08, 0.6, 'square'); },
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
  run = { segs, i: -1, endAt: 0, remaining: 0, paused: false, waitSince: 0, lastSec: null, cfg: clone(config), done: false,
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
  if (n.type === 'pause' && n.gap) return 'Kurze Pause ' + fmt(n.dur) + ' · dann ' + n.nextName;
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
    $('runMode').innerHTML = esc(c.name) + jp(kakari ? '掛かり稽古' : '稽古');
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
  else if (type === 'pause' && s.gap) label = 'Kurze Pause · gleich ' + s.nextName;
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

const TRANSITIONS = [['auto', 'Auto-Pause'], ['wait', 'Warten'], ['pausewait', 'Pause + Warten']];

// Japanische Schriftzeichen als dezente Verzierung (feste Texte, kein Nutzereingabe)
function jp(text) { return '<span class="jp-deco" lang="ja">' + text + '</span>'; }

function esc(t) { return String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

function renderSetup() {
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === config.mode)));

  const html = FIELDS[config.mode].filter((f) => !f.when || f.when(config)).map((f) => {
    if (f.type === 'ablauf') {
      const c = config;
      const info = (c.sections.length > 1 && c.gap ? 'Pause zwischen Abschnitten ' + fmt(c.gap) + ' · ' : '') +
        (c.roles !== 'mutual' ? 'Rollenwechsel ' + fmt(c.swapPause) : c.signal ? 'Wechselsignal alle ' + fmt(c.signal) : 'ohne Wechselsignal');
      // Zeiten direkt hier einstellbar; „Bearbeiten“ nur für den Aufbau
      return '<div class="ablauf-card"><div class="ablauf-head"><span><b>' + esc(c.name) + '</b><small class="muted">' +
        ROLES.find((r) => r[0] === c.roles)[1] + '</small></span>' +
        '<button type="button" class="chip" data-edit="1">Bearbeiten</button></div>' +
        c.sections.map((x, i) => '<div class="field"><span class="lbl">' + esc(x.name) + (c.roles !== 'mutual' ? '<small>je Partner</small>' : '') + '</span><span class="stepper">' +
          '<button type="button" data-qsec="' + i + '" data-d="-1" aria-label="' + esc(x.name) + ' kürzer">−</button><output>' + fmt(x.dur) + '</output>' +
          '<button type="button" data-qsec="' + i + '" data-d="1" aria-label="' + esc(x.name) + ' länger">+</button></span></div>').join('') +
        '<small class="muted">' + info + '</small></div>';
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
        ctl = '<small class="muted">bis du beendest</small>';
      }
      return '<div class="field-col"><div class="field"><span class="lbl">Runden</span>' + ctl + '</div>' +
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
  const upd = $('btnUpdatePreset');
  upd.hidden = !(loaded && !sameConfig(loaded, config));
  if (loaded) upd.textContent = 'Änderungen in „' + loaded.name + '“ speichern';
  $('btnSavePreset').classList.toggle('attention', editedSinceSave);

  const all_presets = BUILTIN.concat(customPresets);
  $('presetList').innerHTML = all_presets.map((p) => {
    const custom = !BUILTIN.includes(p);
    return '<button type="button" class="preset" data-preset="' + esc(p.id) + '" aria-pressed="' + (p.id === selectedPresetId) + '">' +
      '<b>' + esc(p.name) + '</b><span>' + esc(describe(p)) + '</span>' +
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
  if (c.mode === 'ablauf') one.partners = 1; else one.rounds = 1;
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
  $('setTheme').value = settings.theme;
  $('setVolume').value = settings.volume;
  $('setWarn').value = String(settings.warn);
  $('setLead').value = String(settings.lead);
  $('setMedia').checked = !!settings.media;
}

function saveSettings() { store.set('settings', settings); }

/* ================= Ablauf bearbeiten ================= */

let draft = null; // Arbeitskopie, wird erst mit „Fertig“ übernommen

function openEditor() {
  draft = clone(config);
  show('editor');
}

// Vorschau „So läuft eine Runde“
function roundPreview(d) {
  const tmp = [];
  buildAblauf(Object.assign({}, d, { partners: 1 }), tmp, () => {});
  return tmp.filter((x) => x.type === 'work').map((x) => (x.attacker ? x.attacker + ' ' : '') + x.section);
}

function edStepper(key, label, val, sub) {
  return '<div class="field"><span class="lbl">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span><span class="stepper">' +
    '<button type="button" data-ed="' + key + '" data-d="-1" aria-label="' + label + ' weniger">−</button><output>' + fmt(val) + '</output>' +
    '<button type="button" data-ed="' + key + '" data-d="1" aria-label="' + label + ' mehr">+</button></span></div>';
}

function renderEditor() {
  const d = draft;
  if (document.activeElement !== $('edName')) $('edName').value = d.name;
  $('edRoles').innerHTML = ROLES.map(([v, t]) => '<button type="button" role="radio" data-roles="' + v + '" aria-checked="' + (d.roles === v) + '">' + t + '</button>').join('');
  $('edRolesHint').textContent = {
    ab: 'Erst übt Partner A den ganzen Ablauf, dann Partner B.',
    section: 'Jeder Abschnitt erst für Partner A, dann für Partner B.',
    mutual: 'Jeder Abschnitt läuft einmal, die Paare wechseln sich selbst ab.',
  }[d.roles];
  const prev = roundPreview(d);
  $('edPreview').innerHTML = prev.map((p, i) => {
    const sep = i && d.roles !== 'mutual' && p[0] !== prev[i - 1][0] ? '<span class="muted">⇄</span>' : '';
    return sep + '<span class="sec-pill' + (p.startsWith('A ') ? ' a' : '') + '">' + esc(p) + '</span>';
  }).join('');
  let times = edStepper('gap', 'Pause zwischen Abschnitten', d.gap);
  if (d.roles === 'mutual') {
    times += '<div class="field-col"><span class="lbl">Wechselsignal<small>kurzer Ton als Erinnerung zum Tauschen</small></span><div class="seg" role="radiogroup" aria-label="Wechselsignal">' +
      SIGNALS.map(([v, t]) => '<button type="button" role="radio" data-signal="' + v + '" aria-checked="' + (d.signal === v) + '">' + t + '</button>').join('') + '</div></div>';
  } else {
    times += edStepper('swapPause', 'Zeit für Rollenwechsel', d.swapPause);
  }
  $('edTimes').innerHTML = times;
  $('edSections').innerHTML = d.sections.map((x, i) =>
    '<div class="sec-row"><button type="button" class="sec-up" data-secup="' + i + '" aria-label="' + esc(x.name) + ' nach oben"' + (i ? '' : ' disabled') + '>↑</button>' +
    '<span class="nm">' + (i + 1) + ' · ' + esc(x.name) + '</span><span class="stepper">' +
    '<button type="button" data-sec="' + i + '" data-d="-1" aria-label="' + esc(x.name) + ' kürzer">−</button><output>' + fmt(x.dur) + '</output>' +
    '<button type="button" data-sec="' + i + '" data-d="1" aria-label="' + esc(x.name) + ' länger">+</button></span>' +
    '<button type="button" class="sec-del" data-secdel="' + i + '" aria-label="' + esc(x.name) + ' entfernen"' + (d.sections.length < 2 ? ' disabled' : '') + '>×</button></div>'
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
  if (!draft.name.trim()) draft.name = draft.sections.map((x) => x.name).join(' + ');
  draft.name = draft.name.trim();
  const was = config;
  config = draft;
  draft = null;
  if (!sameConfig(was, config)) { selectedPresetId = null; editedSinceSave = true; }
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

$('setTheme').addEventListener('change', (e) => { settings.theme = e.target.value; saveSettings(); applyTheme(); });
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
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
