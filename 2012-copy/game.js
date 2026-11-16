// Little Dragons - 2026 browser rebuild of Denis's 2012 Android game (PanjuTorials).
// Plain HTML5 canvas, no libraries, no network, no build step. Open index.html in a browser.
//
// Rules kept from the 2012 original (read from the old video):
//   - dragons in four colours fly in straight lines and bounce off the screen edges
//   - the frame colour is the target colour; tap a dragon of that colour: score, paint splat, new target colour
//   - wrong colour: red splat and 5 seconds off the clock
//   - every 5 catches: 3 seconds back on the clock
//   - 1:00 on the clock, timer top left, score top right, menu with "Arcade", game over with Retry / Exit
// New in 2026: any screen size, mouse + touch + keyboard, streak multiplier, levels (faster, more dragons),
//   rainbow bonus dragon, particles, screen shake, synthesised sound, saved high score, end-of-round stats.
(() => {
  'use strict';

  const W = 1280, H = 720, TAU = Math.PI * 2;
  const VERSION = '1.0';
  const START_TIME = 60, WRONG_PENALTY = 5, BONUS_EVERY = 5, BONUS_TIME = 3, MAX_DRAGONS = 20, DRAGON_R = 46;
  const COLORS = [
    { id: 'red',    name: 'RED',    main: '#e3261f', dark: '#8f1410', light: '#ff8a80', tint: '#f3cdc8' },
    { id: 'green',  name: 'GREEN',  main: '#2fa82f', dark: '#17621c', light: '#9be88c', tint: '#cfe6c8' },
    { id: 'blue',   name: 'BLUE',   main: '#2f45c4', dark: '#19277a', light: '#93a6ff', tint: '#cccff0' },
    { id: 'yellow', name: 'YELLOW', main: '#f4d01c', dark: '#a8850a', light: '#fff6a8', tint: '#f5eebe' },
  ];

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let view = { scale: 1, ox: 0, oy: 0, dpr: 1 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const scale = Math.min(cw / W, ch / H);
    view = { scale, ox: (cw - W * scale) / 2, oy: (ch - H * scale) / 2, dpr };
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- helpers ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (n) => Math.floor(Math.random() * n);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => {
    const A = hexToRgb(a), B = hexToRgb(b);
    return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')';
  };
  const mixRgb = (A, B, t) => A.map((v, i) => v + (B[i] - v) * t);
  const rgbStr = (A) => 'rgb(' + A.map((v) => Math.round(v)).join(',') + ')';
  const fmtTime = (s) => { const t = Math.max(0, Math.ceil(s)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const FONT = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';

  function store(key, val) {
    try {
      if (val === undefined) return window.localStorage.getItem('littleDragons.' + key);
      window.localStorage.setItem('littleDragons.' + key, String(val));
    } catch (e) { /* storage not available: play without saving */ }
    return null;
  }

  // ---------- sound (synthesised, no files) ----------
  let actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, type, vol, slideTo, delay) {
    if (S.muted) return;
    const a = audio(); if (!a) return;
    const t0 = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    pop: (streak) => { const f = 480 + Math.min(streak, 12) * 45; tone(f, 0.11, 'sine', 0.25, f * 1.7); },
    wrong: () => { tone(170, 0.28, 'sawtooth', 0.18, 80); },
    bonus: () => { [660, 880, 1175].forEach((f, i) => tone(f, 0.12, 'triangle', 0.2, null, i * 0.07)); },
    rainbow: () => { [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.1, 'triangle', 0.18, null, i * 0.05)); },
    tick: () => { tone(1100, 0.04, 'square', 0.06); },
    click: () => { tone(340, 0.07, 'triangle', 0.15, 520); },
    count: (go) => { tone(go ? 880 : 440, go ? 0.3 : 0.12, 'triangle', 0.2); },
    over: () => { [440, 349, 262, 196].forEach((f, i) => tone(f, 0.25, 'triangle', 0.2, null, i * 0.18)); },
    high: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', 0.2, null, 0.8 + i * 0.1)); },
  };

  // ---------- state ----------
  const S = {
    screen: 'menu', t: 0, time: START_TIME, score: 0, catches: 0, misses: 0, streak: 0, bestStreak: 0, level: 1,
    target: 0, borderRgb: hexToRgb(COLORS[0].main), tintRgb: hexToRgb(COLORS[0].tint),
    dragons: [], splats: [], particles: [], floats: [], spawnQueue: [], clouds: [],
    shake: 0, countdown: 0, paused: false, rainbowIn: 14, lastTick: 0, flash: 0,
    high: parseInt(store('high') || '0', 10) || 0, muted: store('muted') === '1', newHigh: false,
    pointer: { x: -1, y: -1 }, log: [], rings: [],
  };
  const logEv = (type, extra) => { S.log.push(Object.assign({ t: +S.t.toFixed(2), type }, extra || {})); if (S.log.length > 600) S.log.shift(); };

  for (let i = 0; i < 16; i++) S.clouds.push({ x: rnd(0, W), y: rnd(40, H - 40), s: rnd(0.7, 1.7), v: rnd(6, 20) });

  function speedFor(level) { return 125 * (1 + 0.07 * (level - 1)); }

  function makeDragon(color, opts) {
    const o = opts || {};
    const ang = rnd(0, TAU), sp = speedFor(S.level) * rnd(0.75, 1.25) * (o.rainbow ? 1.9 : 1);
    return {
      x: o.x !== undefined ? o.x : rnd(DRAGON_R + 20, W - DRAGON_R - 20),
      y: o.y !== undefined ? o.y : rnd(DRAGON_R + 80, H - DRAGON_R - 20),
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      color, r: DRAGON_R, phase: rnd(0, TAU), grow: 0, wobble: 0, rainbow: !!o.rainbow, life: o.rainbow ? 6 : Infinity,
    };
  }

  function startGame() {
    S.screen = 'play'; S.time = START_TIME; S.score = 0; S.catches = 0; S.misses = 0; S.streak = 0; S.bestStreak = 0;
    S.level = 1; S.dragons = []; S.splats = []; S.particles = []; S.floats = []; S.spawnQueue = [];
    S.shake = 0; S.paused = false; S.countdown = 2.4; S.rainbowIn = rnd(12, 16); S.newHigh = false; S.flash = 0;
    for (let c = 0; c < 4; c++) for (let i = 0; i < 3; i++) S.dragons.push(makeDragon(c));
    S.target = rint(4);
    S.borderRgb = hexToRgb(COLORS[S.target].main); S.tintRgb = hexToRgb(COLORS[S.target].tint);
    S.lastCount = 3; sfx.count(false);
    logEv('start');
  }

  function endGame() {
    S.screen = 'over'; S.overT = 0;
    if (S.score > S.high) { S.high = S.score; S.newHigh = true; store('high', S.high); sfx.high(); }
    sfx.over();
    logEv('over', { score: S.score, catches: S.catches, misses: S.misses });
  }

  function pickTarget() {
    const counts = [0, 0, 0, 0];
    S.dragons.forEach((d) => { if (!d.rainbow) counts[d.color]++; });
    const options = [0, 1, 2, 3].filter((c) => c !== S.target && counts[c] > 0);
    if (options.length) S.target = options[rint(options.length)];
  }

  function makeSplat(x, y, color, size) {
    const lobes = [], drops = [], n = 8 + rint(5);
    for (let i = 0; i < n; i++) lobes.push({ a: (i / n) * TAU + rnd(-0.25, 0.25), d: size * rnd(0.5, 1.15), r: size * rnd(0.16, 0.3) });
    for (let i = 0; i < 6; i++) drops.push({ a: rnd(0, TAU), d: size * rnd(1.3, 2.0), r: size * rnd(0.06, 0.13) });
    return { x, y, color, size, lobes, drops, age: 0 };
  }
  function burst(x, y, color, n, power) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(0.3, 1) * power;
      S.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: rnd(0.4, 0.9), max: 0.9, color, size: rnd(3, 8) });
    }
  }
  function floatText(x, y, text, color, size) { S.floats.push({ x, y, text, color, size: size || 34, life: 1.1 }); }

  function tapPlay(x, y) {
    if (S.paused || S.countdown > 0) return;
    let best = null, bestD = Infinity;
    for (const d of S.dragons) {
      if (d.grow < 0.5) continue;
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist < d.r * 1.15 && dist < bestD) { best = d; bestD = dist; }
    }
    if (!best) return; // tapping the sky costs nothing
    if (best.rainbow) {
      S.dragons.splice(S.dragons.indexOf(best), 1);
      S.score += 5; S.time = Math.min(START_TIME, S.time + 5);
      for (let c = 0; c < 4; c++) burst(best.x, best.y, COLORS[c].main, 10, 420);
      floatText(best.x, best.y - 30, '+5  +5 s', '#ffffff', 44);
      S.flash = 0.35; sfx.rainbow(); logEv('rainbow');
      return;
    }
    if (best.color === S.target) {
      const col = COLORS[best.color];
      S.catches++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
      const mult = S.streak >= 10 ? 3 : S.streak >= 5 ? 2 : 1;
      S.score += mult;
      S.splats.push(makeSplat(best.x, best.y, col.main, rnd(30, 44)));
      if (S.splats.length > 90) S.splats.shift();
      burst(best.x, best.y, col.main, 16, 360); burst(best.x, best.y, col.light, 6, 240);
      floatText(best.x, best.y - 30, '+' + mult, '#ffffff', mult > 1 ? 46 : 36);
      S.dragons.splice(S.dragons.indexOf(best), 1);
      S.spawnQueue.push({ t: 0.5, color: best.color });
      sfx.pop(S.streak); logEv('catch', { color: col.id, mult });
      if (S.catches % BONUS_EVERY === 0) {
        S.time = Math.min(START_TIME, S.time + BONUS_TIME); S.level++;
        floatText(150, 110, '+' + BONUS_TIME + ' s', '#7dff8a', 44);
        floatText(W / 2, 170, 'LEVEL ' + S.level, '#ffffff', 52);
        S.dragons.forEach((d) => { d.vx *= 1.07; d.vy *= 1.07; });
        if (S.dragons.length + S.spawnQueue.length < MAX_DRAGONS) S.spawnQueue.push({ t: 0.8, color: rint(4) });
        sfx.bonus(); logEv('bonus', { level: S.level });
      }
      pickTarget();
    } else {
      S.misses++; S.streak = 0; S.time -= WRONG_PENALTY; S.shake = 14; best.wobble = 0.5;
      S.splats.push(makeSplat(best.x, best.y + 18, '#b3120e', rnd(22, 30)));
      burst(best.x, best.y, '#c4130f', 14, 300);
      floatText(best.x, best.y - 30, '-' + WRONG_PENALTY + ' s', '#ff5a4f', 44);
      sfx.wrong(); logEv('wrong', { color: COLORS[best.color].id, target: COLORS[S.target].id });
      if (S.time <= 0) { S.time = 0; endGame(); }
    }
  }

  // ---------- buttons ----------
  function buttons() {
    if (S.screen === 'menu') return [
      { id: 'arcade', x: W / 2 - 170, y: 548, w: 340, h: 116, label: 'Arcade', style: 'arcade', act: startGame },
      { id: 'mute', x: W - 150, y: 78, w: 58, h: 58, style: 'icon', icon: 'mute', act: toggleMute },
      { id: 'full', x: W - 82, y: 78, w: 58, h: 58, style: 'icon', icon: 'full', act: toggleFull },
    ];
    if (S.screen === 'over') return [
      { id: 'retry', x: 40, y: 586, w: 260, h: 100, label: 'Retry', style: 'blue', act: startGame },
      { id: 'exit', x: W - 300, y: 586, w: 260, h: 100, label: 'Exit', style: 'red', act: () => { S.screen = 'menu'; } },
    ];
    return [];
  }
  function toggleMute() { S.muted = !S.muted; store('muted', S.muted ? '1' : '0'); }
  function toggleFull() {
    try {
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
    } catch (e) { /* not allowed here */ }
  }
  const inside = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

  // ---------- input ----------
  function toLogical(ev) { return { x: (ev.clientX - view.ox) / view.scale, y: (ev.clientY - view.oy) / view.scale }; }
  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault(); audio();
    const p = toLogical(ev); S.pointer = p;
    S.rings.push({ x: p.x, y: p.y, life: 0.4 });
    if (S.screen === 'play') { tapPlay(p.x, p.y); return; }
    if (S.screen === 'over' && S.overT < 0.6) return; // no accidental taps right after the last catch
    for (const b of buttons()) if (inside(b, p.x, p.y)) { sfx.click(); b.act(); return; }
  });
  canvas.addEventListener('pointermove', (ev) => { S.pointer = toLogical(ev); });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  window.addEventListener('keydown', (ev) => {
    const k = ev.key.toLowerCase();
    if (k === 'm') toggleMute();
    else if (k === 'f') toggleFull();
    else if (k === 'p' && S.screen === 'play' && S.countdown <= 0) S.paused = !S.paused;
    else if (k === 'escape' && S.screen !== 'menu') { S.screen = 'menu'; }
    else if ((k === 'enter' || k === ' ') && S.screen !== 'play') { audio(); startGame(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.screen === 'play' && S.countdown <= 0) S.paused = true; });

  // ---------- update ----------
  function update(dt) {
    S.t += dt;
    for (const c of S.clouds) { c.x += c.v * dt; if (c.x > W + 160 * c.s) { c.x = -160 * c.s; c.y = rnd(40, H - 40); } }
    for (let i = S.rings.length - 1; i >= 0; i--) { S.rings[i].life -= dt; if (S.rings[i].life <= 0) S.rings.splice(i, 1); }
    if (S.screen === 'over') S.overT += dt;
    if (S.screen !== 'play' || S.paused) return;

    if (S.countdown > 0) {
      S.countdown -= dt;
      const n = Math.ceil(S.countdown / 0.8);
      if (n !== S.lastCount) { S.lastCount = n; sfx.count(n === 0); }
    } else {
      S.time -= dt;
      if (S.time <= 10 && Math.ceil(S.time) !== S.lastTick) { S.lastTick = Math.ceil(S.time); sfx.tick(); }
      if (S.time <= 0) { S.time = 0; endGame(); return; }
      S.rainbowIn -= dt;
      if (S.rainbowIn <= 0) {
        S.rainbowIn = rnd(13, 19);
        const left = Math.random() < 0.5;
        const d = makeDragon(0, { rainbow: true, x: left ? DRAGON_R + 4 : W - DRAGON_R - 4, y: rnd(120, H - 120) });
        d.vx = Math.abs(d.vx) * (left ? 1 : -1); if (Math.abs(d.vx) < 150) d.vx = 190 * (left ? 1 : -1);
        S.dragons.push(d); logEv('rainbowSpawn');
      }
    }

    for (let i = S.spawnQueue.length - 1; i >= 0; i--) {
      const q = S.spawnQueue[i]; q.t -= dt;
      if (q.t <= 0) { S.spawnQueue.splice(i, 1); S.dragons.push(makeDragon(q.color)); }
    }
    for (let i = S.dragons.length - 1; i >= 0; i--) {
      const d = S.dragons[i];
      d.grow = Math.min(1, d.grow + dt * 3.5); d.wobble = Math.max(0, d.wobble - dt); d.phase += dt * 13;
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.x < d.r) { d.x = d.r; d.vx = Math.abs(d.vx); } else if (d.x > W - d.r) { d.x = W - d.r; d.vx = -Math.abs(d.vx); }
      if (d.y < d.r + 8) { d.y = d.r + 8; d.vy = Math.abs(d.vy); } else if (d.y > H - d.r) { d.y = H - d.r; d.vy = -Math.abs(d.vy); }
      if (d.rainbow) { d.life -= dt; if (d.life <= 0) S.dragons.splice(i, 1); }
    }
    for (const s of S.splats) s.age += dt;
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const p = S.particles[i]; p.life -= dt; p.vy += 620 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) S.particles.splice(i, 1);
    }
    for (let i = S.floats.length - 1; i >= 0; i--) { const f = S.floats[i]; f.life -= dt; f.y -= 55 * dt; if (f.life <= 0) S.floats.splice(i, 1); }
    S.shake = Math.max(0, S.shake - dt * 40); S.flash = Math.max(0, S.flash - dt);
    const k = Math.min(1, dt * 9);
    S.borderRgb = mixRgb(S.borderRgb, hexToRgb(COLORS[S.target].main), k);
    S.tintRgb = mixRgb(S.tintRgb, hexToRgb(COLORS[S.target].tint), k);
  }

  // ---------- drawing ----------
  function text(str, x, y, size, color, align, stroke, weight) {
    ctx.font = (weight || 'bold') + ' ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = stroke; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }
  function rrect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function cloud(x, y, s, color) {
    ctx.fillStyle = color; ctx.beginPath();
    ctx.arc(x, y, 46 * s, 0, TAU); ctx.arc(x + 52 * s, y + 10 * s, 38 * s, 0, TAU); ctx.arc(x - 52 * s, y + 12 * s, 34 * s, 0, TAU);
    ctx.arc(x + 20 * s, y - 28 * s, 34 * s, 0, TAU); ctx.arc(x - 24 * s, y - 20 * s, 30 * s, 0, TAU);
    ctx.fill();
  }

  // One dragon, drawn around (0,0) on a 50-unit radius. o: {flap, lookX, lookY, shades, happy, rainbowHue}
  function drawDragon(x, y, r, colorIdx, o) {
    const c = COLORS[colorIdx]; o = o || {};
    let main = c.main, dark = c.dark, light = c.light;
    if (o.rainbowHue !== undefined) {
      main = 'hsl(' + o.rainbowHue + ',95%,58%)'; dark = 'hsl(' + o.rainbowHue + ',90%,30%)'; light = 'hsl(' + o.rainbowHue + ',100%,85%)';
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(o.tilt || 0); ctx.scale((r / 50) * (o.scale || 1), (r / 50) * (o.scale || 1));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const flap = o.flap || 0;
    for (const side of [-1, 1]) { // bat wings
      ctx.save(); ctx.translate(side * 30, -4); ctx.rotate(side * (-0.25 + flap * 0.55));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(side * 40, -24); ctx.lineTo(side * 31, -5); ctx.lineTo(side * 38, 8);
      ctx.lineTo(side * 22, 6); ctx.lineTo(side * 20, 19); ctx.lineTo(0, 12); ctx.closePath();
      ctx.fillStyle = '#d2bd98'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#6f5d40'; ctx.stroke();
      ctx.restore();
    }
    // crest: a different shape per colour, so colour is not the only cue
    ctx.fillStyle = dark; ctx.beginPath();
    if (colorIdx === 0 || o.rainbowHue !== undefined) { ctx.moveTo(-22, -40); ctx.lineTo(-30, -66); ctx.lineTo(-8, -46); ctx.moveTo(22, -40); ctx.lineTo(30, -66); ctx.lineTo(8, -46); }
    else if (colorIdx === 1) { for (let i = -1; i <= 1; i++) { ctx.moveTo(i * 16 - 9, -44); ctx.lineTo(i * 16, -64 + Math.abs(i) * 8); ctx.lineTo(i * 16 + 9, -44); } }
    else if (colorIdx === 2) { ctx.moveTo(-14, -44); ctx.quadraticCurveTo(-4, -78, 20, -70); ctx.quadraticCurveTo(6, -60, 14, -44); }
    else { for (let i = 0; i < 4; i++) { const a = -2.2 + i * 0.42; ctx.moveTo(Math.cos(a) * 40 - 5, Math.sin(a) * 44); ctx.lineTo(Math.cos(a) * 64, Math.sin(a) * 68); ctx.lineTo(Math.cos(a) * 40 + 7, Math.sin(a) * 44 + 3); } }
    ctx.fill();
    // body
    ctx.beginPath(); ctx.moveTo(0, -48); ctx.bezierCurveTo(34, -48, 43, -10, 37, 14); ctx.bezierCurveTo(31, 40, 12, 51, 0, 53);
    ctx.bezierCurveTo(-12, 51, -31, 40, -37, 14); ctx.bezierCurveTo(-43, -10, -34, -48, 0, -48); ctx.closePath();
    const g = ctx.createLinearGradient(-20, -48, 20, 53); g.addColorStop(0, main); g.addColorStop(1, dark);
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = dark; ctx.stroke();
    ctx.globalAlpha = 0.55; ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(0, 24, 17, 20, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    // eyes
    const lx = clamp(o.lookX || 0, -1, 1) * 4.5, ly = clamp(o.lookY || 0, -1, 1) * 3.5;
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(side * 13.5, -17, 12.5, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#222'; ctx.stroke();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(side * 13.5 + lx, -16 + ly, 5.2, 0, TAU); ctx.fill();
    }
    if (o.shades) {
      ctx.fillStyle = '#151515'; rrect(-28, -29, 26, 20, 6); ctx.fill(); rrect(2, -29, 26, 20, 6); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#151515'; ctx.beginPath(); ctx.moveTo(-3, -22); ctx.lineTo(3, -22); ctx.stroke();
    } else if (!o.happy) {
      ctx.lineWidth = 4.5; ctx.strokeStyle = '#1a1a1a'; ctx.beginPath();
      ctx.moveTo(-27, -35); ctx.lineTo(-5, -26); ctx.moveTo(27, -35); ctx.lineTo(5, -26); ctx.stroke();
    }
    ctx.lineWidth = 3; ctx.strokeStyle = '#1a1a1a'; ctx.beginPath();
    if (o.happy || o.shades) ctx.arc(0, 0, 9, 0.15 * Math.PI, 0.85 * Math.PI); else ctx.arc(0, 9, 7, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  function drawSplat(s) {
    const k = Math.min(1, s.age * 9 + 0.25);
    ctx.fillStyle = s.color; ctx.globalAlpha = 0.82; ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * 0.62 * k, 0, TAU);
    for (const l of s.lobes) { const px = s.x + Math.cos(l.a) * l.d * 0.75 * k, py = s.y + Math.sin(l.a) * l.d * 0.75 * k; ctx.moveTo(px + l.r * 1.5, py); ctx.arc(px, py, l.r * 1.5 * k, 0, TAU); }
    for (const d of s.drops) { const px = s.x + Math.cos(d.a) * d.d * k, py = s.y + Math.sin(d.a) * d.d * k; ctx.moveTo(px + d.r, py); ctx.arc(px, py, d.r, 0, TAU); }
    ctx.fill(); ctx.globalAlpha = 1;
  }

  function drawButton(b) {
    const hover = inside(b, S.pointer.x, S.pointer.y);
    ctx.save();
    if (hover) { ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(1.04, 1.04); ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2)); }
    if (b.style === 'icon') {
      rrect(b.x, b.y, b.w, b.h, 12); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#1d5fa8'; ctx.stroke();
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2; ctx.strokeStyle = '#1d3f6e'; ctx.fillStyle = '#1d3f6e'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      if (b.icon === 'mute') {
        ctx.beginPath(); ctx.moveTo(cx - 16, cy - 6); ctx.lineTo(cx - 8, cy - 6); ctx.lineTo(cx + 2, cy - 15); ctx.lineTo(cx + 2, cy + 15); ctx.lineTo(cx - 8, cy + 6); ctx.lineTo(cx - 16, cy + 6); ctx.closePath(); ctx.fill();
        if (S.muted) { ctx.strokeStyle = '#d3221c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 18, cy - 18); ctx.lineTo(cx + 18, cy + 18); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(cx + 4, cy, 9, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + 4, cy, 16, -0.9, 0.9); ctx.stroke(); }
      } else {
        const q = 15, e = 7; ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(cx + sx * q, cy + sy * (q - e)); ctx.lineTo(cx + sx * q, cy + sy * q); ctx.lineTo(cx + sx * (q - e), cy + sy * q); }
        ctx.stroke();
      }
    } else {
      const fill = b.style === 'arcade' ? ['#ffe95a', '#f2c81b', '#e2731a', '#e2731a'] : b.style === 'blue' ? ['#3fa7ee', '#1675c9', '#0c4f91', '#ffe95a'] : ['#e2453c', '#a8140f', '#6d0b08', '#ffe95a'];
      rrect(b.x, b.y + 6, b.w, b.h, 16); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h); g.addColorStop(0, fill[0]); g.addColorStop(1, fill[1]);
      rrect(b.x, b.y, b.w, b.h, 16); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = fill[2]; ctx.stroke();
      text(b.label, b.x + b.w / 2, b.y + b.h / 2 + 3, b.h * 0.56, fill[3], 'center', b.style === 'arcade' ? '#fff7c2' : 'rgba(0,0,0,0.35)');
    }
    ctx.restore();
  }

  function drawMenu() {
    ctx.fillStyle = '#58b9ea'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, 430); ctx.rotate(S.t * 0.05); ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 14; i++) { ctx.rotate(TAU / 14); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1200, -120); ctx.lineTo(1200, 120); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    S.clouds.slice(0, 7).forEach((c, i) => cloud(c.x, 150 + (i % 4) * 70, c.s * 1.25, i % 3 === 0 ? '#c9cdd2' : '#ffffff'));
    ctx.fillStyle = '#2d9a36'; ctx.beginPath(); ctx.ellipse(250, 560, 620, 210, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3bb043'; ctx.beginPath(); ctx.ellipse(980, 600, 640, 200, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1c7a2b'; ctx.beginPath(); ctx.ellipse(W / 2, 760, 900, 200, 0, 0, TAU); ctx.fill();

    const bob = (p) => Math.sin(S.t * 2 + p) * 8, flap = (p) => Math.sin(S.t * 9 + p);
    // green dragon with the alarm clock
    drawDragon(250, 400 + bob(0), 78, 1, { flap: flap(0), happy: true, lookX: Math.sin(S.t), lookY: -0.6 });
    ctx.save(); ctx.translate(250, 262 + bob(0)); ctx.rotate(Math.sin(S.t * 18) * 0.05);
    ctx.fillStyle = '#d3221c'; ctx.beginPath(); ctx.arc(-26, -36, 13, 0, TAU); ctx.arc(26, -36, 13, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 33, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d3221c'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + ((S.t * 0.4) % TAU)); ctx.closePath(); ctx.fill();
    ctx.restore();
    // red dragon with sunglasses, relaxing
    drawDragon(610, 380 + bob(2) * 0.5, 84, 0, { flap: flap(2) * 0.3, shades: true, tilt: -0.25 });
    // yellow dragon with the "!" bubble
    drawDragon(990, 400 + bob(4), 78, 3, { flap: flap(4), lookX: -0.8, lookY: -0.3 });
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(900, 268 + bob(4), 36, 0, TAU); ctx.fill(); ctx.stroke();
    text('!', 900, 270 + bob(4), 54, '#111', 'center');

    text('Little Dragons', W / 2, 92, 96, '#ffe95a', 'center', '#b8500f');
    text('first built 2012 for Android  -  rebuilt 2026 for the browser', W / 2, 162, 24, '#0e3d66', 'center');
    text('High score', 40, 96, 26, '#0e3d66', 'left');
    text(String(S.high), 40, 136, 50, '#ffffff', 'left', '#0e3d66');
    rrect(W / 2 - 430, 678, 860, 36, 10); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    text('Tap the dragons that match the frame colour.  Wrong colour: -5 s.  Every 5 catches: +3 s.', W / 2, 697, 20, '#ffffff', 'center', null, 'normal');
    buttons().forEach(drawButton);
  }

  function drawPlay() {
    const tint = rgbStr(S.tintRgb), border = rgbStr(S.borderRgb), cloudCol = rgbStr(mixRgb(S.tintRgb, [40, 40, 60], 0.16));
    ctx.save();
    if (S.shake > 0) ctx.translate(rnd(-S.shake, S.shake), rnd(-S.shake, S.shake));
    ctx.fillStyle = tint; ctx.fillRect(-20, -20, W + 40, H + 40);
    for (const c of S.clouds) cloud(c.x, c.y, c.s, cloudCol);
    for (const s of S.splats) drawSplat(s);
    for (const d of S.dragons) {
      const sp = Math.hypot(d.vx, d.vy) || 1;
      const o = { flap: Math.sin(d.phase), lookX: d.vx / sp, lookY: d.vy / sp, scale: d.grow, tilt: (d.vx / sp) * 0.12 + Math.sin(d.wobble * 40) * d.wobble * 0.6 };
      if (d.rainbow) {
        o.rainbowHue = (S.t * 260) % 360; o.happy = true;
        ctx.save(); ctx.globalAlpha = 0.35 + 0.2 * Math.sin(S.t * 10); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 1.5, 0, TAU); ctx.fill(); ctx.restore();
        if (d.life < 1.5 && Math.floor(S.t * 10) % 2 === 0) continue;
      }
      drawDragon(d.x, d.y, d.r, d.color, o);
    }
    for (const p of S.particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 22; ctx.strokeStyle = border; ctx.strokeRect(11, 11, W - 22, H - 22);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.strokeRect(22, 22, W - 44, H - 44);
    ctx.restore();

    if (S.time <= 10 && S.countdown <= 0) { // last ten seconds: red pulse on the edges
      const a = 0.18 + 0.14 * Math.sin(S.t * 10);
      const g = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 760); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, 'rgba(255,0,0,' + a + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (S.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + S.flash + ')'; ctx.fillRect(0, 0, W, H); }
    for (const f of S.floats) { ctx.globalAlpha = clamp(f.life * 1.6, 0, 1); text(f.text, f.x, f.y, f.size, f.color, 'center', 'rgba(0,0,0,0.6)'); }
    ctx.globalAlpha = 1;

    // HUD: timer top left and score top right, as in 2012; target chip in the middle is new
    const low = S.time <= 10;
    text(fmtTime(S.time), 48, 62, low ? 56 + 4 * Math.sin(S.t * 12) : 52, low ? '#ff3b30' : '#ffffff', 'left', 'rgba(0,0,0,0.55)');
    text('Score: ' + S.score, W - 48, 62, 52, '#ffffff', 'right', 'rgba(0,0,0,0.55)');
    const mult = S.streak >= 10 ? 3 : S.streak >= 5 ? 2 : 1;
    text('Level ' + S.level + (mult > 1 ? '   x' + mult + ' streak' : ''), W - 48, 110, 24, mult > 1 ? '#ffe95a' : 'rgba(255,255,255,0.9)', 'right', 'rgba(0,0,0,0.55)');
    const tc = COLORS[S.target];
    rrect(W / 2 - 150, 34, 300, 58, 29); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = border; ctx.stroke();
    drawDragon(W / 2 - 112, 63, 21, S.target, { flap: Math.sin(S.t * 9) });
    text('CATCH ' + tc.name, W / 2 + 22, 65, 30, tc.light, 'center');

    if (S.countdown > 0) {
      const n = Math.ceil(S.countdown / 0.8), frac = (S.countdown / 0.8) % 1;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, H);
      text(String(n), W / 2, H / 2, 180 + frac * 80, '#ffffff', 'center', 'rgba(0,0,0,0.6)');
      text('Catch the dragons in the frame colour', W / 2, H / 2 + 170, 34, '#ffffff', 'center', 'rgba(0,0,0,0.6)');
    }
    if (S.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      text('Paused', W / 2, H / 2 - 20, 110, '#ffffff', 'center', 'rgba(0,0,0,0.6)');
      text('press P to continue', W / 2, H / 2 + 70, 32, '#ffffff', 'center');
    }
  }

  function drawOver() {
    ctx.fillStyle = '#23262a'; ctx.fillRect(0, 0, W, H);
    for (const c of S.clouds) cloud(c.x, c.y, c.s, '#2c3035');
    const k = clamp(S.overT * 2.5, 0, 1), cy = 150;
    cloud(W / 2, cy, 1.9, '#f2f2f2');
    drawSplatStatic(W / 2 - 110, cy + 10, COLORS[3].main, 40); drawSplatStatic(W / 2 + 112, cy + 30, '#c4130f', 40);
    drawDragon(W / 2 - 62, cy + 6, 52 * k, 3, { happy: true, tilt: -0.3 });
    drawDragon(W / 2 + 62, cy + 6, 52 * k, 0, { happy: true, tilt: 0.3 });
    drawDragon(W / 2, cy + 4, 64 * k, 2, { happy: true, flap: Math.sin(S.t * 8) });
    text('Game Over', W / 2, 322, 104, '#ffffff', 'center', 'rgba(0,0,0,0.5)');
    text('Your score is: ' + S.score, W / 2, 424, 58, '#ffffff', 'center');
    if (S.newHigh) text('NEW HIGH SCORE!', W / 2, 492, 40 + 3 * Math.sin(S.t * 8), '#ffe95a', 'center', '#b8500f');
    else text('High score: ' + S.high, W / 2, 492, 32, '#c8ccd2', 'center');
    const tries = S.catches + S.misses, acc = tries ? Math.round((S.catches / tries) * 100) : 0;
    text('caught ' + S.catches + '   wrong ' + S.misses + '   accuracy ' + acc + ' %   best streak ' + S.bestStreak + '   level ' + S.level, W / 2, 548, 26, '#9aa3ad', 'center', null, 'normal');
    buttons().forEach(drawButton);
  }
  const staticSplats = {};
  function drawSplatStatic(x, y, color, size) {
    const key = x + ':' + y;
    if (!staticSplats[key]) { staticSplats[key] = makeSplat(x, y, color, size); staticSplats[key].age = 1; }
    drawSplat(staticSplats[key]);
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0f1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = view.scale * view.dpr;
    ctx.setTransform(s, 0, 0, s, view.ox * view.dpr, view.oy * view.dpr);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    if (S.screen === 'menu') drawMenu(); else if (S.screen === 'play') drawPlay(); else drawOver();
    for (const r of S.rings) { // tap ring: shows where a finger or the mouse hit
      const k = 1 - r.life / 0.4;
      ctx.globalAlpha = 1 - k; ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(r.x, r.y, 14 + k * 40, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    update(dt); render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // read-only hooks for the automated play test (tools/playtest.js clicks with real mouse events)
  window.__ld = {
    version: VERSION, S, COLORS, W, H,
    clientPos: (x, y) => ({ x: view.ox + x * view.scale, y: view.oy + y * view.scale }),
    buttons,
  };
})();
