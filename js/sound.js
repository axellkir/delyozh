'use strict';
// Звук без файлов: эффекты и две мелодии (карта — блатной вальсок, бой — евродэнс) на Web Audio.

let AC = null, MASTER = null, MUS = null, NOISE = null, musicOn = true;
function audioInit() {
  if (!AC) {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    AC = new C(); MASTER = AC.createGain(); MASTER.gain.value = 0.5;
    const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    MASTER.connect(comp); comp.connect(AC.destination);
    MUS = AC.createGain(); MUS.gain.value = 0.55; MUS.connect(MASTER);
    NOISE = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (AC.state === 'suspended') AC.resume();
}
function tone(f, dur, type = 'square', vol = 0.15, f2 = null, delay = 0, dest = MASTER) {
  if (!AC) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.2, freq = 2000, type = 'lowpass', delay = 0, dest = MASTER) {
  if (!AC) return;
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = NOISE; f.type = type; f.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const SFX = {
  step: () => noise(0.04, 0.05, 900),
  click: () => tone(900, 0.04, 'square', 0.08),
  coin: () => { tone(1320, 0.06, 'square', 0.1); tone(1760, 0.1, 'square', 0.1, null, 0.06); },
  flag: () => [523, 659, 784].forEach((f, i) => tone(f, 0.14, 'square', 0.12, null, i * 0.08)),
  level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.16, null, i * 0.09)),
  build: () => { noise(0.2, 0.3, 500); tone(160, 0.2, 'square', 0.15, 90, 0.05); tone(160, 0.2, 'square', 0.15, 90, 0.25); },
  battle: () => { tone(110, 0.6, 'sawtooth', 0.25, 55); noise(0.4, 0.3, 700); },
  shoot: () => { noise(0.1, 0.35, 3000); tone(300, 0.08, 'square', 0.12, 90); },
  hit: () => { noise(0.08, 0.3, 900); tone(140, 0.1, 'triangle', 0.3, 60); },
  kill: () => { noise(0.12, 0.35, 700); tone(220, 0.2, 'sawtooth', 0.18, 60); },
  spell: () => [880, 660, 990, 1320].forEach((f, i) => tone(f, 0.15, 'sine', 0.15, null, i * 0.06)),
  win: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'square', 0.14, null, i * 0.11)),
  lose: () => [392, 370, 349, 330, 220].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.16, null, i * 0.22)),
  turn: () => [659, 784, 988].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, null, i * 0.1)),
};
// звуки чужого бота и мгновенных боёв не играем
function sfx(n) { if ((B && B.quick) || (BOTTING && !B && n !== 'step')) return; if (AC && SFX[n]) SFX[n](); }

const NF = {}; ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach((n, i) => { for (let o = 1; o <= 6; o++) NF[n + o] = 440 * Math.pow(2, (i - 9) / 12 + o - 4); });
const CH = { Am: ['A', 'C', 'E'], Dm: ['D', 'F', 'A'], E: ['E', 'G#', 'B'], F: ['F', 'A', 'C'], G: ['G', 'B', 'D'], C: ['C', 'E', 'G'] };
// карта: вальс на три четверти, шансон
const WALTZ = ['Am', 'Am', 'Dm', 'Dm', 'G', 'G', 'C', 'E'];
const WMEL = ('A4 C5 E5|E5 D5 C5|D5 F5 A5|A5 G5 F5|G5 F5 D5|B4 D5 G5|C5 E5 G5|G#4 B4 E5').split('|').map(b => b.split(' '));
// бой: четыре на пол
const DPROG = ['Am', 'F', 'C', 'G'];
const DMEL = 'E5 - E5 D5 - C5 - D5 - E5 - - A4 - C5 - D5 - D5 C5 - A4 - C5 - D5 - - G4 - B4 - E5 - E5 D5 - C5 - E5 - G5 - - E5 - C5 - D5 - B4 - G4 - B4 - D5 - - - E5 - D5 -'.split(' ');
const MS = { mode: '', step: 0, next: 0 };
function musicTick() {
  if (!AC || !musicOn) return;
  const mode = B ? 'fight' : 'map', now = AC.currentTime;
  if (mode !== MS.mode) { MS.mode = mode; MS.step = 0; MS.next = now + 0.1; }
  if (MS.next < now - 0.3) MS.next = now + 0.05;
  const dur = mode === 'fight' ? 0.115 : 0.24;
  while (MS.next < now + 0.25) {
    const d = Math.max(0, MS.next - now), i = MS.step;
    if (mode === 'map') {
      const bar = Math.floor(i / 3) % 8, beat = i % 3, ch = CH[WALTZ[bar]];
      if (beat === 0) tone(NF[ch[0] + '2'], 0.3, 'triangle', 0.22, null, d, MUS);
      else ch.forEach(n => tone(NF[n + '4'], 0.12, 'square', 0.025, null, d, MUS));
      const m = WMEL[bar][beat]; if (Math.floor(i / 24) % 2 === 1) { tone(NF[m], 0.22, 'sawtooth', 0.04, null, d, MUS); tone(NF[m] * 1.01, 0.22, 'sawtooth', 0.03, null, d, MUS); }
    } else {
      const s = i % 16, bar = Math.floor(i / 16), ch = CH[DPROG[bar % 4]];
      if (s % 4 === 0) tone(150, 0.12, 'sine', 0.5, 45, d, MUS);
      if (s % 4 === 2) noise(0.04, 0.12, 7000, 'highpass', d, MUS);
      if (s === 4 || s === 12) noise(0.12, 0.2, 1800, 'bandpass', d, MUS);
      if (s % 4 !== 0) tone(NF[ch[0] + '2'] * (s % 4 === 2 ? 2 : 1), 0.1, 'sawtooth', 0.11, null, d, MUS);
      const n = DMEL[(bar % 4) * 16 + s]; if (n && n !== '-' && i >= 32) { tone(NF[n], 0.16, 'sawtooth', 0.05, null, d, MUS); tone(NF[n] * 1.008, 0.16, 'sawtooth', 0.04, null, d, MUS); }
    }
    MS.next += dur; MS.step++;
  }
}
