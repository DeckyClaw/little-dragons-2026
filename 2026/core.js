// Little Dragons 2026 - core: helpers, saved progress, synthesised sound + music, haptics.
// Classic script (no modules). Everything hangs on window.LD.
(function () {
  'use strict';
  var LD = window.LD = {};
  LD.VERSION = '2026.2'; // v2 (16.11.2026): new boss fight (phases, variable tempo, telegraphed attacks). Everything else as in 2026.1.
  LD.TAU = Math.PI * 2;
  LD.rnd = function (a, b) { return a + Math.random() * (b - a); };
  LD.rint = function (n) { return Math.floor(Math.random() * n); };
  LD.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  LD.lerp = function (a, b, t) { return a + (b - a) * t; };
  LD.outCubic = function (t) { t = LD.clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
  LD.outBack = function (t) { t = LD.clamp(t, 0, 1); var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  LD.fmtTime = function (s) { var t = Math.max(0, Math.ceil(s)); return Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60); };

  LD.COLORS = [
    { id: 'red',    name: 'RED',    main: '#f0372e', dark: '#8f1410', light: '#ffa197', wing: '#ffc9b8', rgb: [240, 55, 46] },
    { id: 'green',  name: 'GREEN',  main: '#35b83a', dark: '#17621c', light: '#aef29e', wing: '#d3f5b9', rgb: [53, 184, 58] },
    { id: 'blue',   name: 'BLUE',   main: '#3b6cf0', dark: '#19277a', light: '#a5bcff', wing: '#c9dcff', rgb: [59, 108, 240] },
    { id: 'yellow', name: 'YELLOW', main: '#f7d21f', dark: '#a8850a', light: '#fff6a8', wing: '#fff2c4', rgb: [247, 210, 31] }
  ];
  LD.GOLD = { id: 'gold', name: 'GOLD', main: '#ffd75a', dark: '#b8780a', light: '#fff8d0', wing: '#fff3c0', rgb: [255, 215, 90] };

  // ---------- saved progress (one JSON blob in localStorage) ----------
  var KEY = 'ld2026.save';
  var defaults = { high: { classic: 0, zen: 0, boss: 0 }, catches: 0, rounds: 0, bossWins: 0,
    sound: true, music: true, haptics: true, theme: 'dawn', unlocked: { boss: false, night: false, volcano: false } };
  function load() {
    var s = JSON.parse(JSON.stringify(defaults));
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw);
        for (var k in o) {
          if (!(k in s)) continue;
          if (typeof s[k] === 'object' && s[k] !== null) { for (var j in o[k]) if (j in s[k]) s[k][j] = o[k][j]; } else s[k] = o[k];
        }
      }
    } catch (e) { /* no storage: play without saving */ }
    return s;
  }
  LD.save = load();
  LD.persist = function () { try { window.localStorage.setItem(KEY, JSON.stringify(LD.save)); } catch (e) { /* ignore */ } };
  LD.UNLOCKS = [
    { id: 'boss', label: 'BOSS RUSH mode', how: 'Score 15 in Classic' },
    { id: 'night', label: 'NIGHT SKY theme', how: 'Catch 40 dragons in total' },
    { id: 'volcano', label: 'VOLCANO theme', how: 'Beat your first boss' }
  ];
  LD.BOSS_UNLOCK_SCORE = 15; LD.NIGHT_UNLOCK_CATCHES = 40;

  // ---------- haptics ----------
  LD.vibCount = 0;
  LD.vib = function (pattern) {
    if (!LD.save.haptics) return;
    LD.vibCount++;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not available */ }
  };

  // ---------- sound: Web Audio, no files ----------
  var actx = null, master = null, sfxBus = null, musicBus = null, analyser = null, noiseBuf = null, peakMax = 0, peakBuf = null;
  LD.sfxCount = 0;
  function audio() {
    if (!actx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        actx = new AC();
        master = actx.createGain(); master.gain.value = 0.8;
        var comp = actx.createDynamicsCompressor();
        analyser = actx.createAnalyser(); analyser.fftSize = 1024; peakBuf = new Float32Array(analyser.fftSize);
        sfxBus = actx.createGain(); sfxBus.gain.value = 1;
        musicBus = actx.createGain(); musicBus.gain.value = 0.55;
        sfxBus.connect(master); musicBus.connect(master); master.connect(comp); comp.connect(analyser); analyser.connect(actx.destination);
        noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') { try { actx.resume(); } catch (e2) { /* ignore */ } }
    return actx;
  }
  LD.audio = audio;
  LD.audioPeak = function () {
    if (!analyser) return { now: 0, max: peakMax, state: actx ? actx.state : 'none' };
    analyser.getFloatTimeDomainData(peakBuf);
    var m = 0; for (var i = 0; i < peakBuf.length; i++) { var v = Math.abs(peakBuf[i]); if (v > m) m = v; }
    if (m > peakMax) peakMax = m;
    return { now: m, max: peakMax, state: actx.state };
  };
  LD.audioSuspend = function (on) { if (!actx) return; try { if (on) actx.suspend(); else actx.resume(); } catch (e) { /* ignore */ } };

  function tone(freq, dur, type, vol, slideTo, delay, bus) {
    if (!LD.save.sound) return;
    var a = audio(); if (!a) return;
    var t0 = a.currentTime + (delay || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function noise(dur, vol, freq, ftype, delay, slideTo, bus) {
    if (!LD.save.sound) return;
    var a = audio(); if (!a) return;
    var t0 = a.currentTime + (delay || 0);
    var src = a.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var f = a.createBiquadFilter(); f.type = ftype || 'lowpass'; f.frequency.setValueAtTime(freq || 1200, t0);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    var g = a.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(bus || sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.03);
  }
  // combo pops walk up a pentatonic scale, so a streak sounds like a little melody
  var PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];
  var raw = {
    pop: function (combo) { var f = PENTA[Math.min(Math.max(combo, 1) - 1, PENTA.length - 1)]; tone(f, 0.16, 'sine', 0.24, f * 1.02); tone(f * 2, 0.09, 'triangle', 0.07); noise(0.05, 0.05, 3000, 'highpass'); },
    wrong: function () { tone(190, 0.3, 'sawtooth', 0.16, 70); tone(95, 0.3, 'square', 0.08, 50); },
    bonus: function () { [659.25, 880, 1174.66].forEach(function (f, i) { tone(f, 0.14, 'triangle', 0.17, null, i * 0.07); }); },
    level: function () { [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, 0.12, 'square', 0.06, null, i * 0.06); }); },
    gold: function () { [783.99, 987.77, 1174.66, 1567.98, 1975.53, 2349.32].forEach(function (f, i) { tone(f, 0.12, 'triangle', 0.15, null, i * 0.045); }); },
    hatch: function () { noise(0.07, 0.12, 2400, 'bandpass'); tone(700, 0.1, 'triangle', 0.1, 1300, 0.04); },
    fire: function () { noise(0.5, 0.16, 500, 'lowpass', 0, 2600); tone(110, 0.45, 'sawtooth', 0.07, 220); },
    comboUp: function () { noise(0.35, 0.12, 800, 'bandpass', 0, 4000); [440, 660, 880].forEach(function (f, i) { tone(f, 0.16, 'sawtooth', 0.07, f * 1.5, i * 0.05); }); },
    bossRoar: function () { tone(160, 0.8, 'sawtooth', 0.16, 55); noise(0.8, 0.14, 300, 'lowpass', 0, 1200); },
    bossHit: function () { tone(140, 0.2, 'square', 0.16, 60); noise(0.12, 0.14, 1800, 'bandpass'); tone(880, 0.08, 'triangle', 0.1, 1320); },
    bossDown: function () { noise(0.9, 0.2, 2000, 'lowpass', 0, 120); [392, 523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.16, null, 0.25 + i * 0.09); }); },
    // v2 boss sounds: warning before an attack, shield clang, rage roar, fireball popped
    bossWarn: function () { [0, 0.16, 0.32].forEach(function (d) { tone(740, 0.1, 'square', 0.1, 620, d); }); tone(90, 0.5, 'sawtooth', 0.08, 140); },
    bossClang: function () { tone(1250, 0.22, 'triangle', 0.14, 900); tone(1880, 0.16, 'sine', 0.08, 1500); noise(0.06, 0.1, 5000, 'highpass'); },
    bossRage: function () { tone(110, 1.1, 'sawtooth', 0.18, 40); tone(220, 0.9, 'square', 0.07, 660, 0.1); noise(1.0, 0.16, 200, 'lowpass', 0, 2400); },
    orbPop: function () { noise(0.14, 0.13, 1200, 'bandpass', 0, 5200); tone(520, 0.1, 'sine', 0.14, 1040); },
    heart: function () { tone(330, 0.18, 'triangle', 0.16, 165); tone(165, 0.3, 'sine', 0.14, 82, 0.12); },
    click: function () { tone(360, 0.07, 'triangle', 0.14, 560); },
    count: function (go) { tone(go ? 880 : 440, go ? 0.32 : 0.12, 'triangle', 0.18); if (go) tone(1320, 0.3, 'sine', 0.08); },
    tick: function () { tone(1150, 0.04, 'square', 0.05); },
    over: function () { [440, 349.23, 261.63, 196].forEach(function (f, i) { tone(f, 0.26, 'triangle', 0.17, null, i * 0.18); }); },
    high: function () { [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach(function (f, i) { tone(f, 0.18, 'triangle', 0.17, null, 0.8 + i * 0.1); }); },
    unlock: function () { [783.99, 1046.5, 1318.51, 1567.98].forEach(function (f, i) { tone(f, 0.2, 'sine', 0.15, null, 1.5 + i * 0.12); tone(f * 2, 0.1, 'triangle', 0.05, null, 1.5 + i * 0.12); }); },
    zen: function (n) { var f = PENTA[n % 5] / 2; tone(f, 0.9, 'sine', 0.16); tone(f * 1.5, 0.7, 'sine', 0.06, null, 0.03); }
  };
  LD.sfx = {};
  LD.SFX_NAMES = Object.keys(raw);
  LD.SFX_NAMES.forEach(function (k) { LD.sfx[k] = function (a) { LD.sfxCount++; raw[k](a); }; });

  // ---------- music: a tiny generative loop (Am F C G), scheduled ahead on the audio clock ----------
  var CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
  var ARP = [0, 1, 2, 1, 0, 2, 1, 2];
  var BPM = { menu: 84, classic: 104, zen: 70, boss: 128 };
  var mus = { next: 0, step: 0 };
  LD.musicSteps = 0;
  LD.music = function (kind) {
    if (!actx || !LD.save.sound || !LD.save.music || !BPM[kind] || actx.state !== 'running') return;
    var stepDur = 60 / BPM[kind] / 2, now = actx.currentTime, guard = 0;
    if (mus.next < now) mus.next = now + 0.05;
    while (mus.next < now + 0.3 && guard++ < 8) {
      var at = mus.next - now, i = mus.step % 8, ch = CHORDS[Math.floor(mus.step / 8) % 4];
      if (i === 0) tone(ch[0] / 2, stepDur * 6, 'sine', 0.1, null, at, musicBus);
      if (kind === 'boss' && i % 2 === 0) tone(ch[0] / 2, stepDur * 0.8, 'triangle', 0.07, null, at, musicBus);
      if (kind === 'zen') { if (i % 2 === 0) tone(ch[ARP[i]] * 2, stepDur * 3.5, 'sine', 0.045, null, at, musicBus); }
      else {
        tone(ch[ARP[i]] * (i >= 4 ? 2 : 1), stepDur * 1.5, 'triangle', 0.04, null, at, musicBus);
        if (i % 4 === 2 && kind !== 'menu') noise(0.03, 0.014, 6000, 'highpass', at, null, musicBus);
      }
      mus.step++; mus.next += stepDur; LD.musicSteps++;
    }
  };
})();
