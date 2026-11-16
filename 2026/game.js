// Little Dragons 2026 - game: rules, modes, effects, screens, input.
// Core rules kept from the 2012 game: tap the dragon in the frame colour, wrong colour costs 5 s, every 5 catches +3 s, 1:00 on the clock.
// New in this version: eggs that hatch, three modes (Classic, Zen, Boss Rush), combo fire, boss fights, lasting paint, parallax
// backgrounds in three themes, light and particles, haptics, music, saved progress with unlocks, portrait and landscape.
(function () {
  'use strict';
  var LD = window.LD, art = LD.art, TAU = LD.TAU, rnd = LD.rnd, rint = LD.rint, clamp = LD.clamp, COLORS = LD.COLORS, sfx = LD.sfx, save = LD.save;
  var canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
  var V = { W: 1280, H: 720, scale: 1, dpr: 1, px: 1, portrait: false, safe: { t: 0, r: 0, b: 0, l: 0 } };
  var quality = 2, QF = [0.45, 0.7, 1], MAXP = [110, 200, 340];
  var bg = null, paint = null, pctx = null;
  var START_TIME = 60, WRONG_PENALTY = 5, BONUS_EVERY = 5, BONUS_TIME = 3, MAX_DRAGONS = 18, DRAGON_R = 50, HIT_K = 1.3;
  var MODES = {
    classic: { name: 'CLASSIC', tag: '60 seconds. The 2012 rules.', accent: '#ffd75a', icon: 3 },
    zen: { name: 'ZEN', tag: 'No clock. No penalty. Just paint.', accent: '#7de0c8', icon: 1 },
    boss: { name: 'BOSS RUSH', tag: '3 hearts. Waves. A boss dragon.', accent: '#ff6a4a', icon: 0 }
  };
  function T(str, x, y, size, color, align, stroke, weight) { art.text(ctx, str, x, y, size, color, align, stroke, weight); }

  // ---------- state ----------
  var S = {
    screen: 'menu', mode: 'classic', t: 0, time: START_TIME, score: 0, catches: 0, misses: 0, combo: 0, bestCombo: 0, level: 1,
    hearts: 3, wave: 1, waveLeft: 0, phase: 'wave', boss: null, bossesDown: 0, target: 0, borderRgb: COLORS[0].rgb.slice(),
    dragons: [], spawnQ: [], floats: [], rings: [], taps: [], clouds: [], amb: [], decor: [],
    trauma: 0, hitstop: 0, countdown: 0, lastCount: 0, paused: false, goldIn: 14, lastTick: 0, flash: 0, redFlash: 0, fireSweep: 0,
    chipPop: 0, scorePop: 0, heartPop: 0, banner: null, toast: null, pressed: null, newHigh: false, unlockedNow: [], overT: 0, shown: 0,
    pointer: { x: 640, y: 360 }, parX: 0, tiltX: null, log: []
  };
  S.orbs = []; // v2 boss: fireballs on the field
  var P = []; // particles
  function logEv(type, extra) { var e = { t: +S.t.toFixed(2), type: type }; if (extra) for (var k in extra) e[k] = extra[k]; S.log.push(e); if (S.log.length > 900) S.log.shift(); }
  function field() { return { l: 34 + V.safe.l, r: V.W - 34 - V.safe.r, t: 128 + V.safe.t, b: V.H - 34 - V.safe.b }; }

  // ---------- layout ----------
  function resize() {
    var cw = window.innerWidth || 1, ch = window.innerHeight || 1;
    var dpr = Math.min(window.devicePixelRatio || 1, quality === 2 ? 2 : quality === 1 ? 1.5 : 1);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    var scale = Math.min(cw, ch) / 720;
    V.scale = scale; V.dpr = dpr; V.px = scale * dpr; V.W = cw / scale; V.H = ch / scale; V.portrait = ch > cw;
    try {
      var cs = window.getComputedStyle(document.getElementById('safe'));
      V.safe = { t: (parseFloat(cs.paddingTop) || 0) / scale, r: (parseFloat(cs.paddingRight) || 0) / scale, b: (parseFloat(cs.paddingBottom) || 0) / scale, l: (parseFloat(cs.paddingLeft) || 0) / scale };
    } catch (e) { V.safe = { t: 0, r: 0, b: 0, l: 0 }; }
    bg = art.buildBackground(save.theme, V.W, V.H, Math.min(V.px, 1.5));
    var old = paint, pp = Math.min(V.px, 1.25);
    paint = art.makeCanvas(V.W * pp, V.H * pp); pctx = paint.getContext('2d'); pctx.scale(pp, pp);
    if (old && S.screen !== 'menu') { try { pctx.drawImage(old, 0, 0, V.W, V.H); } catch (e2) { /* ignore */ } }
    var f = field(), i;
    for (i = 0; i < S.dragons.length; i++) { var d = S.dragons[i]; d.x = clamp(d.x, f.l + d.r, f.r - d.r); d.y = clamp(d.y, f.t + d.r, f.b - d.r); }
    S.clouds = []; for (i = 0; i < 7; i++) S.clouds.push({ x: rnd(-200, V.W), y: rnd(20, Math.max(60, V.H - 520)), s: rnd(0.6, 1.3), v: rnd(5, 16), i: i % 3 });
    S.amb = []; var n = Math.round(26 * QF[quality]);
    for (i = 0; i < n; i++) S.amb.push({ x: rnd(0, V.W), y: rnd(0, V.H), vx: rnd(-12, 12), vy: rnd(-10, 10), ph: rnd(0, TAU), s: rnd(5, 13) });
    S.decor = []; for (i = 0; i < 4; i++) S.decor.push({ x: rnd(0, V.W), y: rnd(60, V.H * 0.5), vx: rnd(30, 60) * (i % 2 ? 1 : -1), c: i, ph: rnd(0, TAU) });
  }
  window.addEventListener('resize', resize);

  // ---------- effects ----------
  function part(k, x, y, vx, vy, life, size, color) { if (P.length >= MAXP[quality]) return; P.push({ k: k, x: x, y: y, vx: vx, vy: vy, life: life, max: life, size: size, color: color, rot: rnd(0, TAU), vr: rnd(-9, 9) }); }
  function qn(n) { return Math.max(1, Math.round(n * QF[quality])); }
  function burstPaint(x, y, color, n, power) { n = qn(n); for (var i = 0; i < n; i++) { var a = rnd(0, TAU), v = rnd(0.3, 1) * power; part('paint', x, y, Math.cos(a) * v, Math.sin(a) * v - 90, rnd(0.4, 0.9), rnd(3, 8), color); } }
  function burstSpark(x, y, key, n, power) { n = qn(n); for (var i = 0; i < n; i++) { var a = rnd(0, TAU), v = rnd(0.3, 1) * power; part('spark', x, y, Math.cos(a) * v, Math.sin(a) * v, rnd(0.3, 0.7), rnd(10, 22), key); } }
  function burstFire(x, y, n, power, dx, dy) { n = qn(n); for (var i = 0; i < n; i++) { var a = rnd(0, TAU), v = rnd(0.2, 1) * power; part('fire', x, y, Math.cos(a) * v * 0.6 + (dx || 0) * power, Math.sin(a) * v * 0.6 + (dy || 0) * power, rnd(0.35, 0.8), rnd(14, 30), 'fire'); } }
  function burstShell(x, y, n, power) { n = qn(n); for (var i = 0; i < n; i++) { var a = rnd(0, TAU), v = rnd(0.4, 1) * (power || 300); part('shell', x, y, Math.cos(a) * v, Math.sin(a) * v - 120, rnd(0.5, 0.9), rnd(6, 12), '#f3e8cc'); } }
  function confetti(n) { n = qn(n); for (var i = 0; i < n; i++) part('conf', rnd(0, V.W), rnd(-80, -10), rnd(-60, 60), rnd(80, 240), rnd(1.6, 3), rnd(7, 13), COLORS[rint(4)].main); }
  function floatText(x, y, text, color, size) { S.floats.push({ x: x, y: y, text: text, color: color, size: size || 36, life: 1.1 }); }
  function ring(x, y, color, r0, r1, life, w) { S.rings.push({ x: x, y: y, color: color, r0: r0, r1: r1, life: life, max: life, w: w || 5 }); }
  function banner(text, sub, color, dur) { S.banner = { text: text, sub: sub || '', color: color || '#ffffff', t: 0, dur: dur || 1.5 }; }
  function toast(text) { S.toast = { text: text, t: 0, dur: 2.6 }; }
  function paintSplat(x, y, size, color, alpha) { art.splat(pctx, x, y, size, color, alpha); }

  // ---------- dragons ----------
  function speedNow() {
    if (S.mode === 'zen') return 78;
    if (S.mode === 'boss') return 122 * (1 + 0.07 * (S.wave - 1));
    return 120 * (1 + 0.06 * (S.level - 1));
  }
  function freeSpot(r) {
    var f = field(), best = null, bestD = -1;
    for (var i = 0; i < 10; i++) {
      var x = rnd(f.l + r + 10, f.r - r - 10), y = rnd(f.t + r + 10, f.b - r - 10), m = 1e9;
      for (var j = 0; j < S.dragons.length; j++) m = Math.min(m, Math.hypot(S.dragons[j].x - x, S.dragons[j].y - y));
      if (m > bestD) { bestD = m; best = { x: x, y: y }; }
      if (m > 130) break;
    }
    return best;
  }
  function makeDragon(color, eggDur, popDelay) {
    var p = freeSpot(DRAGON_R);
    return { x: p.x, y: p.y, vx: 0, vy: 0, color: color, r: DRAGON_R, phase: rnd(0, TAU), state: 'egg', eggT: 0, eggDur: eggDur, popDelay: popDelay || 0,
      grow: 0, wobble: 0, gold: false, life: Infinity, blinkT: rnd(1, 4), blink: 0, fireT: rnd(3, 10), mouthT: 0, sparkT: 0 };
  }
  function hatch(d) {
    var a = rnd(0, TAU), sp = speedNow() * rnd(0.75, 1.25);
    d.state = 'fly'; d.grow = 0; d.vx = Math.cos(a) * sp; d.vy = Math.sin(a) * sp;
    burstShell(d.x, d.y, 9, 280); burstSpark(d.x, d.y, COLORS[d.color].id, 5, 220); ring(d.x, d.y, '#ffffff', 16, 90, 0.3, 4);
    sfx.hatch(); logEv('hatch', { color: COLORS[d.color].id });
  }
  function spawnWave(n) {
    for (var i = 0; i < n; i++) S.dragons.push(makeDragon(i % 4, 0.9 + i * 0.045, i * 0.04));
  }
  function countAll() { return S.dragons.length + S.spawnQ.length; }
  function pickTarget() {
    var fly = [0, 0, 0, 0], any = [0, 0, 0, 0], i;
    for (i = 0; i < S.dragons.length; i++) { var d = S.dragons[i]; if (d.gold || d.state === 'leave') continue; any[d.color]++; if (d.state === 'fly') fly[d.color]++; }
    var opts = [0, 1, 2, 3].filter(function (c) { return c !== S.target && fly[c] > 0; });
    if (!opts.length) opts = [0, 1, 2, 3].filter(function (c) { return c !== S.target && any[c] > 0; });
    if (opts.length) S.target = opts[rint(opts.length)];
    S.chipPop = 0.3;
  }
  function mult() { return S.mode === 'zen' ? 1 : S.combo >= 10 ? 3 : S.combo >= 5 ? 2 : 1; }
  function waveNeed(w) { return Math.min(12, 6 + 2 * (w - 1)); }

  // ---------- round flow ----------
  function startGame(mode) {
    S.screen = 'play'; S.mode = mode; S.time = START_TIME; S.score = 0; S.catches = 0; S.misses = 0; S.combo = 0; S.bestCombo = 0; S.level = 1;
    S.hearts = 3; S.wave = 1; S.waveLeft = waveNeed(1); S.phase = 'wave'; S.boss = null; S.bossesDown = 0;
    S.dragons = []; S.spawnQ = []; S.floats = []; S.rings = []; S.orbs = []; P.length = 0;
    S.trauma = 0; S.hitstop = 0; S.paused = false; S.countdown = 2.4; S.lastCount = 3; S.goldIn = rnd(12, 16); S.lastTick = 0;
    S.flash = 0; S.redFlash = 0; S.fireSweep = 0; S.banner = null; S.newHigh = false; S.unlockedNow = []; S.shown = 0;
    pctx.clearRect(0, 0, V.W, V.H);
    var n = mode === 'zen' ? 10 : 12;
    for (var i = 0; i < n; i++) S.dragons.push(makeDragon(i % 4, 1.85 + i * 0.045, i * 0.05));
    S.target = rint(4); S.borderRgb = COLORS[S.target].rgb.slice();
    sfx.count(false); logEv('start', { mode: mode });
  }
  function endGame() {
    if (S.screen !== 'play') return;
    S.screen = 'over'; S.overT = 0; S.shown = 0; S.paused = false;
    save.catches += S.catches; save.rounds++;
    if (S.score > save.high[S.mode]) { save.high[S.mode] = S.score; S.newHigh = true; }
    S.unlockedNow = [];
    if (!save.unlocked.boss && S.mode === 'classic' && S.score >= LD.BOSS_UNLOCK_SCORE) { save.unlocked.boss = true; S.unlockedNow.push('BOSS RUSH mode'); }
    if (!save.unlocked.night && save.catches >= LD.NIGHT_UNLOCK_CATCHES) { save.unlocked.night = true; S.unlockedNow.push('NIGHT SKY theme'); }
    if (!save.unlocked.volcano && save.bossWins >= 1) { save.unlocked.volcano = true; S.unlockedNow.push('VOLCANO theme'); }
    LD.persist();
    sfx.over(); if (S.newHigh) { sfx.high(); confetti(70); } if (S.unlockedNow.length) sfx.unlock();
    LD.vib([40, 60, 40, 60, 120]);
    logEv('over', { mode: S.mode, score: S.score, catches: S.catches, misses: S.misses, unlocked: S.unlockedNow.slice() });
  }
  function loseHeart(x, y) {
    S.hearts--; S.heartPop = 0.5; floatText(x, y - 36, '-1 heart', '#ff5a4f', 40); sfx.heart(); logEv('heart', { hearts: S.hearts });
    if (S.hearts <= 0) { S.hearts = 0; endGame(); }
  }
  function removeDragon(d) { var i = S.dragons.indexOf(d); if (i >= 0) S.dragons.splice(i, 1); }

  function catchDragon(d) {
    var col = COLORS[d.color];
    S.catches++; S.combo++; if (S.combo > S.bestCombo) S.bestCombo = S.combo;
    var m = mult(); S.score += m; S.scorePop = 0.25;
    paintSplat(d.x, d.y, rnd(34, 48), col.main);
    burstPaint(d.x, d.y, col.main, 14, 380); burstPaint(d.x, d.y, col.light, 5, 240); burstSpark(d.x, d.y, col.id, 8, 300);
    if (S.combo >= 5 && S.mode !== 'zen') burstFire(d.x, d.y, 8, 260);
    ring(d.x, d.y, col.light, 20, 125, 0.35, 6);
    floatText(d.x, d.y - 36, '+' + m, '#ffffff', m > 1 ? 52 : 38);
    removeDragon(d); if (S.phase !== 'boss') S.spawnQ.push({ t: 0.35, color: d.color });
    if (S.mode === 'zen') sfx.zen(S.catches); else sfx.pop(S.combo);
    LD.vib(12); S.hitstop = 0.035;
    logEv('catch', { color: col.id, mult: m });
    if (S.mode !== 'zen' && (S.combo === 5 || S.combo === 10)) {
      banner(S.combo === 5 ? 'ON FIRE!' : 'INFERNO!', 'x' + (S.combo === 5 ? 2 : 3) + ' points per catch', S.combo === 5 ? '#ffb347' : '#ff5a2a', 1.2);
      sfx.comboUp(); LD.vib([20, 30, 40]); S.flash = 0.22; S.trauma = Math.max(S.trauma, 0.35);
      for (var i = 0; i < 14; i++) burstFire(rnd(0, V.W), V.H - 10, 2, 200, 0, -1.4);
      logEv('combo', { combo: S.combo });
    }
    if (S.mode === 'classic' && S.catches % BONUS_EVERY === 0) {
      // 2012 rule: +3 s every 5 catches. New: the bonus shrinks at high levels (2 s from level 7, 1 s from level 13), so every round ends.
      var bonus = S.level <= 6 ? BONUS_TIME : S.level <= 12 ? 2 : 1;
      S.time = Math.min(START_TIME, S.time + bonus); S.level++;
      floatText(V.safe.l + 160, V.safe.t + 150, '+' + bonus + ' s', '#7dff8a', 42);
      floatText(V.W / 2, field().t + 70, 'LEVEL ' + S.level, '#ffffff', 48);
      for (var j = 0; j < S.dragons.length; j++) { S.dragons[j].vx *= 1.06; S.dragons[j].vy *= 1.06; }
      if (countAll() < MAX_DRAGONS) S.spawnQ.push({ t: 0.7, color: rint(4) });
      sfx.bonus(); logEv('bonus', { level: S.level });
    }
    if (S.mode === 'zen' && S.catches % 10 === 0 && countAll() < 16) S.spawnQ.push({ t: 0.7, color: rint(4) });
    if (S.mode === 'boss') {
      if (S.phase === 'boss') { minionCaught(); return; } // v2: a little dragon caught while the boss hides behind its shield
      S.waveLeft--; if (S.waveLeft <= 0) { startBoss(); return; }
    }
    pickTarget();
  }
  function wrongTap(d) {
    S.misses++; S.combo = 0; d.wobble = 0.5;
    logEv('wrong', { color: COLORS[d.color].id, target: COLORS[S.target].id });
    if (S.mode === 'zen') { sfx.click(); floatText(d.x, d.y - 36, 'oops', '#ffffff', 28); LD.vib(8); return; }
    S.trauma = Math.max(S.trauma, 0.65); S.redFlash = 0.35; S.hitstop = 0.06; d.fireT = 0.25;
    paintSplat(d.x, d.y + 18, 26, '#b3120e', 0.8); burstPaint(d.x, d.y, '#c4130f', 14, 320);
    sfx.wrong(); LD.vib([50, 40, 50]);
    if (S.mode === 'classic') {
      S.time -= WRONG_PENALTY; floatText(d.x, d.y - 36, '-' + WRONG_PENALTY + ' s', '#ff5a4f', 46);
      if (S.time <= 0) { S.time = 0; endGame(); }
    } else loseHeart(d.x, d.y);
  }
  function tapGold(d) {
    removeDragon(d); S.score += 5; S.scorePop = 0.25; var txt = '+5';
    if (S.mode === 'classic') { S.time = Math.min(START_TIME, S.time + 5); txt = '+5   +5 s'; }
    else if (S.mode === 'boss' && S.hearts < 3) { S.hearts++; S.heartPop = 0.5; txt = '+5   +1 heart'; }
    for (var c = 0; c < 4; c++) burstPaint(d.x, d.y, COLORS[c].main, 9, 440);
    burstSpark(d.x, d.y, 'gold', 20, 460); ring(d.x, d.y, '#fff3a8', 30, 240, 0.5, 8);
    floatText(d.x, d.y - 36, txt, '#fff3a8', 46); S.flash = 0.3; sfx.gold(); LD.vib([15, 20, 15, 20, 30]); logEv('gold');
  }

  // ---------- boss (v2, 16.11.2026: three phases, variable tempo, attacks with a warning the player has to answer) ----------
  // Index 0 / 1 / 2 = phase 1 / phase 2 / rage.
  var BOSS = {
    tempo: { slow: 0.5, normal: 1, dash: 2.5 }, tempoMul: [1, 1.12, 1.25],
    colorEvery: [1.4, 1.15, 0.9],   // seconds between colour changes (jittered, so the rhythm is never even)
    atkEvery: [5.0, 4.0, 3.0],      // seconds between attacks
    windup: [1.7, 1.5, 1.3],        // fire breath: time from the warning to the fire
    WIND_SWAP: 0.55,                // ... and the share of that time after which the boss turns to the frame colour (the rest is the player's window)
    fuse: [2.6, 2.4, 2.2],          // fireballs: time on the ground before they blow
    orbs: [3, 4, 5], GRACE: 0.14, STUN: 2.4, SHIELD_TIME: [8, 8, 6.5], ORB_HIT: 66
  };
  function bossPh(b) { return b.rage ? 2 : b.phase2 ? 1 : 0; }
  // label under the boss (above it when the boss is low), kept inside the screen on narrow phones
  function bossLabelPos(b, text, size) {
    var hw = text.length * size * 0.3 + 24, y = b.y + b.r + 84;
    if (y > V.H - V.safe.b - 50) y = b.y - b.r - 128;
    return { x: clamp(b.x, V.safe.l + hw, Math.max(V.safe.l + hw, V.W - V.safe.r - hw)), y: y };
  }
  function bossText(b, text, color, size) { var p = bossLabelPos(b, text, size); floatText(p.x, p.y, text, color, size); }
  function setAtk(b, k) { b.atkMax = BOSS.atkEvery[bossPh(b)] * rnd(0.85, 1.15) * Math.max(0.75, 1 - 0.05 * (S.wave - 1)) * (k || 1); b.atkT = b.atkMax; }
  function setBossColor(b, nc) { b.prevColor = b.color; b.color = nc; b.changedAgo = 0; b.cflash = 0.15; b.since = nc === S.target ? 0 : b.since + 1; }
  function fizzleOrbs() { for (var i = 0; i < S.orbs.length; i++) { burstSpark(S.orbs[i].x, S.orbs[i].y, 'white', 6, 200); ring(S.orbs[i].x, S.orbs[i].y, '#ffffff', 10, 60, 0.25, 4); } S.orbs = []; }
  function minionsLeave() { for (var i = S.dragons.length - 1; i >= 0; i--) { var d = S.dragons[i]; if (d.state === 'egg') S.dragons.splice(i, 1); else if (d.state !== 'leave') { d.state = 'leave'; d.vy = -rnd(520, 820); } } S.spawnQ = []; }
  function startBoss() {
    S.phase = 'boss'; S.spawnQ = []; S.orbs = [];
    for (var i = S.dragons.length - 1; i >= 0; i--) { var d = S.dragons[i]; if (d.state === 'egg') S.dragons.splice(i, 1); else { d.state = 'leave'; d.vy = -rnd(520, 820); } }
    var f = field(), hp = Math.min(12, 6 + 2 * S.wave); // v1 had 4 / 5 / 6 ... (max 8); now 8 / 10 / 12
    S.boss = { x: (f.l + f.r) / 2, y: (f.t + f.b) / 2 + 10, r: 115, color: rint(4), prevColor: -1, changedAgo: 9, hp: hp, maxHp: hp, t: 0, eggT: 0, eggDur: 1.5,
      state: 'egg', grow: 0, colorT: 1.2, hurt: 0, since: 0, mouthT: 0, dieT: 0, boomT: 0, cflash: 0,
      mode: 'roam', modeT: 0, mp: 0, tempo: 1, tempoName: 'normal', tempoT: 2.4, dashWarn: 0, atkT: 4.2, atkMax: 4.2, lastAtk: '', phase2: false, rage: false,
      windT: 0, windMax: 1, windSwap: -1, tickT: 0, shieldNeed: 0, shieldT: 0, shieldMax: 1, shieldUsed: 0, volleyHurt: false, kx: 0, ky: 0, hpShake: 0, trail: [], fireT: 0,
      charge: 0, chargeMax: 1 };
    banner('WAVE ' + S.wave + ' CLEAR', 'Something big is hatching...', '#ffffff', 1.4);
    sfx.level(); logEv('bossSpawn', { wave: S.wave, hp: S.boss.hp });
  }
  function bossPhaseUp(b, rage) {
    b.phase2 = true; if (rage) b.rage = true;
    b.mode = 'roar'; b.modeT = 1.0; b.mouthT = 1.0; b.dashWarn = 0; b.tempoName = 'normal'; b.tempoT = 1.2; fizzleOrbs();
    S.trauma = 1; if (rage) S.redFlash = 0.3; else S.flash = 0.25;
    ring(b.x, b.y, rage ? '#ff3b30' : '#ffffff', 80, 520, 0.6, 12); burstFire(b.x, b.y, rage ? 34 : 18, 520);
    sfx.bossRoar(); if (rage) sfx.bossRage(); LD.vib(rage ? [120, 40, 120, 40, 200] : [80, 40, 120]);
    banner(rage ? 'RAGE!' : 'PHASE 2', rage ? 'Faster. Angrier. Watch the warnings.' : 'It learned a new trick: a shield', rage ? '#ff3b30' : '#ffb347', 1.5);
    setAtk(b, rage ? 0.55 : 0.6); logEv('bossPhase', { phase: rage ? 'rage' : 2, hp: b.hp });
  }
  function bossDamage(b, n, x, y, label) {
    b.hp -= n; b.hurt = 0.3; b.hpShake = 0.35; S.score += 2 * n; S.scorePop = 0.25;
    var dx = b.x - x, dy = b.y - y, dl = Math.hypot(dx, dy) || 1; b.kx += dx / dl * 46 * n; b.ky += dy / dl * 46 * n; // the hit pushes the boss away from the finger
    burstFire(b.x, b.y, 18 * n, 420); burstSpark(b.x, b.y, COLORS[b.color].id, 14 * n, 440); burstPaint(b.x, b.y, COLORS[b.color].main, 10 * n, 420);
    ring(b.x, b.y, '#ffffff', 60, n > 1 ? 380 : 280, 0.4, 8); floatText(b.x, b.y - b.r - 24, label, n > 1 ? '#fff3a8' : '#ffffff', n > 1 ? 58 : 52);
    S.trauma = Math.max(S.trauma, n > 1 ? 0.9 : 0.55); S.hitstop = n > 1 ? 0.12 : 0.07; if (n > 1) S.flash = 0.2;
    sfx.bossHit(); LD.vib(n > 1 ? [30, 20, 70] : 30); logEv('bossHit', { hp: Math.max(0, b.hp), dmg: n });
    if (b.hp <= 0) {
      b.hp = 0; b.state = 'dying'; b.mode = 'roam'; b.dieT = 0; b.boomT = 0; fizzleOrbs(); minionsLeave();
      sfx.bossDown(); LD.vib([60, 40, 60, 40, 150]); logEv('bossDown', { wave: S.wave }); return true;
    }
    if (!b.rage && b.hp <= Math.ceil(b.maxHp / 3)) bossPhaseUp(b, true);
    else if (!b.phase2 && b.hp <= Math.ceil(b.maxHp * 2 / 3)) bossPhaseUp(b, false);
    return false;
  }
  function tapBoss(b, x, y) {
    if (b.mode === 'roar') return; // it cannot be hurt while it roars, and a tap costs nothing
    if (b.mode === 'shield') {
      b.cflash = 0.15; ring(b.x, b.y, '#bfe9ff', b.r + 20, b.r + 80, 0.25, 6); floatText(b.x, b.y - b.r - 24, 'SHIELD!', '#bfe9ff', 34);
      sfx.bossClang(); LD.vib(15); logEv('bossShieldTap'); return;
    }
    // fair: a tap that lands a blink after the colour changed away still counts
    var ok = b.color === S.target || (b.prevColor === S.target && b.changedAgo < BOSS.GRACE);
    if (ok) {
      var stun = b.mode === 'stun', wind = b.mode === 'windup';
      if (wind) { S.score += 1; floatText(b.x, b.y - b.r - 78, 'INTERRUPTED!', '#7dff8a', 44); sfx.comboUp(); logEv('bossInterrupt'); }
      if (wind || stun) { b.mode = 'roam'; b.mouthT = 0; setAtk(b, stun ? 0.7 : 1); }
      if (bossDamage(b, stun ? 2 : 1, x, y, stun ? 'CRITICAL!  +4' : wind ? '+3' : '+2')) return;
      var opts = [0, 1, 2, 3].filter(function (c) { return c !== S.target && c !== b.color; });
      S.target = opts[rint(opts.length)]; b.since = 0; b.prevColor = -1; S.chipPop = 0.3;
    } else {
      S.misses++; S.combo = 0; S.trauma = Math.max(S.trauma, 0.65); S.redFlash = 0.35; b.mouthT = Math.max(b.mouthT, 0.5);
      sfx.wrong(); LD.vib([50, 40, 50]); logEv('bossWrong');
      loseHeart(b.x, b.y - b.r);
    }
  }
  // attack 1: fire breath. The boss stops and inhales, a ring closes. It turns to the frame colour during the inhale: hit it to stop the fire.
  function startBreath(b) {
    var ph = bossPh(b);
    b.mode = 'windup'; b.windMax = BOSS.windup[ph]; b.windT = 0; b.tickT = 0; b.mouthT = b.windMax + 0.2; b.dashWarn = 0;
    // it never starts the inhale in the frame colour: the player has to wait for the turn, then hit
    if (b.color === S.target) { var oc = [0, 1, 2, 3].filter(function (c) { return c !== S.target; }); setBossColor(b, oc[rint(3)]); } // (a tap already on its way still counts: the usual grace)
    b.windSwap = b.windMax * BOSS.WIND_SWAP;
    bossText(b,'IT INHALES!', '#ffb347', 34); sfx.bossWarn(); LD.vib(20); logEv('bossWindup', { dur: b.windMax });
  }
  function bossAttack(b) {
    b.mode = 'roam'; b.mouthT = 0.9; S.fireSweep = 0.7; S.trauma = 1; setAtk(b);
    for (var i = 0; i < 26; i++) burstFire(b.x + rnd(-40, 40), b.y + 20, 2, 520, rnd(-0.8, 0.8), rnd(0.2, 1));
    sfx.fire(); sfx.bossRoar(); LD.vib([100, 50, 100]); logEv('bossAttack');
    loseHeart(b.x, b.y + b.r);
  }
  // attack 2: fireballs. They land on the field and tick down. Tap every one before it blows. One volley can cost one heart at most.
  function orbSpot(b) {
    var f = field(), best = null, bestM = -1;
    for (var i = 0; i < 16; i++) {
      var x = rnd(f.l + 70, f.r - 70), y = rnd(f.t + 70, f.b - 70), m = Math.hypot(b.x - x, b.y - y) - b.r - 60;
      for (var j = 0; j < S.orbs.length; j++) m = Math.min(m, Math.hypot(S.orbs[j].tx - x, S.orbs[j].ty - y) - 100);
      if (m > bestM) { bestM = m; best = { x: x, y: y }; }
      if (m > 60) break;
    }
    return best;
  }
  function startOrbs(b) {
    var ph = bossPh(b), n = BOSS.orbs[ph] + (S.wave >= 3 ? 1 : 0);
    b.volleyHurt = false; b.mouthT = 0.8;
    for (var i = 0; i < n; i++) { var p = orbSpot(b); S.orbs.push({ x: b.x, y: b.y + 20, sx: b.x, sy: b.y + 20, tx: p.x, ty: p.y, fly: 0, flyDur: 0.45 + i * 0.1, fuse: BOSS.fuse[ph], max: BOSS.fuse[ph], ph: rnd(0, TAU) }); }
    bossText(b,'TAP THE FIREBALLS!', '#ffb347', 34); sfx.bossWarn(); sfx.fire(); LD.vib(20); setAtk(b); logEv('bossOrbs', { n: n });
  }
  function popOrb(k) {
    var o = S.orbs[k]; S.orbs.splice(k, 1); S.score += 1; S.scorePop = 0.2;
    burstSpark(o.x, o.y, 'white', 10, 320); burstPaint(o.x, o.y, '#ffd9a0', 6, 260); ring(o.x, o.y, '#ffffff', 16, 110, 0.3, 6);
    floatText(o.x, o.y - 40, '+1', '#ffffff', 36); S.hitstop = 0.03; sfx.orbPop(); LD.vib(15); logEv('orbPop', { left: S.orbs.length });
    if (!S.orbs.length && S.boss && !S.boss.volleyHurt) { floatText(o.x, o.y - 84, 'ALL OUT!', '#7dff8a', 40); logEv('orbsCleared'); }
  }
  function orbBoom(k) {
    var o = S.orbs[k], b = S.boss; S.orbs.splice(k, 1);
    burstFire(o.x, o.y, 26, 520); ring(o.x, o.y, '#ff7a1a', 30, 300, 0.45, 12); paintSplat(o.x, o.y, 60, '#3a1208', 0.7);
    S.trauma = Math.max(S.trauma, 0.85); S.fireSweep = 0.5; sfx.fire(); LD.vib([80, 40, 80]); logEv('orbBoom');
    fizzleOrbs(); // the rest of the volley goes out: one volley, one heart at most
    if (b && !b.volleyHurt) { b.volleyHurt = true; loseHeart(o.x, o.y); }
  }
  // attack 3 (from phase 2): shield. The boss cannot be hurt. Four little dragons hatch: catch two in the frame colour to break the shield.
  function startShield(b) {
    var ph = bossPh(b);
    b.mode = 'shield'; b.shieldNeed = 2; b.shieldMax = BOSS.SHIELD_TIME[ph]; b.shieldT = b.shieldMax; b.shieldUsed++; b.dashWarn = 0;
    for (var c = 0; c < 4; c++) S.dragons.push(makeDragon(c, 0.5 + c * 0.08, 0));
    S.target = rint(4); S.chipPop = 0.3;
    bossText(b,'SHIELD! CATCH 2 LITTLE ONES', '#bfe9ff', 32); ring(b.x, b.y, '#bfe9ff', 40, b.r + 60, 0.4, 8);
    sfx.bossClang(); sfx.level(); LD.vib([20, 30, 20]); logEv('bossShield');
  }
  function minionCaught() {
    var b = S.boss; if (!b || b.mode !== 'shield') return;
    b.shieldNeed--;
    if (b.shieldNeed > 0) { pickTarget(); return; }
    minionsLeave();
    b.mode = 'stun'; b.modeT = BOSS.STUN; S.target = rint(4); setBossColor(b, S.target); b.since = 0; S.chipPop = 0.3;
    ring(b.x, b.y, '#bfe9ff', b.r, b.r + 260, 0.5, 12); burstSpark(b.x, b.y, 'white', 26, 520); burstShell(b.x, b.y, 16, 480);
    bossText(b,'SHIELD DOWN - HIT IT!', '#7dff8a', 36); S.trauma = Math.max(S.trauma, 0.6); S.flash = 0.2;
    sfx.bossClang(); sfx.comboUp(); LD.vib([30, 30, 60]); logEv('bossShieldBreak');
  }
  function bossNextAttack(b) {
    var ph = bossPh(b), opts = ['breath', 'orbs'];
    if (ph >= 1 && b.shieldUsed < ph) opts.push('shield', 'shield'); // one shield in phase 2, one more in rage
    opts = opts.filter(function (a) { return a !== b.lastAtk; });
    var a = !b.lastAtk ? 'breath' : opts[rint(opts.length)]; // the first attack is always the breath, so the player learns it first
    b.lastAtk = a; logEv('bossPattern', { a: a });
    if (a === 'breath') startBreath(b); else if (a === 'orbs') startOrbs(b); else startShield(b);
  }
  function bossTempo(b, dt) {
    var ph = bossPh(b), k;
    if (b.mode === 'roam') {
      if (b.dashWarn > 0) { b.dashWarn -= dt; if (b.dashWarn <= 0) { b.tempoName = 'dash'; b.tempoT = rnd(0.9, 1.3) + (b.rage ? 0.3 : 0); sfx.fire(); logEv('bossTempo', { tempo: 'dash' }); } }
      else {
        b.tempoT -= dt;
        if (b.tempoT <= 0) {
          var next = b.tempoName === 'dash' ? (Math.random() < 0.6 ? 'slow' : 'normal') : b.tempoName === 'slow' ? (Math.random() < 0.55 ? 'dash' : 'normal') : (Math.random() < 0.5 ? 'dash' : 'slow');
          if (next === 'dash') { b.dashWarn = 0.45; sfx.tick(); LD.vib(10); } // a short shiver warns before every dash
          else { b.tempoName = next; b.tempoT = next === 'slow' ? rnd(1.4, 2.2) : rnd(1.8, 2.8); logEv('bossTempo', { tempo: next }); }
        }
      }
      k = b.dashWarn > 0 ? 0.08 : BOSS.tempo[b.tempoName] * BOSS.tempoMul[ph] * Math.min(1.2, 1 + 0.05 * (S.wave - 1));
    } else k = b.mode === 'shield' ? 0.45 : 0;
    b.tempo += (k - b.tempo) * Math.min(1, dt * 6);
  }
  function updateBossFight(b, dt, f) {
    var ph = bossPh(b), i;
    b.grow = Math.min(1, b.grow + dt * 2.2); b.changedAgo += dt; b.hpShake = Math.max(0, b.hpShake - dt);
    bossTempo(b, dt);
    // movement: the old path, but the speed along it changes (slow / normal / dash). In portrait the path is longer, so it is scaled to the same top speed.
    var ax = Math.max(0, (f.r - f.l) / 2 - b.r - 10), ay = Math.max(0, (f.b - f.t) / 2 - b.r - 30);
    b.mp += dt * b.tempo * Math.min(1, 420 / Math.max(1, 0.8 * ax, 1.3 * ay));
    var dk = Math.min(1, dt * 7); b.kx -= b.kx * dk; b.ky -= b.ky * dk;
    // the path starts in the middle, where the egg was (v1 jumped onto its path in one frame)
    b.x = clamp((f.l + f.r) / 2 + Math.sin(b.mp * 0.8) * ax + b.kx, f.l + b.r * 0.6, f.r - b.r * 0.6);
    b.y = clamp((f.t + f.b) / 2 + 10 + Math.sin(b.mp * 1.3) * ay + b.ky, f.t + b.r * 0.6, f.b - b.r * 0.6);
    b.trail.push(b.x, b.y); if (b.trail.length > 16) b.trail.splice(0, 2);
    if (b.rage && quality > 0) { b.fireT -= dt; if (b.fireT <= 0) { b.fireT = 0.07; part('fire', b.x + rnd(-b.r, b.r) * 0.8, b.y + rnd(-b.r, b.r) * 0.6, rnd(-40, 40), -rnd(60, 200), rnd(0.3, 0.6), rnd(14, 26), 'fire'); } }
    // fireballs
    for (i = S.orbs.length - 1; i >= 0; i--) {
      var o = S.orbs[i]; o.ph += dt * 9;
      if (o.fly < o.flyDur) {
        o.fly = Math.min(o.flyDur, o.fly + dt); var u = LD.outCubic(o.fly / o.flyDur);
        o.x = o.sx + (o.tx - o.sx) * u; o.y = o.sy + (o.ty - o.sy) * u - Math.sin(u * Math.PI) * 90;
        if (quality > 0) part('fire', o.x, o.y, rnd(-30, 30), rnd(-30, 30), 0.3, rnd(10, 18), 'fire');
      } else {
        o.x = o.tx; o.y = o.ty; o.fuse -= dt;
        if (o.fuse <= 0) { orbBoom(i); if (S.screen !== 'play') return; break; }
      }
    }
    if (b.mode === 'roam') {
      b.colorT -= dt;
      if (b.colorT <= 0) {
        b.colorT = Math.max(0.7, BOSS.colorEvery[ph] - 0.06 * (S.wave - 1)) * rnd(0.8, 1.25); var nc;
        if (b.since >= 2) nc = S.target; else { do { nc = rint(4); } while (nc === b.color); }
        setBossColor(b, nc);
      }
      if (!S.orbs.length) { b.atkT -= dt; if (b.atkT <= 0) bossNextAttack(b); }
    } else if (b.mode === 'windup') {
      b.windT += dt; b.tickT -= dt;
      if (b.tickT <= 0) { b.tickT = Math.max(0.09, 0.3 * (1 - b.windT / b.windMax)); sfx.tick(); }
      if (b.windSwap >= 0 && b.windT >= b.windSwap) { setBossColor(b, S.target); b.windSwap = -1; }
      if (quality > 0) { var ia = rnd(0, TAU), ir = b.r + rnd(120, 200); part('spark', b.x + Math.cos(ia) * ir, b.y + Math.sin(ia) * ir, -Math.cos(ia) * 420, -Math.sin(ia) * 420, 0.3, rnd(8, 14), 'fire'); }
      S.trauma = Math.max(S.trauma, 0.25 * b.windT / b.windMax);
      if (b.windT >= b.windMax) bossAttack(b);
    } else if (b.mode === 'shield') {
      b.shieldT -= dt;
      if (b.shieldT <= 0) { minionsLeave(); floatText(b.x, b.y - b.r - 78, 'TOO SLOW!', '#ff5a4f', 40); logEv('bossShieldTimeout'); bossAttack(b); }
    } else if (b.mode === 'stun' || b.mode === 'roar') {
      b.modeT -= dt;
      if (b.modeT <= 0) { var wasStun = b.mode === 'stun'; b.mode = 'roam'; b.colorT = wasStun ? 0.25 : 0.6; if (wasStun) setAtk(b, 0.6); }
    }
    b.charge = b.mode === 'roam' && !S.orbs.length ? 1 - b.atkT / b.atkMax : 0; // ring around the boss: time to the next attack
  }
  function finishBoss() {
    S.orbs = [];
    S.score += 10; S.scorePop = 0.3; S.bossesDown++; save.bossWins++; LD.persist();
    S.hearts = Math.min(3, S.hearts + 1); S.wave++; S.waveLeft = waveNeed(S.wave); S.phase = 'wave'; S.boss = null; S.flash = 0.4;
    banner('BOSS DOWN!', '+10 points.  Wave ' + S.wave, '#ffd75a', 1.6);
    spawnWave(12); S.target = rint(4); S.chipPop = 0.3; S.goldIn = rnd(8, 12);
  }

  function tapPlay(x, y) {
    if (S.countdown > 0) return;
    var best = null, bestD = Infinity, i;
    for (i = 0; i < S.dragons.length; i++) {
      var d = S.dragons[i]; if (d.state !== 'fly' || d.grow < 0.6) continue;
      var dist = Math.hypot(d.x - x, d.y - y);
      if (dist < d.r * HIT_K && dist < bestD) { best = d; bestD = dist; }
    }
    if (S.phase === 'boss') {
      var b = S.boss;
      if (!b || b.state !== 'fight') return;
      // v2 order: fireballs first, then (behind the shield) the little dragons, then the boss itself
      for (i = S.orbs.length - 1; i >= 0; i--) { var o = S.orbs[i]; if (o.fly >= o.flyDur * 0.5 && Math.hypot(o.x - x, o.y - y) < BOSS.ORB_HIT) { popOrb(i); return; } }
      if (b.mode === 'shield' && best) { if (best.color === S.target) catchDragon(best); else wrongTap(best); return; }
      if (b.grow > 0.7 && Math.hypot(b.x - x, b.y - y) < b.r * 1.05) tapBoss(b, x, y);
      return;
    }
    if (!best) return; // empty sky costs nothing
    if (best.gold) tapGold(best); else if (best.color === S.target) catchDragon(best); else wrongTap(best);
  }

  // ---------- buttons ----------
  function menuLayout() {
    var W = V.W, H = V.H, st = V.safe.t, L = {}, cw, ch, gap, y0, i;
    L.cards = [];
    if (V.portrait) {
      L.titleY = st + 130; L.titleSize = Math.min(86, W / 8.4); L.dragY = st + 318; L.dragR = 60; L.dragDX = Math.min(225, W * 0.31);
      cw = Math.min(600, W - 80); gap = 22; y0 = Math.max(st + 440, H * 0.4);
      ch = clamp((H - V.safe.b - y0 - 190) / 3 - gap, 84, 140);
      for (i = 0; i < 3; i++) L.cards.push({ x: (W - cw) / 2, y: y0 + i * (ch + gap), w: cw, h: ch });
      L.iconS = ch < 120 ? 64 : 84; L.iconY = y0 + 3 * (ch + gap) + 14; L.progY = L.iconY + L.iconS + 40;
      L.dragY = st + 215 + (y0 - st - 215) / 2; L.dragR = clamp((y0 - st - 260) / 3.2, 56, 72);
    } else {
      L.titleY = st + 88; L.titleSize = 92; L.dragY = st + 250; L.dragR = 56; L.dragDX = Math.min(390, W * 0.3);
      cw = Math.min(330, (W - 140) / 3); gap = 30; ch = 186; y0 = st + 352;
      var x0 = (W - (cw * 3 + gap * 2)) / 2;
      for (i = 0; i < 3; i++) L.cards.push({ x: x0 + i * (cw + gap), y: y0, w: cw, h: ch });
      L.iconS = 66; L.iconY = y0 + ch + 24; L.progY = L.iconY + L.iconS + 30;
    }
    return L;
  }
  function overLayout() {
    var W = V.W, H = V.H, bw = Math.min(300, (W - 100) / 2), bh = 96, by = H - V.safe.b - (V.portrait ? 190 : 130);
    return { bw: bw, bh: bh, by: by, retryX: W / 2 - bw - 20, menuX: W / 2 + 20 };
  }
  function buttons() {
    var W = V.W, H = V.H, list = [], L, i;
    if (S.screen === 'menu') {
      L = menuLayout();
      ['classic', 'zen', 'boss'].forEach(function (m, k) { var c = L.cards[k]; list.push({ id: m, x: c.x, y: c.y, w: c.w, h: c.h, kind: 'card', act: function () { startMode(m); } }); });
      var ids = ['sound', 'music', 'haptic', 'theme'], acts = [toggleSound, toggleMusic, toggleHaptics, cycleTheme], g = 18, tw = ids.length * L.iconS + (ids.length - 1) * g;
      for (i = 0; i < ids.length; i++) list.push({ id: ids[i], x: (W - tw) / 2 + i * (L.iconS + g), y: L.iconY, w: L.iconS, h: L.iconS, kind: 'icon', act: acts[i] });
    } else if (S.screen === 'over') {
      L = overLayout();
      list.push({ id: 'retry', x: L.retryX, y: L.by, w: L.bw, h: L.bh, kind: 'pill', label: 'RETRY', style: 'blue', act: function () { startGame(S.mode); } });
      list.push({ id: 'menu', x: L.menuX, y: L.by, w: L.bw, h: L.bh, kind: 'pill', label: 'MENU', style: 'red', act: goMenu });
    } else if (S.paused) {
      list.push({ id: 'resume', x: W / 2 - 170, y: H / 2 - 10, w: 340, h: 96, kind: 'pill', label: 'RESUME', style: 'blue', act: function () { S.paused = false; } });
      list.push({ id: 'end', x: W / 2 - 170, y: H / 2 + 110, w: 340, h: 96, kind: 'pill', label: S.mode === 'zen' ? 'FINISH' : 'END ROUND', style: 'red', act: function () { S.paused = false; endGame(); } });
    } else {
      list.push({ id: 'pause', x: V.safe.l + 20, y: V.safe.t + 24, w: 66, h: 66, kind: 'icon', act: function () { if (S.countdown <= 0) S.paused = true; } });
    }
    return list;
  }
  function goMenu() { S.screen = 'menu'; S.dragons = []; S.orbs = []; S.boss = null; S.paused = false; P.length = 0; S.banner = null; }
  function startMode(m) {
    if (m === 'boss' && !save.unlocked.boss) { toast('Score ' + LD.BOSS_UNLOCK_SCORE + ' in Classic to unlock BOSS RUSH'); return; }
    startGame(m);
  }
  function toggleSound() { save.sound = !save.sound; LD.persist(); toast(save.sound ? 'Sound on' : 'Sound off'); }
  function toggleMusic() { save.music = !save.music; LD.persist(); toast(save.music ? 'Music on' : 'Music off'); }
  function toggleHaptics() { save.haptics = !save.haptics; LD.persist(); LD.vib(25); toast(save.haptics ? 'Vibration on' : 'Vibration off'); }
  function cycleTheme() {
    var list = ['dawn']; if (save.unlocked.night) list.push('night'); if (save.unlocked.volcano) list.push('volcano');
    if (list.length === 1) { toast('More themes: catch ' + LD.NIGHT_UNLOCK_CATCHES + ' dragons in total, or beat a boss'); return; }
    save.theme = list[(list.indexOf(save.theme) + 1) % list.length]; LD.persist(); resize(); toast('Theme: ' + art.THEMES[save.theme].name);
  }
  function inside(b, x, y) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }

  // ---------- input (touch first: one pointerdown = one tap, any number of fingers) ----------
  function toLogical(ev) { return { x: ev.clientX / V.scale, y: ev.clientY / V.scale }; }
  canvas.addEventListener('pointerdown', function (ev) {
    ev.preventDefault(); LD.audio();
    var p = toLogical(ev); S.pointer = p; S.taps.push({ x: p.x, y: p.y, life: 0.35 });
    var list = buttons(), i;
    if (S.screen === 'over' && S.overT < 0.8) return; // no accidental taps right after the last catch
    for (i = 0; i < list.length; i++) if (inside(list[i], p.x, p.y)) { S.pressed = { id: list[i].id, t: 0.16 }; sfx.click(); LD.vib(10); list[i].act(); return; }
    if (S.screen === 'play' && !S.paused) tapPlay(p.x, p.y);
  });
  canvas.addEventListener('pointermove', function (ev) { S.pointer = toLogical(ev); });
  canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  document.addEventListener('touchmove', function (ev) { ev.preventDefault(); }, { passive: false });
  window.addEventListener('deviceorientation', function (ev) { if (typeof ev.gamma === 'number') S.tiltX = clamp(ev.gamma / 30, -1, 1); });
  window.addEventListener('keydown', function (ev) {
    var k = (ev.key || '').toLowerCase();
    if (k === 'm') toggleSound();
    else if (k === 'p' && S.screen === 'play' && S.countdown <= 0) S.paused = !S.paused;
    else if (k === 'escape' && S.screen !== 'menu') goMenu();
    else if ((k === 'enter' || k === ' ') && S.screen !== 'play') { LD.audio(); startGame(S.screen === 'over' ? S.mode : 'classic'); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (S.screen === 'play' && S.countdown <= 0) S.paused = true; LD.audioSuspend(true); } else LD.audioSuspend(false);
  });

  // ---------- update ----------
  function updateFx(dt) {
    var i, p;
    for (i = P.length - 1; i >= 0; i--) {
      p = P[i]; p.life -= dt;
      if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
      if (p.k === 'paint' || p.k === 'shell') { p.vy += 700 * dt; p.rot += p.vr * dt; }
      else if (p.k === 'conf') { p.vy += 120 * dt; p.vx *= (1 - 1.2 * dt); p.rot += p.vr * dt; }
      else if (p.k === 'spark') { p.vx *= (1 - 2.5 * dt); p.vy *= (1 - 2.5 * dt); p.vy += 120 * dt; }
      else if (p.k === 'fire') { p.vy -= 260 * dt; p.vx *= (1 - 2 * dt); }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (i = S.floats.length - 1; i >= 0; i--) { var f = S.floats[i]; f.life -= dt; f.y -= 60 * dt; if (f.life <= 0) S.floats.splice(i, 1); }
    for (i = S.rings.length - 1; i >= 0; i--) { S.rings[i].life -= dt; if (S.rings[i].life <= 0) S.rings.splice(i, 1); }
    if (S.banner) { S.banner.t += dt; if (S.banner.t >= S.banner.dur) S.banner = null; }
  }
  function update(dt) {
    var i, d, f = field();
    S.t += dt;
    for (i = 0; i < S.clouds.length; i++) { var c = S.clouds[i]; c.x += c.v * dt; if (c.x > V.W + 20) c.x = -330 * c.s; }
    var amb = bg.theme.ambient;
    for (i = 0; i < S.amb.length; i++) {
      var a = S.amb[i]; a.ph += dt * 2.2;
      if (amb === 'ember') { a.y -= (30 + a.s * 3) * dt; a.x += Math.sin(a.ph) * 14 * dt; if (a.y < -20) { a.y = V.H + 20; a.x = rnd(0, V.W); } }
      else if (amb === 'firefly') { a.x += (a.vx + Math.sin(a.ph * 0.7) * 16) * dt; a.y += (a.vy + Math.cos(a.ph * 0.9) * 12) * dt; if (a.x < -20) a.x = V.W + 20; if (a.x > V.W + 20) a.x = -20; if (a.y < -20) a.y = V.H + 20; if (a.y > V.H + 20) a.y = -20; }
    }
    for (i = 0; i < S.decor.length; i++) { var q = S.decor[i]; q.x += q.vx * dt; q.ph += dt * 11; if (q.x < -60) q.x = V.W + 60; if (q.x > V.W + 60) q.x = -60; }
    var wantPar = S.tiltX !== null ? S.tiltX : clamp((S.pointer.x / V.W - 0.5) * 2, -1, 1);
    S.parX += (wantPar - S.parX) * Math.min(1, dt * 3);
    for (i = S.taps.length - 1; i >= 0; i--) { S.taps[i].life -= dt; if (S.taps[i].life <= 0) S.taps.splice(i, 1); }
    if (S.pressed) { S.pressed.t -= dt; if (S.pressed.t <= 0) S.pressed = null; }
    if (S.toast) { S.toast.t += dt; if (S.toast.t >= S.toast.dur) S.toast = null; }
    LD.music(S.screen === 'play' ? (S.paused ? '' : S.mode) : 'menu');

    if (S.screen === 'over') { S.overT += dt; S.shown += (S.score - S.shown) * Math.min(1, dt * 5); if (S.score - S.shown < 0.5) S.shown = S.score; updateFx(dt); return; }
    if (S.screen !== 'play') { updateFx(dt); return; }
    if (S.paused) return;
    if (S.hitstop > 0) { S.hitstop -= dt; dt *= 0.15; }

    if (S.countdown > 0) {
      S.countdown -= dt;
      var n = Math.ceil(S.countdown / 0.8);
      if (n !== S.lastCount) { S.lastCount = n; sfx.count(n === 0); if (n === 0) { banner('GO!', '', '#ffffff', 0.6); LD.vib(30); } }
    } else {
      if (S.mode === 'classic') {
        S.time -= dt;
        if (S.time <= 10 && Math.ceil(S.time) !== S.lastTick) { S.lastTick = Math.ceil(S.time); sfx.tick(); }
        if (S.time <= 0) { S.time = 0; endGame(); return; }
      }
      if (S.phase === 'wave') {
        S.goldIn -= dt;
        if (S.goldIn <= 0) {
          S.goldIn = rnd(13, 19);
          var left = Math.random() < 0.5, sp = Math.max(190, speedNow() * 1.8), ang = rnd(-0.5, 0.5);
          S.dragons.push({ x: left ? f.l + DRAGON_R : f.r - DRAGON_R, y: rnd(f.t + 90, f.b - 90), vx: Math.cos(ang) * sp * (left ? 1 : -1), vy: Math.sin(ang) * sp, color: 3, r: DRAGON_R,
            phase: 0, state: 'fly', eggT: 0, eggDur: 0, popDelay: 0, grow: 0, wobble: 0, gold: true, life: 6, blinkT: 9, blink: 0, fireT: 99, mouthT: 0, sparkT: 0 });
          logEv('goldSpawn');
        }
      }
    }
    for (i = S.spawnQ.length - 1; i >= 0; i--) { var s = S.spawnQ[i]; s.t -= dt; if (s.t <= 0) { S.spawnQ.splice(i, 1); S.dragons.push(makeDragon(s.color, 0.75, 0)); } }
    for (i = S.dragons.length - 1; i >= 0; i--) {
      d = S.dragons[i];
      if (d.state === 'egg') { d.eggT += dt; if (d.eggT >= d.eggDur) hatch(d); continue; }
      d.phase += dt * 13;
      if (d.state === 'leave') { d.x += d.vx * dt; d.y += d.vy * dt; if (d.y < -140) S.dragons.splice(i, 1); continue; }
      d.grow = Math.min(1, d.grow + dt * 3.2); d.wobble = Math.max(0, d.wobble - dt); d.mouthT = Math.max(0, d.mouthT - dt);
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.x < f.l + d.r) { d.x = f.l + d.r; d.vx = Math.abs(d.vx); } else if (d.x > f.r - d.r) { d.x = f.r - d.r; d.vx = -Math.abs(d.vx); }
      if (d.y < f.t + d.r) { d.y = f.t + d.r; d.vy = Math.abs(d.vy); } else if (d.y > f.b - d.r) { d.y = f.b - d.r; d.vy = -Math.abs(d.vy); }
      d.blink = Math.max(0, d.blink - dt); d.blinkT -= dt; if (d.blinkT <= 0) { d.blink = 0.13; d.blinkT = rnd(2, 5); }
      d.fireT -= dt;
      if (d.fireT <= 0) { d.fireT = rnd(5, 11); d.mouthT = 0.45; if (quality > 0) burstFire(d.x + (d.vx >= 0 ? 12 : -12), d.y + 10, 5, 110, d.vx >= 0 ? 0.9 : -0.9, 0.1); }
      if (d.gold) {
        d.life -= dt; d.sparkT -= dt;
        if (d.sparkT <= 0) { d.sparkT = 0.05; part('spark', d.x + rnd(-20, 20), d.y + rnd(-20, 20), rnd(-30, 30), rnd(-30, 30), 0.5, rnd(10, 18), 'gold'); }
        if (d.life <= 0) S.dragons.splice(i, 1);
      }
    }
    var b = S.boss;
    if (S.phase === 'boss' && b) {
      b.t += dt; b.hurt = Math.max(0, b.hurt - dt); b.mouthT = Math.max(0, b.mouthT - dt); b.cflash = Math.max(0, b.cflash - dt);
      if (b.state === 'egg') {
        b.eggT += dt; S.trauma = Math.max(S.trauma, 0.3 * b.eggT / b.eggDur);
        if (b.eggT >= b.eggDur) {
          b.state = 'fight'; b.grow = 0; burstShell(b.x, b.y, 30, 520); burstSpark(b.x, b.y, 'white', 16, 520); burstFire(b.x, b.y, 20, 380);
          ring(b.x, b.y, '#ffffff', 60, 420, 0.5, 10); S.trauma = 0.9; S.flash = 0.3; b.mouthT = 0.9;
          sfx.bossRoar(); LD.vib([80, 40, 120]); banner('BOSS!', 'Tap it when it wears the frame colour. Watch its warnings.', '#ff6a4a', 1.8); logEv('bossHatch');
        }
      } else if (b.state === 'fight') {
        updateBossFight(b, dt, f);
        if (S.screen !== 'play') return;
      } else if (b.state === 'dying') {
        b.dieT += dt; b.boomT -= dt; S.trauma = Math.max(S.trauma, 0.5);
        if (b.boomT <= 0) {
          b.boomT = 0.12; var bx = b.x + rnd(-b.r, b.r), by = b.y + rnd(-b.r, b.r), cc = COLORS[rint(4)];
          burstPaint(bx, by, cc.main, 10, 460); burstSpark(bx, by, cc.id, 6, 380); paintSplat(bx, by, rnd(40, 70), cc.main); ring(bx, by, cc.light, 20, 160, 0.3, 6);
        }
        if (b.dieT >= 1.3) finishBoss();
      }
    }
    if (S.combo >= 5 && S.mode !== 'zen' && quality > 0) { // combo fire licks up from the bottom edge
      var nf = S.combo >= 10 ? 3 : 1;
      for (i = 0; i < nf; i++) part('fire', rnd(0, V.W), V.H + 6, rnd(-30, 30), -rnd(120, 300), rnd(0.4, 0.8), rnd(18, 34), 'fire');
    }
    updateFx(dt);
    S.trauma = Math.max(0, S.trauma - dt * 1.7); S.flash = Math.max(0, S.flash - dt); S.redFlash = Math.max(0, S.redFlash - dt); S.fireSweep = Math.max(0, S.fireSweep - dt);
    S.chipPop = Math.max(0, S.chipPop - dt); S.scorePop = Math.max(0, S.scorePop - dt); S.heartPop = Math.max(0, S.heartPop - dt);
    var k = Math.min(1, dt * 9), tr = COLORS[S.target].rgb;
    for (i = 0; i < 3; i++) S.borderRgb[i] += (tr[i] - S.borderRgb[i]) * k;
  }

  // ---------- drawing ----------
  function rgbStr(a, alpha) { return 'rgba(' + Math.round(a[0]) + ',' + Math.round(a[1]) + ',' + Math.round(a[2]) + ',' + (alpha == null ? 1 : alpha) + ')'; }
  function glowAt(key, x, y, R, alpha) { ctx.globalAlpha = alpha; ctx.drawImage(art.glow(key), x - R, y - R, R * 2, R * 2); }
  function drawBackground() {
    var W = V.W, H = V.H, i;
    ctx.drawImage(bg.sky, 0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter'; glowAt(bg.theme.orbGlow, bg.orbX, bg.orbY, 250, 0.2 + 0.07 * Math.sin(S.t * 1.3)); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    for (var li = 0; li < bg.layers.length; li++) {
      var l = bg.layers[li], off = (((S.t * l.speed + S.parX * l.par * 46) % W) + W) % W;
      ctx.drawImage(l.c, -off, l.top, W, l.h); ctx.drawImage(l.c, W - off - 0.5, l.top, W, l.h);
      if (li === 0) {
        for (i = 0; i < S.clouds.length; i++) { var c = S.clouds[i]; ctx.drawImage(bg.clouds[c.i], c.x - S.parX * 14 * c.s, c.y, 320 * c.s, 150 * c.s); }
      }
    }
    var key = bg.theme.ambient === 'firefly' ? 'yellow' : bg.theme.ambient === 'ember' ? 'ember' : 'white';
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < S.amb.length; i++) { var a = S.amb[i]; glowAt(key, a.x, a.y, a.s, 0.25 + 0.55 * Math.abs(Math.sin(a.ph))); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function drawParticles() {
    var i, p, a, sz;
    for (i = 0; i < P.length; i++) {
      p = P[i]; a = p.life / p.max;
      if (p.k === 'paint') { ctx.globalAlpha = Math.min(1, a * 1.6); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }
      else if (p.k === 'shell' || p.k === 'conf') {
        ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        if (p.k === 'shell') { ctx.beginPath(); ctx.moveTo(-p.size, p.size * 0.6); ctx.lineTo(0, -p.size); ctx.lineTo(p.size, p.size * 0.5); ctx.closePath(); ctx.fill(); }
        else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * (0.4 + Math.abs(Math.sin(p.rot * 2))));
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < P.length; i++) {
      p = P[i]; a = p.life / p.max;
      if (p.k === 'spark') { sz = p.size * (0.5 + a); ctx.globalAlpha = a; ctx.drawImage(art.glow(p.color), p.x - sz, p.y - sz, sz * 2, sz * 2); }
      else if (p.k === 'fire') { sz = p.size * (0.6 + (1 - a)); ctx.globalAlpha = a * 0.9; ctx.drawImage(art.glow(a > 0.5 ? 'fire' : 'ember'), p.x - sz, p.y - sz, sz * 2, sz * 2); }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function drawRings() {
    for (var i = 0; i < S.rings.length; i++) {
      var r = S.rings[i], k = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - k; ctx.lineWidth = r.w * (1 - k * 0.6); ctx.strokeStyle = r.color; ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * LD.outCubic(k), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawTaps() { // touch feedback: every finger leaves a ripple
    for (var i = 0; i < S.taps.length; i++) {
      var t = S.taps[i], k = 1 - t.life / 0.35;
      ctx.globalAlpha = (1 - k) * 0.9; ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(t.x, t.y, 12 + k * 46, 0, TAU); ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.5; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(t.x, t.y, 10 * (1 - k), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawBanner() {
    var b = S.banner; if (!b) return;
    var k = b.t / b.dur, sc = LD.outBack(Math.min(1, b.t / 0.22)), al = k > 0.75 ? (1 - k) / 0.25 : 1, y = V.H * (V.portrait ? 0.4 : 0.42);
    var size = Math.min(110, V.W / (b.text.length * 0.62)) * sc;
    ctx.globalAlpha = al; T(b.text, V.W / 2, y, size, b.color, 'center', 'rgba(0,0,0,0.65)');
    if (b.sub) T(b.sub, V.W / 2, y + size * 0.72 + 8, Math.min(32, V.W / (b.sub.length * 0.55)), '#ffffff', 'center', 'rgba(0,0,0,0.6)');
    ctx.globalAlpha = 1;
  }
  function drawToast() {
    var t = S.toast; if (!t) return;
    var al = t.t < 0.2 ? t.t / 0.2 : t.t > t.dur - 0.4 ? (t.dur - t.t) / 0.4 : 1, size = Math.min(26, V.W / (t.text.length * 0.56));
    ctx.font = 'bold ' + Math.round(size) + 'px sans-serif';
    var w = Math.min(V.W - 30, t.text.length * size * 0.56 + 60), y = V.H - V.safe.b - 46;
    ctx.globalAlpha = al; art.rrect(ctx, (V.W - w) / 2, y - 26, w, 52, 26); ctx.fillStyle = 'rgba(8,10,30,0.88)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#ffd75a'; ctx.stroke();
    T(t.text, V.W / 2, y + 1, size, '#ffffff', 'center'); ctx.globalAlpha = 1;
  }
  function drawButton(b) {
    var pr = S.pressed && S.pressed.id === b.id ? 0.94 : 1, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(pr, pr); ctx.translate(-cx, -cy);
    if (b.kind === 'pill') {
      var f = b.style === 'blue' ? ['#4db2f5', '#1675c9', '#0c4f91'] : ['#f0584e', '#a8140f', '#6d0b08'];
      art.rrect(ctx, b.x, b.y + 7, b.w, b.h, 24); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      var g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h); g.addColorStop(0, f[0]); g.addColorStop(1, f[1]);
      art.rrect(ctx, b.x, b.y, b.w, b.h, 24); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = f[2]; ctx.stroke();
      ctx.globalAlpha = 0.25; art.rrect(ctx, b.x + 8, b.y + 6, b.w - 16, b.h * 0.4, 18); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.globalAlpha = 1;
      T(b.label, cx, cy + 2, Math.min(b.h * 0.46, b.w / (b.label.length * 0.68)), '#ffffff', 'center', 'rgba(0,0,0,0.4)');
    } else if (b.kind === 'icon') {
      art.rrect(ctx, b.x, b.y, b.w, b.h, b.w * 0.26); ctx.fillStyle = 'rgba(8,12,36,0.72)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke();
      var off = (b.id === 'sound' && !save.sound) || (b.id === 'music' && (!save.music || !save.sound)) || (b.id === 'haptic' && !save.haptics);
      art.icon(ctx, b.id, cx, cy, b.w * 0.56, off ? 'rgba(255,255,255,0.45)' : '#ffffff', off);
    }
    ctx.restore();
  }
  function drawCard(b) {
    var m = MODES[b.id], locked = b.id === 'boss' && !save.unlocked.boss, pr = S.pressed && S.pressed.id === b.id ? 0.96 : 1, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(pr, pr); ctx.translate(-cx, -cy);
    art.rrect(ctx, b.x, b.y + 8, b.w, b.h, 26); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    art.rrect(ctx, b.x, b.y, b.w, b.h, 26); ctx.fillStyle = 'rgba(10,14,44,0.8)'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = locked ? 'rgba(255,255,255,0.3)' : m.accent; ctx.stroke();
    var best = save.high[b.id], tag = locked ? 'Score ' + LD.BOSS_UNLOCK_SCORE + ' in Classic to unlock' : m.tag, nameCol = locked ? 'rgba(255,255,255,0.5)' : m.accent, ix, iy, ir;
    if (V.portrait) {
      ix = b.x + 68; iy = cy; ir = Math.min(40, b.h * 0.3);
      T(m.name, b.x + 132, cy - b.h * 0.17, Math.min(40, b.h * 0.3), nameCol, 'left');
      T(tag, b.x + 132, cy + b.h * 0.17, Math.min(21, (b.w - 150) / (tag.length * 0.5)), 'rgba(255,255,255,0.85)', 'left', null, 'normal');
      if (!locked) T('BEST ' + best, b.x + b.w - 24, cy - b.h * 0.17, 22, '#ffffff', 'right');
    } else {
      ix = cx; iy = b.y + 54; ir = 32;
      T(m.name, cx, b.y + 110, Math.min(36, b.w / (m.name.length * 0.66)), nameCol, 'center');
      T(tag, cx, b.y + 143, Math.min(19, (b.w - 20) / (tag.length * 0.5)), 'rgba(255,255,255,0.85)', 'center', null, 'normal');
      if (!locked) T('BEST ' + best, cx, b.y + 168, 18, '#ffffff', 'center');
    }
    if (locked) art.icon(ctx, 'lock', ix, iy, ir * 1.5, 'rgba(255,255,255,0.6)');
    else if (b.id === 'boss') art.dragon(ctx, ix, iy + 4, ir, 0, { flap: Math.sin(S.t * 7), boss: true, mouth: 'open', tail: S.t * 3 });
    else art.dragon(ctx, ix, iy + 2, ir, m.icon, { flap: Math.sin(S.t * 8 + m.icon), happy: b.id === 'zen', blink: b.id === 'zen', tail: S.t * 4 });
    ctx.restore();
  }

  function drawMenu() {
    var W = V.W, L = menuLayout(), i;
    drawBackground();
    for (i = 0; i < S.decor.length; i++) { var q = S.decor[i]; art.dragon(ctx, q.x, q.y + Math.sin(q.ph * 0.2) * 10, 17, q.c, { flap: Math.sin(q.ph), dir: q.vx > 0 ? 1 : -1, tail: q.ph * 0.4 }); }
    ctx.globalAlpha = 1; ctx.drawImage(art.vignette(), 0, 0, W, V.H);
    // title
    var ty = L.titleY + Math.sin(S.t * 1.6) * 4, size = L.titleSize;
    ctx.font = 'bold ' + Math.round(size) + 'px "Trebuchet MS", "Segoe UI", Roboto, Arial, sans-serif';
    var tw = ctx.measureText('Little Dragons').width;
    var tg = ctx.createLinearGradient(0, ty - size / 2, 0, ty + size / 2); tg.addColorStop(0, '#fff6b0'); tg.addColorStop(0.55, '#ffd23a'); tg.addColorStop(1, '#ff9a1a');
    T('Little Dragons', W / 2, ty + 5, size, 'rgba(0,0,0,0.35)', 'center');
    T('Little Dragons', W / 2, ty, size, tg, 'center', '#7a2f08');
    ctx.save(); ctx.translate(Math.min(W - 70, W / 2 + tw / 2 - 20), ty + size * 0.62); ctx.rotate(-0.1);
    art.rrect(ctx, -62, -24, 124, 48, 12); ctx.fillStyle = '#e3261f'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    T('2026', 0, 2, 34, '#ffffff', 'center'); ctx.restore();
    T('First built in 2012.  Rebuilt in 2026.', W / 2 - (V.portrait ? 0 : 0), ty + size * 0.66, V.portrait ? 21 : 22, 'rgba(255,255,255,0.9)', V.portrait ? 'center' : 'center', 'rgba(0,0,0,0.45)', 'normal');
    // the three dragons of the 2012 menu: alarm clock, sunglasses, "!" bubble
    var dx = L.dragDX, dy = L.dragY, r = L.dragR;
    function bob(p) { return Math.sin(S.t * 2 + p) * 8; }
    ctx.globalCompositeOperation = 'lighter'; glowAt('green', W / 2 - dx, dy, r * 2.2, 0.3); glowAt('red', W / 2, dy, r * 2.4, 0.3); glowAt('yellow', W / 2 + dx, dy, r * 2.2, 0.3); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    art.dragon(ctx, W / 2 - dx, dy + bob(0), r, 1, { flap: Math.sin(S.t * 9), happy: true, lookX: Math.sin(S.t), lookY: -0.6, tail: S.t * 4, dir: -1 });
    ctx.save(); ctx.translate(W / 2 - dx + r * 1.15, dy - r * 0.9 + bob(0)); ctx.rotate(Math.sin(S.t * 18) * 0.06); ctx.scale(r / 78, r / 78);
    ctx.fillStyle = '#d3221c'; ctx.beginPath(); ctx.arc(-26, -36, 13, 0, TAU); ctx.arc(26, -36, 13, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 33, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d3221c'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + ((S.t * 0.4) % TAU)); ctx.closePath(); ctx.fill(); ctx.restore();
    art.dragon(ctx, W / 2, dy + bob(2) * 0.5, r * 1.12, 0, { flap: Math.sin(S.t * 9 + 2) * 0.3, shades: true, tilt: -0.2, tail: S.t * 3 });
    art.dragon(ctx, W / 2 + dx, dy + bob(4), r, 3, { flap: Math.sin(S.t * 9 + 4), lookX: -0.8, lookY: -0.3, tail: S.t * 4 });
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(W / 2 + dx - r * 1.15, dy - r * 1.05 + bob(4), r * 0.42, 0, TAU); ctx.fill(); ctx.stroke();
    T('!', W / 2 + dx - r * 1.15, dy - r * 1.02 + bob(4), r * 0.62, '#111', 'center');

    var list = buttons();
    for (i = 0; i < list.length; i++) { if (list[i].kind === 'card') drawCard(list[i]); else drawButton(list[i]); }
    var next = !save.unlocked.boss ? 'Next unlock: BOSS RUSH (score ' + LD.BOSS_UNLOCK_SCORE + ' in Classic)'
      : !save.unlocked.night ? 'Next unlock: NIGHT SKY at ' + LD.NIGHT_UNLOCK_CATCHES + ' dragons'
      : !save.unlocked.volcano ? 'Next unlock: VOLCANO (beat a boss)' : 'Everything unlocked';
    T('Dragons caught: ' + save.catches + '    ' + next, W / 2, Math.min(L.progY, V.H - V.safe.b - 22), Math.min(21, W / 36), 'rgba(255,255,255,0.9)', 'center', 'rgba(0,0,0,0.5)', 'normal');
    drawToast();
  }

  function dragonOpts(d) {
    var sp = Math.hypot(d.vx, d.vy) || 1;
    return { flap: Math.sin(d.phase), dir: d.vx >= 0 ? 1 : -1, tail: d.phase * 0.45, lookX: d.vx / sp, lookY: d.vy / sp, scale: LD.outBack(d.grow),
      tilt: (d.vx / sp) * 0.12 + Math.sin(d.wobble * 40) * d.wobble * 0.6, blink: d.blink > 0, mouth: d.wobble > 0 ? 'o' : d.mouthT > 0 ? 'open' : undefined, gold: d.gold, happy: d.gold };
  }
  function drawWorld() {
    var W = V.W, H = V.H, i, d, border = rgbStr(S.borderRgb);
    drawBackground();
    ctx.fillStyle = rgbStr(S.borderRgb, 0.1); ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.88; ctx.drawImage(paint, 0, 0, W, H); ctx.globalAlpha = 1;
    // light: every dragon glows in its colour, the ones you should catch glow stronger
    if (quality > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < S.dragons.length; i++) {
        d = S.dragons[i]; if (d.state !== 'fly') continue;
        var hot = d.gold || (d.color === S.target && (S.phase === 'wave' || (S.boss && S.boss.mode === 'shield')));
        glowAt(d.gold ? 'gold' : COLORS[d.color].id, d.x, d.y, d.r * (hot ? 2.3 : 1.8), (hot ? 0.42 + 0.14 * Math.sin(S.t * 7) : 0.2) * d.grow);
      }
      if (S.boss && S.boss.state !== 'egg') {
        glowAt(COLORS[S.boss.color].id, S.boss.x, S.boss.y, S.boss.r * 2.2, 0.45);
        if (S.boss.rage && S.boss.state === 'fight') glowAt('ember', S.boss.x, S.boss.y, S.boss.r * 3, 0.4 + 0.15 * Math.sin(S.t * 9));
      }
      for (i = 0; i < S.orbs.length; i++) glowAt('fire', S.orbs[i].x, S.orbs[i].y, 120, 0.6);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    for (i = 0; i < S.dragons.length; i++) {
      d = S.dragons[i];
      if (d.state === 'egg') {
        var pr = d.eggT / d.eggDur, pop = LD.outBack((d.eggT - d.popDelay) / 0.25);
        if (d.eggT < d.popDelay) continue;
        art.egg(ctx, d.x, d.y, d.r * 0.82, d.color, clamp((pr - 0.5) / 0.45, 0, 1), Math.sin(d.eggT * 24) * 0.2 * pr * pr, pop, false);
      } else {
        if (d.gold && d.life < 1.5 && Math.floor(S.t * 10) % 2 === 0) continue;
        art.dragon(ctx, d.x, d.y, d.r, d.color, dragonOpts(d));
      }
    }
    var b = S.boss;
    if (b) {
      if (b.state === 'egg') { var bp = b.eggT / b.eggDur; art.egg(ctx, b.x, b.y, b.r * 0.9, b.color, clamp((bp - 0.3) / 0.6, 0, 1), Math.sin(b.eggT * 26) * 0.14 * bp, LD.outBack(Math.min(1, b.eggT / 0.35)), true); }
      else {
        var fight = b.state === 'fight', wind = fight && b.mode === 'windup', stun = fight && b.mode === 'stun', wk = wind ? b.windT / b.windMax : 0;
        var sc = b.state === 'dying' ? Math.max(0, 1 - b.dieT / 1.3) * (1 + 0.1 * Math.sin(b.dieT * 60)) : LD.outBack(b.grow) * (1 + 0.14 * wk);
        var shiver = fight && b.dashWarn > 0 ? Math.sin(b.t * 80) * 6 : 0;
        if (fight && b.tempo > 1.5 && quality > 0) { // dash: two fading after-images along the path
          for (i = 1; i <= 2; i++) {
            var ti = b.trail.length - 2 - i * 6; if (ti < 0) break;
            ctx.globalAlpha = 0.3 - i * 0.1; art.dragon(ctx, b.trail[ti], b.trail[ti + 1], b.r, b.color, { boss: true, flap: Math.sin(b.t * 7), tail: b.t * 3, scale: sc });
          }
          ctx.globalAlpha = 1;
        }
        art.dragon(ctx, b.x + shiver, b.y, b.r, b.color, { boss: true, flap: Math.sin(b.t * (b.rage ? 11 : 7)), tail: b.t * 3, scale: sc, lookX: Math.sin(b.t * 1.7), lookY: 0.2,
          mouth: b.mouthT > 0 || b.state === 'dying' ? 'open' : undefined, flash: Math.max(b.hurt / 0.3, b.cflash / 0.15 * 0.6),
          tilt: (stun ? Math.sin(b.t * 9) * 0.22 : Math.sin(b.t * 2) * 0.06) + (b.hurt > 0 ? Math.sin(b.hurt * 80) * 0.12 : 0) });
        if (fight) {
          // health bar: one segment per hit, it shakes when hit, two notches mark phase 2 and rage
          var hw = 240, hx = b.x - hw / 2 + (b.hpShake > 0 ? Math.sin(b.hpShake * 90) * 7 * b.hpShake / 0.35 : 0), hy = b.y - b.r - 58, seg = hw / b.maxHp;
          art.rrect(ctx, hx - 4, hy - 4, hw + 8, 24, 10); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
          for (i = 0; i < b.maxHp; i++) { art.rrect(ctx, hx + i * seg + 2, hy, seg - 4, 16, 5); ctx.fillStyle = i < b.hp ? (b.rage ? '#ff2d2d' : b.phase2 ? '#ff7a3a' : '#ff5a4f') : 'rgba(255,255,255,0.15)'; ctx.fill(); }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(hx + Math.ceil(b.maxHp * 2 / 3) * seg - 1.5, hy - 5, 3, 26); ctx.fillRect(hx + Math.ceil(b.maxHp / 3) * seg - 1.5, hy - 5, 3, 26);
          T(b.rage ? 'RAGE' : b.phase2 ? 'PHASE 2' : 'PHASE 1', b.x, hy - 22, 20, b.rage ? '#ff5a4f' : '#ffffff', 'center', 'rgba(0,0,0,0.6)');
          if (b.mode === 'roam') {
            var ck = clamp(b.charge / b.chargeMax, 0, 1); // ring: time to the next attack
            ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 26, 0, TAU); ctx.stroke();
            ctx.strokeStyle = ck > 0.7 ? '#ff3b30' : '#ffb347'; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 26, -Math.PI / 2, -Math.PI / 2 + TAU * ck); ctx.stroke();
            if (b.dashWarn > 0) T('!', b.x, b.y - b.r - 104, 64, '#ffe08a', 'center', 'rgba(0,0,0,0.7)');
          } else if (wind) {
            // warning: a red ring closes on the boss. When it touches, the fire comes.
            var wr = b.r + 26 + 150 * (1 - wk);
            ctx.lineWidth = 10 + 6 * wk; ctx.strokeStyle = 'rgba(255,59,48,' + (0.55 + 0.45 * wk) + ')'; ctx.beginPath(); ctx.arc(b.x, b.y, wr, 0, TAU); ctx.stroke();
            ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 26, 0, TAU); ctx.stroke();
            if (b.color === S.target && Math.floor(S.t * 8) % 2 === 0) T('HIT IT NOW!', bossLabelPos(b, 'HIT IT NOW!', 40).x, bossLabelPos(b, 'HIT IT NOW!', 40).y, 40, '#7dff8a', 'center', 'rgba(0,0,0,0.7)');
          } else if (b.mode === 'shield') {
            var sp = 1 + 0.03 * Math.sin(S.t * 6), sk = clamp(b.shieldT / b.shieldMax, 0, 1);
            ctx.fillStyle = 'rgba(150,220,255,0.2)'; ctx.beginPath(); ctx.arc(b.x, b.y, (b.r + 34) * sp, 0, TAU); ctx.fill();
            ctx.lineWidth = 7; ctx.strokeStyle = '#bfe9ff'; ctx.stroke();
            ctx.lineWidth = 6; ctx.strokeStyle = sk < 0.3 ? '#ff3b30' : '#ffffff'; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 50, -Math.PI / 2, -Math.PI / 2 + TAU * sk); ctx.stroke();
            T('CATCH ' + b.shieldNeed + ' MORE', bossLabelPos(b, 'CATCH 2 MORE', 32).x, bossLabelPos(b, 'CATCH 2 MORE', 32).y, 32, '#bfe9ff', 'center', 'rgba(0,0,0,0.7)');
          } else if (stun) {
            for (i = 0; i < 3; i++) { var sa = S.t * 5 + i * TAU / 3; ctx.fillStyle = '#fff3a8'; ctx.beginPath(); ctx.arc(b.x + Math.cos(sa) * 70, b.y - b.r - 6 + Math.sin(sa) * 16, 9, 0, TAU); ctx.fill(); }
            if (Math.floor(S.t * 8) % 2 === 0) T('STUNNED - HIT IT!', bossLabelPos(b, 'STUNNED - HIT IT!', 40).x, bossLabelPos(b, 'STUNNED - HIT IT!', 40).y, 40, '#7dff8a', 'center', 'rgba(0,0,0,0.7)');
          }
        }
      }
    }
    // v2 boss: fireballs with a fuse ring (white, red when it gets close)
    for (i = 0; i < S.orbs.length; i++) {
      var o = S.orbs[i], landed = o.fly >= o.flyDur, fk = landed ? clamp(o.fuse / o.max, 0, 1) : 1, or = (landed ? 34 : 24) * (1 + 0.1 * Math.sin(o.ph));
      ctx.fillStyle = '#c22a0c'; ctx.beginPath(); ctx.arc(o.x, o.y, or + 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(o.x, o.y, or, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(o.x, o.y - 3, or * 0.55, 0, TAU); ctx.fill();
      if (landed) {
        ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(o.x, o.y, 54, 0, TAU); ctx.stroke();
        ctx.strokeStyle = fk < 0.35 ? '#ff3b30' : '#ffffff'; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(o.x, o.y, 54, -Math.PI / 2, -Math.PI / 2 + TAU * fk); ctx.stroke();
      }
    }
    drawParticles(); drawRings();
    // frame in the target colour (the 2012 rule), with a soft glow into the playfield
    var gl = 70, c0 = rgbStr(S.borderRgb, 0.5), c1 = rgbStr(S.borderRgb, 0), g;
    g = ctx.createLinearGradient(0, 0, 0, gl); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(0, 0, W, gl);
    g = ctx.createLinearGradient(0, H, 0, H - gl); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(0, H - gl, W, gl);
    g = ctx.createLinearGradient(0, 0, gl, 0); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(0, 0, gl, H);
    g = ctx.createLinearGradient(W, 0, W - gl, 0); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(W - gl, 0, gl, H);
    ctx.lineWidth = 16; ctx.strokeStyle = border; ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.strokeRect(16, 16, W - 32, H - 32);
  }
  function drawHud() {
    var W = V.W, st = V.safe.t, sl = V.safe.l, sr = V.safe.r, y = st + 57, big = V.portrait ? 44 : 50, i;
    var list = buttons(); for (i = 0; i < list.length; i++) if (list[i].id === 'pause') drawButton(list[i]);
    var lx = sl + 100;
    if (S.mode === 'classic') {
      var low = S.time <= 10 && S.countdown <= 0;
      T(LD.fmtTime(S.time), lx, y, low ? big + 6 + 4 * Math.sin(S.t * 12) : big, low ? '#ff3b30' : '#ffffff', 'left', 'rgba(0,0,0,0.6)');
    } else if (S.mode === 'boss') {
      for (i = 0; i < 3; i++) { var hs = 15 * (i === S.hearts && S.heartPop > 0 ? 1 + S.heartPop : 1); art.heart(ctx, lx + 18 + i * 40, y - 2, hs, i < S.hearts ? '#ff4b5c' : 'rgba(0,0,0,0.45)', i < S.hearts ? '#7a0f1c' : 'rgba(255,255,255,0.4)'); }
    } else T('ZEN', lx, y, big - 6, '#7de0c8', 'left', 'rgba(0,0,0,0.6)');
    T(String(S.score), W - sr - 30, y, big * (1 + S.scorePop * 1.2), '#ffffff', 'right', 'rgba(0,0,0,0.6)');
    var sub = S.mode === 'classic' ? 'LEVEL ' + S.level : S.mode === 'boss' ? 'WAVE ' + S.wave + (S.phase === 'wave' ? '   ' + S.waveLeft + ' to boss' : S.boss && S.boss.state === 'fight' ? '   BOSS ' + S.boss.hp + '/' + S.boss.maxHp : '') : 'caught ' + S.catches;
    T(sub, W - sr - 30, y + 46, 22, 'rgba(255,255,255,0.92)', 'right', 'rgba(0,0,0,0.55)');
    // target chip
    var tc = COLORS[S.target], cw = V.portrait ? 236 : 310, ch = 62, pop = 1 + S.chipPop * 0.5;
    ctx.save(); ctx.translate(W / 2, st + 26 + ch / 2); ctx.scale(pop, pop);
    art.rrect(ctx, -cw / 2, -ch / 2, cw, ch, 31); ctx.fillStyle = 'rgba(6,8,28,0.72)'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = rgbStr(S.borderRgb); ctx.stroke();
    art.dragon(ctx, -cw / 2 + 40, 3, 18, S.target, { flap: Math.sin(S.t * 9), tail: S.t * 4 });
    T(V.portrait ? tc.name : 'CATCH ' + tc.name, 32, 2, V.portrait ? 32 : 31, tc.light, 'center');
    ctx.restore();
    if (S.combo >= 2 && S.mode !== 'zen') {
      var m = mult(), cc = m === 3 ? '#ff5a2a' : m === 2 ? '#ffb347' : '#ffffff';
      T('COMBO ' + S.combo + (m > 1 ? '   x' + m : ''), W / 2, st + 112, 24 + (m - 1) * 4 + S.chipPop * 14, cc, 'center', 'rgba(0,0,0,0.6)');
    }
  }
  function drawPlay() {
    var W = V.W, H = V.H, tr = S.trauma * S.trauma;
    ctx.save();
    if (tr > 0.001) { ctx.translate(W / 2 + rnd(-1, 1) * 24 * tr, H / 2 + rnd(-1, 1) * 24 * tr); ctx.rotate(rnd(-1, 1) * 0.035 * tr); ctx.scale(1 + 0.03 * tr, 1 + 0.03 * tr); ctx.translate(-W / 2, -H / 2); }
    drawWorld();
    ctx.restore();
    ctx.drawImage(art.vignette(), 0, 0, W, H);
    if (S.mode === 'classic' && S.time <= 10 && S.countdown <= 0) { // last ten seconds: red pulse on the edges
      var ra = 0.2 + 0.14 * Math.sin(S.t * 10), rm = Math.max(W, H);
      var rg = ctx.createRadialGradient(W / 2, H / 2, rm * 0.25, W / 2, H / 2, rm * 0.62); rg.addColorStop(0, 'rgba(255,0,0,0)'); rg.addColorStop(1, 'rgba(255,0,0,' + ra + ')');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
    if (S.redFlash > 0) { ctx.fillStyle = 'rgba(255,30,20,' + (S.redFlash * 0.7) + ')'; ctx.fillRect(0, 0, W, H); }
    if (S.fireSweep > 0) { var fg = ctx.createLinearGradient(0, 0, 0, H); fg.addColorStop(0, 'rgba(255,120,20,0)'); fg.addColorStop(1, 'rgba(255,90,10,' + (S.fireSweep * 0.9) + ')'); ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H); }
    if (S.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + S.flash + ')'; ctx.fillRect(0, 0, W, H); }
    for (var i = 0; i < S.floats.length; i++) { var f = S.floats[i]; ctx.globalAlpha = clamp(f.life * 1.6, 0, 1); T(f.text, f.x, f.y, f.size * (1 + Math.max(0, f.life - 0.95) * 3), f.color, 'center', 'rgba(0,0,0,0.65)'); }
    ctx.globalAlpha = 1;
    drawHud(); drawBanner();
    if (S.countdown > 0) {
      var n = Math.ceil(S.countdown / 0.8), frac = (S.countdown / 0.8) % 1;
      if (n > 0) T(String(n), W / 2, H * 0.42, 170 + frac * 90, '#ffffff', 'center', 'rgba(0,0,0,0.6)');
      var hint = S.mode === 'boss' ? 'Catch the frame colour. A wrong tap costs a heart.' : S.mode === 'zen' ? 'Catch the frame colour. Take your time.' : 'Catch the dragons in the frame colour';
      T(hint, W / 2, H * 0.42 + 170, Math.min(32, W / (hint.length * 0.55)), '#ffffff', 'center', 'rgba(0,0,0,0.6)');
    }
    if (S.paused) {
      ctx.fillStyle = 'rgba(4,6,20,0.7)'; ctx.fillRect(0, 0, W, H);
      T('PAUSED', W / 2, H / 2 - 110, 96, '#ffffff', 'center', 'rgba(0,0,0,0.6)');
      var list = buttons(); for (i = 0; i < list.length; i++) drawButton(list[i]);
    }
  }
  function drawOver() {
    var W = V.W, H = V.H, st = V.safe.t, i, por = V.portrait;
    drawBackground();
    ctx.globalAlpha = 0.9; ctx.drawImage(paint, 0, 0, W, H); ctx.globalAlpha = 1; // the painting you made stays behind the result
    ctx.fillStyle = 'rgba(4,6,22,0.62)'; ctx.fillRect(0, 0, W, H);
    drawParticles();
    var k = LD.outBack(S.overT / 0.4), y = st + (por ? H * 0.16 : 104);
    var title = S.mode === 'classic' ? "TIME'S UP!" : S.mode === 'zen' ? 'ZEN COMPLETE' : 'GAME OVER';
    T(title, W / 2, y, Math.min(92, W / (title.length * 0.62)) * k, '#ffffff', 'center', 'rgba(0,0,0,0.6)');
    art.dragon(ctx, W / 2 - (por ? 250 : 400), y + (por ? 150 : 96), 50 * k, 3, { happy: true, tilt: -0.25, flap: Math.sin(S.t * 8), tail: S.t * 4, dir: -1 });
    art.dragon(ctx, W / 2 + (por ? 250 : 400), y + (por ? 150 : 96), 50 * k, 2, { happy: true, tilt: 0.25, flap: Math.sin(S.t * 8 + 2), tail: S.t * 4 });
    y += por ? 150 : 104;
    T(String(Math.round(S.shown)), W / 2, y, 120, '#ffd75a', 'center', '#7a2f08');
    y += por ? 96 : 78;
    if (S.newHigh) T('NEW HIGH SCORE!', W / 2, y, 38 + 3 * Math.sin(S.t * 8), '#fff3a8', 'center', '#b8500f');
    else T('High score: ' + save.high[S.mode], W / 2, y, 30, '#d6dbea', 'center', 'rgba(0,0,0,0.5)');
    y += por ? 64 : 48;
    var tries = S.catches + S.misses, acc = tries ? Math.round(S.catches / tries * 100) : 0;
    var l1 = 'caught ' + S.catches + '    wrong ' + S.misses + '    accuracy ' + acc + ' %';
    var l2 = S.mode === 'classic' ? 'best combo ' + S.bestCombo + '    level ' + S.level : S.mode === 'boss' ? 'best combo ' + S.bestCombo + '    wave ' + S.wave + '    bosses beaten ' + S.bossesDown : 'best streak ' + S.bestCombo;
    T(l1, W / 2, y, Math.min(26, W / 30), '#c9d0e6', 'center', null, 'normal'); y += 36;
    T(l2, W / 2, y, Math.min(26, W / 30), '#c9d0e6', 'center', null, 'normal'); y += por ? 70 : 50;
    for (i = 0; i < S.unlockedNow.length; i++) {
      var a = clamp((S.overT - 1.0 - i * 0.35) / 0.3, 0, 1); if (a <= 0) continue;
      var txt = 'UNLOCKED:  ' + S.unlockedNow[i], uw = Math.min(W - 60, 560), us = LD.outBack(a);
      ctx.save(); ctx.translate(W / 2, y + i * 62); ctx.scale(us, us);
      art.rrect(ctx, -uw / 2, -25, uw, 50, 25); ctx.fillStyle = 'rgba(255,215,90,0.95)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#7a2f08'; ctx.stroke();
      T(txt, 0, 2, Math.min(26, uw / (txt.length * 0.6)), '#3a1a04', 'center'); ctx.restore();
    }
    var list = buttons(); for (i = 0; i < list.length; i++) drawButton(list[i]);
  }

  function render() {
    var s = V.px;
    ctx.setTransform(s, 0, 0, s, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (S.screen === 'menu') drawMenu(); else if (S.screen === 'play') drawPlay(); else drawOver();
    drawTaps();
  }

  // ---------- loop, with a simple quality governor for slow phones ----------
  var perf = LD.perf = { frames: 0, jsSum: 0, jsMax: 0, dts: [], qualityDrops: 0 };
  var last = performance.now(), accDt = 0, accN = 0;
  function frame(now) {
    var raw = now - last; last = now;
    var dt = Math.min(0.05, Math.max(0, raw / 1000));
    var t0 = performance.now();
    update(dt); render();
    var js = performance.now() - t0;
    perf.frames++; perf.jsSum += js; if (js > perf.jsMax) perf.jsMax = js; if (perf.dts.length < 6000) perf.dts.push(raw);
    if (raw < 100 && S.screen === 'play' && !S.paused) {
      accDt += raw; accN++;
      if (accN >= 90) { if (accDt / accN > 22 && quality > 0) { quality--; perf.qualityDrops++; resize(); } accDt = 0; accN = 0; }
    }
    requestAnimationFrame(frame);
  }
  resize();
  requestAnimationFrame(frame);

  // read-only hooks for the automated play test (the bot taps with real input events)
  window.__ld = {
    version: LD.VERSION, S: S, COLORS: COLORS, P: P, save: save, perf: perf, MODES: MODES,
    view: function () { return { W: V.W, H: V.H, scale: V.scale, dpr: V.dpr, portrait: V.portrait, quality: quality, canvasW: canvas.width, canvasH: canvas.height }; },
    field: field, clientPos: function (x, y) { return { x: x * V.scale, y: y * V.scale }; }, buttons: buttons,
    counts: function () { return { sfx: LD.sfxCount, vib: LD.vibCount, music: LD.musicSteps, sfxNames: LD.SFX_NAMES.length }; }
  };
})();
