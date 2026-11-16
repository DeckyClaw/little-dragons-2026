// Little Dragons 2026 - art: every picture is drawn by code (dragons, eggs, parallax backgrounds, glow sprites, icons).
(function () {
  'use strict';
  var LD = window.LD, TAU = LD.TAU, art = LD.art = {};
  var FONT = '"Trebuchet MS", "Segoe UI", Roboto, Arial, sans-serif';

  art.text = function (ctx, str, x, y, size, color, align, stroke, weight) {
    ctx.font = (weight || 'bold') + ' ' + Math.round(size) + 'px ' + FONT;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = stroke; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  };
  art.rrect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  art.makeCanvas = makeCanvas;
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- glow sprites (drawn additively: cheap light) ----------
  var GLOW_RGB = { red: [255, 80, 60], green: [80, 255, 90], blue: [90, 140, 255], yellow: [255, 225, 70], gold: [255, 215, 90], fire: [255, 150, 40], ember: [255, 80, 30], white: [255, 255, 255] };
  var glows = {};
  art.glow = function (key) {
    if (glows[key]) return glows[key];
    var c = makeCanvas(128, 128), g = c.getContext('2d'), rgb = GLOW_RGB[key] || GLOW_RGB.white;
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64), p = 'rgba(' + rgb.join(',') + ',';
    gr.addColorStop(0, p + '1)'); gr.addColorStop(0.25, p + '0.55)'); gr.addColorStop(0.6, p + '0.16)'); gr.addColorStop(1, p + '0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return (glows[key] = c);
  };
  var vignette = null;
  art.vignette = function () {
    if (vignette) return vignette;
    vignette = makeCanvas(256, 256); var g = vignette.getContext('2d');
    var gr = g.createRadialGradient(128, 128, 70, 128, 128, 182);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return vignette;
  };

  // ---------- dragon (drawn around 0,0 on a 50-unit radius) ----------
  function bodyPath(ctx) {
    ctx.beginPath(); ctx.moveTo(0, -48); ctx.bezierCurveTo(34, -48, 43, -10, 37, 14); ctx.bezierCurveTo(31, 40, 12, 51, 0, 53);
    ctx.bezierCurveTo(-12, 51, -31, 40, -37, 14); ctx.bezierCurveTo(-43, -10, -34, -48, 0, -48); ctx.closePath();
  }
  // o: flap, dir, tail, lookX, lookY, tilt, scale, sx, sy, blink, mouth ('grr'|'smile'|'open'|'o'), happy, shades, gold, boss, flash
  art.dragon = function (ctx, x, y, r, ci, o) {
    o = o || {};
    var c = o.gold ? LD.GOLD : LD.COLORS[ci];
    var sc = (r / 50) * (o.scale == null ? 1 : o.scale);
    if (sc <= 0.002) return;
    ctx.save(); ctx.translate(x, y); if (o.tilt) ctx.rotate(o.tilt); ctx.scale(sc * (o.sx || 1), sc * (o.sy || 1));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var flap = o.flap || 0, dir = o.dir < 0 ? -1 : 1, tw = Math.sin(o.tail || 0) * 7, k, side;
    // tail with a spade tip
    ctx.beginPath(); ctx.moveTo(-dir * 18, 40); ctx.quadraticCurveTo(-dir * 60, 56 + tw, -dir * 64, 24 + tw);
    ctx.lineWidth = 12; ctx.strokeStyle = c.dark; ctx.stroke(); ctx.lineWidth = 7; ctx.strokeStyle = c.main; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-dir * 64, 6 + tw); ctx.lineTo(-dir * 53, 25 + tw); ctx.lineTo(-dir * 64, 32 + tw); ctx.lineTo(-dir * 75, 25 + tw); ctx.closePath();
    ctx.fillStyle = c.dark; ctx.fill();
    // wings: membrane + two finger bones
    for (k = 0; k < 2; k++) {
      side = k ? 1 : -1;
      ctx.save(); ctx.translate(side * 28, -8); ctx.rotate(side * (-0.28 + flap * 0.6)); ctx.scale(side, 1);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(48, -30); ctx.quadraticCurveTo(38, -12, 42, 4); ctx.quadraticCurveTo(30, 0, 26, 17);
      ctx.quadraticCurveTo(14, 8, 0, 13); ctx.closePath();
      ctx.fillStyle = c.wing; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = c.dark; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(42, 4); ctx.moveTo(0, 0); ctx.lineTo(26, 17); ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    // feet
    ctx.fillStyle = c.dark;
    ctx.beginPath(); ctx.ellipse(-15, 51, 10, 6, 0, 0, TAU); ctx.ellipse(15, 51, 10, 6, 0, 0, TAU); ctx.fill();
    // crest: a different shape per colour, so colour is never the only cue
    ctx.fillStyle = c.dark; ctx.beginPath();
    if (o.boss) {
      ctx.moveTo(-26, -36); ctx.quadraticCurveTo(-52, -62, -34, -88); ctx.quadraticCurveTo(-30, -62, -10, -46);
      ctx.moveTo(26, -36); ctx.quadraticCurveTo(52, -62, 34, -88); ctx.quadraticCurveTo(30, -62, 10, -46);
      ctx.moveTo(-7, -46); ctx.lineTo(0, -66); ctx.lineTo(7, -46);
    } else if (ci === 0 || o.gold) { ctx.moveTo(-22, -40); ctx.lineTo(-30, -66); ctx.lineTo(-8, -46); ctx.moveTo(22, -40); ctx.lineTo(30, -66); ctx.lineTo(8, -46); }
    else if (ci === 1) { for (k = -1; k <= 1; k++) { ctx.moveTo(k * 16 - 9, -44); ctx.lineTo(k * 16, -64 + Math.abs(k) * 8); ctx.lineTo(k * 16 + 9, -44); } }
    else if (ci === 2) { ctx.moveTo(-14, -44); ctx.quadraticCurveTo(-4, -78, 20, -70); ctx.quadraticCurveTo(6, -60, 14, -44); }
    else { for (k = 0; k < 4; k++) { var a = -2.2 + k * 0.42; ctx.moveTo(Math.cos(a) * 40 - 5, Math.sin(a) * 44); ctx.lineTo(Math.cos(a) * 64, Math.sin(a) * 68); ctx.lineTo(Math.cos(a) * 40 + 7, Math.sin(a) * 44 + 3); } }
    ctx.fill();
    // body
    bodyPath(ctx);
    var g = ctx.createLinearGradient(-20, -48, 20, 53); g.addColorStop(0, c.main); g.addColorStop(1, c.dark);
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = c.dark; ctx.stroke();
    // belly with scale stripes, highlight, cheeks
    ctx.fillStyle = c.light; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.ellipse(0, 26, 18, 20, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.5; ctx.strokeStyle = c.dark; ctx.lineWidth = 1.6; ctx.beginPath();
    for (k = 0; k < 3; k++) { ctx.moveTo(-13 + k * 2, 17 + k * 8); ctx.quadraticCurveTo(0, 22 + k * 8, 13 - k * 2, 17 + k * 8); }
    ctx.stroke();
    ctx.globalAlpha = 0.28; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(-16, -30, 11, 7, -0.6, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#ff7a9a'; ctx.beginPath(); ctx.arc(-27, 0, 6, 0, TAU); ctx.arc(27, 0, 6, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    // eyes
    var lx = LD.clamp(o.lookX || 0, -1, 1) * 4.5, ly = LD.clamp(o.lookY || 0, -1, 1) * 3.5;
    for (k = 0; k < 2; k++) {
      side = k ? 1 : -1;
      if (o.blink) {
        ctx.lineWidth = 3; ctx.strokeStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(side * 13.5, -19, 10, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      } else {
        ctx.fillStyle = o.boss ? '#fff2a8' : '#fff'; ctx.beginPath(); ctx.arc(side * 13.5, -17, 12.5, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#222'; ctx.stroke();
        ctx.fillStyle = o.boss ? '#a80f0f' : '#111'; ctx.beginPath(); ctx.arc(side * 13.5 + lx, -16 + ly, 5.4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(side * 13.5 + lx - 1.8, -18 + ly, 1.8, 0, TAU); ctx.fill();
      }
    }
    if (o.shades) {
      ctx.fillStyle = '#151515'; art.rrect(ctx, -28, -29, 26, 20, 6); ctx.fill(); art.rrect(ctx, 2, -29, 26, 20, 6); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#151515'; ctx.beginPath(); ctx.moveTo(-3, -22); ctx.lineTo(3, -22); ctx.stroke();
    } else if (!o.happy && !o.blink) {
      ctx.lineWidth = 4.5; ctx.strokeStyle = '#1a1a1a'; ctx.beginPath();
      ctx.moveTo(-27, -35); ctx.lineTo(-5, -26); ctx.moveTo(27, -35); ctx.lineTo(5, -26); ctx.stroke();
    }
    // nostrils + mouth
    ctx.fillStyle = c.dark; ctx.beginPath(); ctx.arc(-4, -2, 1.8, 0, TAU); ctx.arc(4, -2, 1.8, 0, TAU); ctx.fill();
    var mouth = o.mouth || (o.happy || o.shades ? 'smile' : 'grr');
    ctx.lineWidth = 3; ctx.strokeStyle = '#1a1a1a';
    if (mouth === 'open') {
      ctx.fillStyle = '#3a0a0a'; ctx.beginPath(); ctx.ellipse(0, 9, 10, 8, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff6a6a'; ctx.beginPath(); ctx.ellipse(0, 13, 5, 3, 0, 0, TAU); ctx.fill();
    } else if (mouth === 'o') {
      ctx.fillStyle = '#3a0a0a'; ctx.beginPath(); ctx.arc(0, 9, 5, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (mouth === 'smile') {
      ctx.beginPath(); ctx.arc(0, 2, 9, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, 12, 7, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-5, 6.5); ctx.lineTo(-3, 11); ctx.lineTo(-1, 6); ctx.moveTo(5, 6.5); ctx.lineTo(3, 11); ctx.lineTo(1, 6); ctx.fill();
    }
    if (o.flash > 0) { ctx.globalAlpha = Math.min(1, o.flash); ctx.fillStyle = '#ffffff'; bodyPath(ctx); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.restore();
  };

  // ---------- egg (pivot at the bottom so it can wobble) ----------
  var SPECK = [[-18, -10, 7], [12, -26, 5], [20, 8, 8], [-8, 24, 6], [-24, 22, 4], [4, 2, 4], [-10, -34, 4]];
  var CRACK = [[-39, 4], [-27, -8], [-15, 5], [-4, -9], [8, 6], [20, -7], [30, 4], [39, -3]];
  art.egg = function (ctx, x, y, r, ci, crack, wob, scale, gold) {
    var c = gold ? LD.GOLD : LD.COLORS[ci], sc = (r / 50) * (scale == null ? 1 : scale), k;
    if (sc <= 0.002) return;
    ctx.save(); ctx.translate(x, y + r * 0.9); ctx.rotate(wob || 0); ctx.scale(sc, sc); ctx.translate(0, -45);
    ctx.beginPath(); ctx.moveTo(0, -52); ctx.bezierCurveTo(30, -52, 40, -5, 40, 14); ctx.bezierCurveTo(40, 38, 22, 50, 0, 50);
    ctx.bezierCurveTo(-22, 50, -40, 38, -40, 14); ctx.bezierCurveTo(-40, -5, -30, -52, 0, -52); ctx.closePath();
    var g = ctx.createLinearGradient(-20, -52, 20, 50); g.addColorStop(0, '#fffdf4'); g.addColorStop(1, gold ? '#f1c95a' : '#e2d2ad');
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = '#8f7a52'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = c.main; ctx.globalAlpha = 0.9; ctx.beginPath();
    for (k = 0; k < SPECK.length; k++) { ctx.moveTo(SPECK[k][0] + SPECK[k][2], SPECK[k][1]); ctx.arc(SPECK[k][0], SPECK[k][1], SPECK[k][2], 0, TAU); }
    ctx.fill(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-14, -26, 8, 14, -0.4, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    if (crack > 0) {
      var n = Math.max(1, Math.round(crack * (CRACK.length - 1)));
      ctx.beginPath(); ctx.moveTo(CRACK[0][0], CRACK[0][1]);
      for (k = 1; k <= n; k++) ctx.lineTo(CRACK[k][0], CRACK[k][1]);
      ctx.lineWidth = 3; ctx.strokeStyle = '#4a3a22'; ctx.stroke();
    }
    ctx.restore();
  };

  // ---------- paint splat (drawn once into the paint layer) ----------
  art.splat = function (ctx, x, y, size, color, alpha) {
    var n = 8 + LD.rint(5), k, a, d, r;
    ctx.fillStyle = color; ctx.globalAlpha = alpha == null ? 0.85 : alpha; ctx.beginPath();
    ctx.arc(x, y, size * 0.62, 0, TAU);
    for (k = 0; k < n; k++) { a = (k / n) * TAU + LD.rnd(-0.25, 0.25); d = size * LD.rnd(0.4, 0.9); r = size * LD.rnd(0.22, 0.42); ctx.moveTo(x + Math.cos(a) * d + r, y + Math.sin(a) * d); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r, 0, TAU); }
    for (k = 0; k < 7; k++) { a = LD.rnd(0, TAU); d = size * LD.rnd(1.3, 2.1); r = size * LD.rnd(0.06, 0.14); ctx.moveTo(x + Math.cos(a) * d + r, y + Math.sin(a) * d); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r, 0, TAU); }
    ctx.fill();
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x - size * 0.2, y - size * 0.25, size * 0.22, size * 0.12, -0.5, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  };

  // ---------- icons ----------
  art.heart = function (ctx, x, y, s, fill, stroke) {
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.5, y - s * 0.1, x, y + s * 0.9); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
  };
  art.icon = function (ctx, name, cx, cy, s, col, off) {
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = s * 0.13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (name === 'sound') {
      ctx.beginPath(); ctx.moveTo(cx - s * 0.55, cy - s * 0.2); ctx.lineTo(cx - s * 0.28, cy - s * 0.2); ctx.lineTo(cx + s * 0.05, cy - s * 0.5); ctx.lineTo(cx + s * 0.05, cy + s * 0.5);
      ctx.lineTo(cx - s * 0.28, cy + s * 0.2); ctx.lineTo(cx - s * 0.55, cy + s * 0.2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.1, cy, s * 0.3, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + s * 0.1, cy, s * 0.52, -0.9, 0.9); ctx.stroke();
    } else if (name === 'music') {
      ctx.beginPath(); ctx.ellipse(cx - s * 0.25, cy + s * 0.32, s * 0.2, s * 0.15, -0.3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + s * 0.3, cy + s * 0.2, s * 0.2, s * 0.15, -0.3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.07, cy + s * 0.32); ctx.lineTo(cx - s * 0.07, cy - s * 0.4); ctx.lineTo(cx + s * 0.48, cy - s * 0.52); ctx.lineTo(cx + s * 0.48, cy + s * 0.2); ctx.stroke();
    } else if (name === 'haptic') {
      art.rrect(ctx, cx - s * 0.22, cy - s * 0.45, s * 0.44, s * 0.9, s * 0.08); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.45, cy - s * 0.2); ctx.lineTo(cx - s * 0.45, cy + s * 0.2); ctx.moveTo(cx + s * 0.45, cy - s * 0.2); ctx.lineTo(cx + s * 0.45, cy + s * 0.2); ctx.stroke();
    } else if (name === 'theme') {
      ctx.beginPath(); ctx.arc(cx - s * 0.1, cy - s * 0.1, s * 0.24, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.6, cy + s * 0.5); ctx.lineTo(cx - s * 0.1, cy); ctx.lineTo(cx + s * 0.15, cy + s * 0.22); ctx.lineTo(cx + s * 0.35, cy + s * 0.05); ctx.lineTo(cx + s * 0.6, cy + s * 0.5); ctx.closePath(); ctx.fill();
    } else if (name === 'pause') {
      art.rrect(ctx, cx - s * 0.34, cy - s * 0.4, s * 0.24, s * 0.8, s * 0.06); ctx.fill(); art.rrect(ctx, cx + s * 0.1, cy - s * 0.4, s * 0.24, s * 0.8, s * 0.06); ctx.fill();
    } else if (name === 'lock') {
      art.rrect(ctx, cx - s * 0.36, cy - s * 0.05, s * 0.72, s * 0.55, s * 0.1); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy - s * 0.08, s * 0.24, Math.PI, 0); ctx.stroke();
    }
    if (off) { ctx.strokeStyle = '#ff5a4f'; ctx.lineWidth = s * 0.14; ctx.beginPath(); ctx.moveTo(cx - s * 0.55, cy - s * 0.55); ctx.lineTo(cx + s * 0.55, cy + s * 0.55); ctx.stroke(); }
    ctx.restore();
  };

  // ---------- parallax backgrounds: a sky plus three tileable silhouette layers per theme ----------
  art.THEMES = {
    dawn: { name: 'DAWN VALLEY', sky: ['#1f2b7a', '#6a4aa8', '#f0806a', '#ffd9a0'], far: ['#9a82c4', '#7a68ae'], mid: ['#5c5aa0', '#454784'], near: ['#2b3470', '#1c2250'],
      cloud: 'rgba(255,225,215,0.85)', orb: '#fff3c8', orbGlow: 'fire', ambient: 'firefly', hud: '#ffffff' },
    night: { name: 'NIGHT SKY', sky: ['#03051a', '#0c1647', '#243a80', '#4a5fa8'], far: ['#2a3a78', '#22306a'], mid: ['#1a2557', '#131c47'], near: ['#0c1233', '#070b22'],
      cloud: 'rgba(120,140,210,0.45)', orb: '#f4f6ff', orbGlow: 'white', ambient: 'star', hud: '#ffffff' },
    volcano: { name: 'VOLCANO', sky: ['#120306', '#3d0b0b', '#a02a0c', '#ff8a2a'], far: ['#5a1f1c', '#3f1414'], mid: ['#34100f', '#240a0b'], near: ['#170607', '#0c0304'],
      cloud: 'rgba(90,50,50,0.6)', orb: '#ffd08a', orbGlow: 'ember', ambient: 'ember', hud: '#ffffff' }
  };
  function pine(g, x, base, h, col) {
    g.fillStyle = col; g.beginPath();
    for (var i = 0; i < 3; i++) { var w = h * (0.34 - i * 0.07), y0 = base - h * (0.18 + i * 0.26); g.moveTo(x - w, y0); g.lineTo(x, y0 - h * 0.42); g.lineTo(x + w, y0); }
    g.rect(x - h * 0.04, base - h * 0.2, h * 0.08, h * 0.22); g.fill();
  }
  function ridge(g, W, H, top, fn, cols) {
    var gr = g.createLinearGradient(0, top, 0, H); gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1]);
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, H + 2);
    for (var x = 0; x <= W; x += 6) g.lineTo(x, fn(x));
    g.lineTo(W, fn(W)); g.lineTo(W, H + 2); g.closePath(); g.fill();
  }
  art.buildBackground = function (themeId, W, H, px) {
    var th = art.THEMES[themeId] || art.THEMES.dawn, R = rng(themeId.length * 977 + 13), bg = { theme: th, id: themeId, layers: [], clouds: [] }, PI = Math.PI, g, i;
    // sky
    bg.sky = makeCanvas(W * px, H * px); g = bg.sky.getContext('2d'); g.scale(px, px);
    var sg = g.createLinearGradient(0, 0, 0, H - 120); th.sky.forEach(function (c, k) { sg.addColorStop(k / (th.sky.length - 1), c); });
    g.fillStyle = sg; g.fillRect(0, 0, W, H);
    bg.orbX = W * 0.72; bg.orbY = H - 400;
    if (themeId === 'night') {
      for (i = 0; i < 170; i++) { g.globalAlpha = 0.3 + R() * 0.7; g.fillStyle = '#fff'; g.beginPath(); g.arc(R() * W, R() * (H - 260), 0.6 + R() * 1.6, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
      for (i = 0; i < 3; i++) { // aurora bands
        var ay = H * 0.12 + i * 70, ag = g.createLinearGradient(0, ay - 60, 0, ay + 120);
        ag.addColorStop(0, 'rgba(80,255,170,0)'); ag.addColorStop(0.4, 'rgba(80,255,170,' + (0.2 - i * 0.04) + ')'); ag.addColorStop(1, 'rgba(120,120,255,0)');
        g.fillStyle = ag; g.beginPath(); g.moveTo(0, ay);
        for (var ax = 0; ax <= W; ax += 20) g.lineTo(ax, ay + Math.sin(ax / W * TAU * 1.5 + i * 2) * 40);
        g.lineTo(W, ay + 160); g.lineTo(0, ay + 160); g.closePath(); g.fill();
      }
    }
    if (themeId === 'dawn') { // sun rays
      g.save(); g.translate(bg.orbX, bg.orbY); g.fillStyle = 'rgba(255,240,200,0.07)';
      for (i = 0; i < 12; i++) { g.rotate(TAU / 12); g.beginPath(); g.moveTo(0, 0); g.lineTo(1500, -150); g.lineTo(1500, 150); g.closePath(); g.fill(); }
      g.restore();
    }
    var og = g.createRadialGradient(bg.orbX, bg.orbY, 10, bg.orbX, bg.orbY, 260);
    og.addColorStop(0, themeId === 'night' ? 'rgba(200,215,255,0.5)' : 'rgba(255,220,150,0.75)'); og.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = og; g.fillRect(bg.orbX - 260, bg.orbY - 260, 520, 520);
    g.fillStyle = th.orb; g.beginPath(); g.arc(bg.orbX, bg.orbY, themeId === 'night' ? 46 : 62, 0, TAU); g.fill();
    if (themeId === 'night') { g.fillStyle = 'rgba(160,175,220,0.5)'; g.beginPath(); g.arc(bg.orbX - 14, bg.orbY - 10, 9, 0, TAU); g.arc(bg.orbX + 16, bg.orbY + 12, 6, 0, TAU); g.arc(bg.orbX + 6, bg.orbY - 20, 4, 0, TAU); g.fill(); }

    function layer(top, speed, par, draw) {
      var c = makeCanvas(W * px, (H - top) * px), lg = c.getContext('2d');
      lg.scale(px, px); lg.translate(0, -top); draw(lg);
      bg.layers.push({ c: c, top: top, h: H - top, speed: speed, par: par });
    }
    // far: jagged mountains (|sin| with whole periods, so the tile wraps without a seam)
    var farFn = function (x) { return H - 215 - 175 * Math.abs(Math.sin(PI * 3 * x / W + 0.5)) * (0.62 + 0.38 * Math.sin(TAU * 2 * x / W + 1)) - 38 * Math.abs(Math.sin(PI * 7 * x / W + 2)); };
    layer(H - 470, 5, 0.25, function (lg) {
      ridge(lg, W, H, H - 440, farFn, th.far);
      if (themeId === 'volcano') {
        var vx = W * 0.3, vt = H - 430;
        var vg = lg.createLinearGradient(0, vt, 0, H); vg.addColorStop(0, '#6a2a22'); vg.addColorStop(1, th.far[1]);
        lg.fillStyle = vg; lg.beginPath(); lg.moveTo(vx - 190, H); lg.lineTo(vx - 36, vt); lg.lineTo(vx + 36, vt); lg.lineTo(vx + 190, H); lg.closePath(); lg.fill();
        lg.fillStyle = '#ffb347'; lg.beginPath(); lg.ellipse(vx, vt + 3, 36, 8, 0, 0, TAU); lg.fill();
        lg.strokeStyle = '#ff7a1a'; lg.lineWidth = 7; lg.lineCap = 'round'; lg.beginPath(); lg.moveTo(vx - 8, vt + 6); lg.quadraticCurveTo(vx - 30, vt + 90, vx - 14, vt + 170);
        lg.moveTo(vx + 14, vt + 6); lg.quadraticCurveTo(vx + 44, vt + 70, vx + 30, vt + 120); lg.stroke();
      } else { // snow caps
        lg.fillStyle = 'rgba(255,255,255,0.35)';
        for (var s = 0; s < 3; s++) { var px0 = W * (s + 0.5 - 0.5 / PI) / 3; px0 = ((px0 % W) + W) % W; var py = farFn(px0); lg.beginPath(); lg.moveTo(px0, py - 2); lg.lineTo(px0 - 34, py + 44); lg.lineTo(px0 - 10, py + 34); lg.lineTo(px0 + 6, py + 48); lg.lineTo(px0 + 30, py + 40); lg.closePath(); lg.fill(); }
      }
    });
    // mid: hills, a castle, pines
    var midFn = function (x) { return H - 175 - 55 * Math.sin(TAU * 2 * x / W + 1) - 30 * Math.sin(TAU * 5 * x / W + 2); };
    layer(H - 330, 12, 0.5, function (lg) {
      var cx = W * 0.62, cb = midFn(cx) + 12; lg.fillStyle = th.mid[0];
      lg.fillRect(cx - 60, cb - 70, 120, 80); lg.fillRect(cx - 78, cb - 110, 34, 120); lg.fillRect(cx + 44, cb - 110, 34, 120); lg.fillRect(cx - 16, cb - 140, 32, 150);
      for (var b = 0; b < 3; b++) { lg.fillRect(cx - 80 + b * 13, cb - 120, 8, 12); lg.fillRect(cx + 42 + b * 13, cb - 120, 8, 12); }
      lg.beginPath(); lg.moveTo(cx - 22, cb - 140); lg.lineTo(cx, cb - 178); lg.lineTo(cx + 22, cb - 140); lg.closePath(); lg.fill();
      lg.fillStyle = themeId === 'volcano' ? '#ff9a3a' : '#ffe9a0'; lg.fillRect(cx - 5, cb - 118, 10, 16); lg.fillRect(cx - 66, cb - 84, 8, 12); lg.fillRect(cx + 58, cb - 84, 8, 12);
      for (var t = 0; t < 14; t++) { var tx = 30 + R() * (W - 60); if (Math.abs(tx - cx) < 110) continue; pine(lg, tx, midFn(tx) + 6, 46 + R() * 34, th.mid[0]); }
      ridge(lg, W, H, H - 260, midFn, th.mid);
    });
    // near: dark hill with tall pines
    var nearFn = function (x) { return H - 92 - 38 * Math.sin(TAU * x / W + 4) - 20 * Math.sin(TAU * 3 * x / W + 1); };
    layer(H - 290, 26, 1, function (lg) {
      for (var t = 0; t < 11; t++) { var tx = 50 + R() * (W - 100); pine(lg, tx, nearFn(tx) + 8, 80 + R() * 70, th.near[0]); }
      ridge(lg, W, H, H - 150, nearFn, th.near);
    });
    // cloud sprites
    for (i = 0; i < 3; i++) {
      var cc = makeCanvas(320 * px, 150 * px), cg = cc.getContext('2d'); cg.scale(px, px); cg.beginPath(); cg.rect(0, 0, 320, 106); cg.clip(); cg.fillStyle = th.cloud; cg.beginPath();
      var n = 5 + i;
      for (var k = 0; k < n; k++) { var bx = 60 + (200 / (n - 1)) * k, br = 30 + R() * 26, by = 86 - R() * 26; cg.moveTo(bx + br, by); cg.arc(bx, by, br, 0, TAU); }
      cg.fill();
      bg.clouds.push(cc);
    }
    return bg;
  };
})();
