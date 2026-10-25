'use strict';

// Bei jeder Änderung erhöhen (und CACHE in sw.js gleich setzen)
const APP_VERSION = '16';

/* ================= Vorlagen & Speicher ================= */

// Namensschema wie im Training üblich: Randori 3 × 3 = 3 Runden à 3 Min,
// Kakari 2 × 2 = 2 Min pro Partner, aufgeteilt auf 2 Angriffe
const BUILTIN = [
  { id: 'randori33', name: 'Randori 3 × 3', mode: 'randori', rounds: 3, work: 180, transition: 'pausewait', pause: 30 },
  { id: 'kakari22', name: 'Kakari 2 × 2', mode: 'kakari', partners: 4, perPartner: 120, swapEvery: 60, swapPause: 5, transition: 'wait', pause: 30 },
];

// Startwerte beim Wechsel des Modus (Zirkel hat keine eigene Vorlage)
const MODE_DEFAULTS = {
  randori: BUILTIN[0],
  kakari: BUILTIN[1],
  zirkel: { id: null, mode: 'zirkel', rounds: 10, work: 40, rest: 20 },
};

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
let customPresets = store.get('presets', []);
let config = Object.assign({}, store.get('config', BUILTIN[0]));
let selectedPresetId = store.get('selectedPreset', BUILTIN[0].id);

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
  if (c.mode === 'randori') return 'Randori ' + c.rounds + ' × ' + mins(c.work);
  if (c.mode === 'kakari') return 'Kakari ' + mins(c.perPartner) + ' × ' + Math.ceil(c.perPartner / c.swapEvery);
  return 'Zirkel ' + c.work + '/' + c.rest + ' × ' + c.rounds;
}

// Erklärung unter dem Vorlagennamen
function describe(c) {
  if (c.mode === 'randori') return c.rounds + ' Runden à ' + fmt(c.work) + ' · ' + transitionText(c);
  if (c.mode === 'kakari') return fmt(c.perPartner) + ' pro Partner, je ' + fmt(c.swapEvery) + ' angreifen · ' + c.partners + ' Partner';
  return c.rounds + ' Runden · ' + fmt(c.work) + ' Arbeit / ' + fmt(c.rest) + ' Pause';
}

function transitionText(c) {
  if (c.transition === 'auto') return 'dazwischen ' + fmt(c.pause) + ' Pause';
  if (c.transition === 'wait') return 'Halt bis „Los“';
  return 'Pause + Warten';
}

/* ================= Ablauf berechnen ================= */

function buildSegments(c) {
  const segs = [];
  if (settings.lead > 0) segs.push({ type: 'prep', dur: settings.lead });

  const transition = (round, total) => {
    if (c.transition === 'auto' || c.transition === 'pausewait') segs.push({ type: 'pause', dur: c.pause, round, total });
    if (c.transition === 'wait' || c.transition === 'pausewait') segs.push({ type: 'wait', dur: null, round, total });
  };

  if (c.mode === 'randori') {
    for (let r = 1; r <= c.rounds; r++) {
      segs.push({ type: 'work', dur: c.work, round: r, total: c.rounds });
      if (r < c.rounds) transition(r, c.rounds);
    }
  } else if (c.mode === 'kakari') {
    for (let p = 1; p <= c.partners; p++) {
      let t = 0;
      let attacker = 'A';
      let first = true;
      while (t < c.perPartner) {
        const d = Math.min(c.swapEvery, c.perPartner - t);
        segs.push({ type: 'work', dur: d, round: p, total: c.partners, attacker, swapStart: !first, from: t, partDur: c.perPartner });
        t += d;
        attacker = attacker === 'A' ? 'B' : 'A';
        first = false;
        if (t < c.perPartner && c.swapPause > 0) {
          segs.push({ type: 'swap', dur: c.swapPause, round: p, total: c.partners, attacker, from: t, partDur: c.perPartner });
        }
      }
      if (p < c.partners) transition(p, c.partners);
    }
  } else {
    for (let r = 1; r <= c.rounds; r++) {
      segs.push({ type: 'work', dur: c.work, round: r, total: c.rounds });
      if (r < c.rounds && c.rest > 0) segs.push({ type: 'pause', dur: c.rest, round: r, total: c.rounds });
    }
  }
  return segs;
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

function updateMediaState() {
  const el = $('appVersion');
  if (!el) return;
  let text = 'Version ' + APP_VERSION;
  if (settings.media) text += mediaActive() ? ' · Handsender bereit' : ' · Handsender: einmal tippen';
  el.textContent = text;
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
  run = { segs, i: -1, endAt: 0, remaining: 0, paused: false, waitSince: 0, lastSec: null, cfg: Object.assign({}, config), done: false };
  show('run');
  keepAwake();
  mediaOn();
  try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* egal */ }
  enter(0);
  clearInterval(timer);
  timer = setInterval(tick, 100);
}

function seg() { return run && run.segs[run.i]; }

function enter(i) {
  const prev = seg();
  run.i = i;
  const s = seg();
  if (!s) return finish();
  run.paused = false;
  run.lastSec = null;
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
  }
  if (run.remaining <= 0) { enter(run.i + 1); return; }
  renderTime();
}

function togglePause() {
  const s = seg();
  if (!s || s.dur == null) return;
  if (run.paused) {
    run.paused = false;
    run.endAt = Date.now() + run.remaining;
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
  if (n.type === 'work') {
    if (c.mode === 'kakari') return n.attacker + ' greift an · ' + fmt(n.dur);
    return (c.mode === 'zirkel' ? 'Arbeit ' : 'Runde ' + n.round + ' · ') + fmt(n.dur);
  }
  // Bei Randori und Kakari ist die Pause zugleich die Zeit für den Partnerwechsel
  if (n.type === 'pause') return c.mode === 'zirkel' ? 'Pause ' + fmt(n.dur) : 'Pause + Partnerwechsel · ' + fmt(n.dur);
  if (n.type === 'swap') return 'Rollenwechsel';
  if (n.type === 'wait') {
    const before = run.segs[i - 1];
    return before && before.type === 'pause' ? 'Uhr wartet auf „Los“' : 'Partnerwechsel · Uhr wartet auf „Los“';
  }
  return '';
}

function renderTime() {
  const s = seg();
  if (!s || s.dur == null) return;
  $('time').textContent = fmt(run.remaining / 1000);
  renderProgress();
}

function renderWaitSince() {
  $('waitSince').textContent = 'Wartet seit ' + fmt((Date.now() - run.waitSince) / 1000);
}

function renderProgress() {
  const s = seg();
  const c = run.cfg;
  const total = c.mode === 'kakari' ? c.partners : c.rounds;
  const box = $('progress');
  if (box.children.length !== total) {
    box.innerHTML = '';
    for (let k = 0; k < total; k++) box.appendChild(document.createElement('div')).appendChild(document.createElement('i'));
  }
  let round = s && s.round ? s.round : 0;
  let frac = 0;
  if (run.done) { round = total; frac = 1; }
  else if (s && s.type === 'work') {
    const elapsed = s.dur - run.remaining / 1000;
    frac = c.mode === 'kakari' ? (s.from + elapsed) / s.partDur : elapsed / s.dur;
  } else if (s && s.type === 'swap') {
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

  $('runMode').textContent = c.mode === 'kakari' ? 'Kakari Geiko' : c.mode === 'zirkel' ? 'Zirkel' : 'Randori';
  const total = c.mode === 'kakari' ? c.partners : c.rounds;
  const word = c.mode === 'kakari' ? 'Partner' : 'Runde';
  $('runRound').textContent = run.done ? 'Fertig' : s.round ? word + ' ' + s.round + ' / ' + total : '';

  const showRoles = c.mode === 'kakari' && (type === 'work' || type === 'swap');
  $('roles').hidden = !showRoles;
  body.classList.toggle('has-roles', showRoles);
  if (showRoles) {
    ['A', 'B'].forEach((p) => {
      const el = $('role' + p);
      const attacking = s.attacker === p;
      el.classList.toggle('attack', attacking);
      el.querySelector('small').textContent = type === 'swap' ? (attacking ? 'GREIFT GLEICH AN' : 'GLEICH UKE') : (attacking ? 'GREIFT AN' : 'UKE');
    });
  }

  const isWait = type === 'wait';
  $('waitBox').hidden = !isWait;
  $('time').hidden = isWait || type === 'done';
  let label = '';
  if (run.paused) label = 'Angehalten';
  else if (type === 'prep') label = 'Gleich geht’s los';
  else if (type === 'work') label = c.mode === 'zirkel' ? 'Arbeit' : c.mode === 'kakari' ? s.attacker + ' greift an' : 'Hajime';
  else if (type === 'pause') label = c.mode === 'zirkel' ? 'Pause' : 'Pause · Partner wechseln';
  else if (type === 'swap') label = 'Rollenwechsel';
  else if (type === 'done') label = 'Sore made · geschafft';
  $('phaseLabel').textContent = label;
  $('phaseLabel').hidden = isWait;

  $('nextInfo').textContent = run.done ? 'Zurück zur Auswahl' : nextText(run.i + 1);
  $('btnPlus').hidden = run.done || isWait;
  $('btnSkip').hidden = run.done;
  $('btnStop').hidden = run.done;
  $('btnMain').innerHTML = '<span>' + (run.done ? 'Fertig' : isWait ? 'Los · Hajime' : run.paused ? 'Weiter' : 'Anhalten') + '</span>';

  if (isWait) renderWaitSince(); else renderTime();
  renderProgress();
}

/* ================= Anzeige: Setup ================= */

const FIELDS = {
  randori: [
    { k: 'rounds', label: 'Runden', type: 'count', min: 1, max: 30 },
    { k: 'work', label: 'Rundenzeit', type: 'time', step: 15, min: 15, max: 900 },
    { k: 'transition', type: 'transition' },
    { k: 'pause', label: 'Pause', type: 'time', step: 5, min: 5, max: 300, when: (c) => c.transition !== 'wait' },
  ],
  kakari: [
    { k: 'partners', label: 'Partner', type: 'count', min: 1, max: 30 },
    { k: 'perPartner', label: 'Zeit pro Partner', type: 'time', step: 30, min: 30, max: 900, sub: (c) => 'je Angriff ' + fmt(c.swapEvery) },
    { k: 'swapEvery', label: 'Rollenwechsel alle', type: 'time', step: 15, min: 15, max: (c) => c.perPartner },
    { k: 'swapPause', label: 'Tauschpause', type: 'time', step: 1, min: 0, max: 30 },
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

function esc(t) { return String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

function renderSetup() {
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === config.mode)));

  const html = FIELDS[config.mode].filter((f) => !f.when || f.when(config)).map((f) => {
    if (f.type === 'transition') {
      const hint = { auto: 'Pause zum Partnerwechsel, danach startet die nächste Runde von selbst.', wait: 'Die Uhr hält zum Partnerwechsel an, bis du auf „Los“ tippst.', pausewait: 'Pause zum Partnerwechsel, danach hält die Uhr bis „Los“.' }[config.transition];
      return '<div class="field-col"><span class="lbl">' + (config.mode === 'kakari' ? 'Nach jedem Partner' : 'Nach jeder Runde') + '</span>' +
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

  const segs = buildSegments(config).filter((s) => s.type !== 'prep');
  const work = segs.filter((s) => s.type === 'work').reduce((a, s) => a + s.dur, 0);
  const all = segs.reduce((a, s) => a + (s.dur || 0), 0);
  const waits = segs.filter((s) => s.type === 'wait').length;
  $('summary').textContent = 'Kampf-/Arbeitszeit ' + fmt(work) + ' · gesamt ca. ' + Math.round(all / 60) + ' Min' + (waits ? ' + ' + waits + '× Partnerwechsel' : '');

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
}

function stepField(k, d) {
  const f = FIELDS[config.mode].find((x) => x.k === k);
  if (!f) return;
  const max = typeof f.max === 'function' ? f.max(config) : f.max;
  let step = f.type === 'count' ? 1 : f.step;
  const old = config[k];
  let v = Math.min(max, Math.max(f.min, old + d * step));
  if (f.type === 'time' && step > 1) v = Math.round(v / step) * step || (d > 0 ? step : f.min);
  v = Math.min(max, Math.max(f.min, v));
  config[k] = v;
  if (k === 'perPartner') {
    // Standard bleibt: Wechsel zur Hälfte der Zeit
    if (config.swapEvery === old / 2 || config.swapEvery > v) config.swapEvery = v / 2;
  }
  selectedPresetId = null;
  saveConfig();
  renderSetup();
}

/* ================= Bildschirme ================= */

let current = 'setup';
function show(name) {
  current = name;
  ['setup', 'settings', 'run'].forEach((n) => { $(n).hidden = n !== name; });
  document.body.classList.toggle('on-setup', name === 'setup');
  if (name !== 'run') document.body.className = 'on-' + name;
  if (name === 'setup') renderSetup();
  if (name === 'settings') { renderSettings(); updateInstallUi(); }
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

/* ================= Eingaben ================= */

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-del]');
  if (!t) return;
  if (t.dataset.del) {
    e.stopPropagation();
    customPresets = customPresets.filter((p) => p.id !== t.dataset.del);
    store.set('presets', customPresets);
    renderSetup();
    return;
  }
  if (t.dataset.mode) {
    if (config.mode !== t.dataset.mode) {
      config = Object.assign({}, MODE_DEFAULTS[t.dataset.mode]);
      selectedPresetId = config.id;
      saveConfig();
    }
    renderSetup();
    return;
  }
  if (t.dataset.preset) {
    const p = BUILTIN.concat(customPresets).find((x) => x.id === t.dataset.preset);
    if (p) { config = Object.assign({}, p); selectedPresetId = p.id; saveConfig(); renderSetup(); }
    return;
  }
  if (t.dataset.transition) { config.transition = t.dataset.transition; selectedPresetId = null; saveConfig(); renderSetup(); return; }
  if (t.dataset.k) { stepField(t.dataset.k, Number(t.dataset.d)); return; }
  if (t.dataset.sound) { ctx(); sounds[t.dataset.sound](); return; }
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
$('presetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('presetName').value.trim();
  if (!name) return;
  closePresetForm();
  const p = Object.assign({}, config, { id: 'c' + Date.now(), name: name.slice(0, 40) });
  customPresets.push(p);
  selectedPresetId = p.id;
  store.set('presets', customPresets);
  saveConfig();
  renderSetup();
});

$('btnMain').addEventListener('click', primary);
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

if (!FIELDS[config.mode]) config = Object.assign({}, BUILTIN[0]);
applyTheme();
updateMediaState();
updateFullscreenButton();
show('setup');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
