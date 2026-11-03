// The game itself: world, memes, power-ups, the critter, and the main loop.
(() => {
  'use strict';

  const S = MD.save.data;
  const $ = (id) => document.getElementById(id);
  MD.hooks = MD.hooks || {};
  const hook = (name, ...args) => { if (MD.hooks[name]) MD.hooks[name](...args); };

  // ---------- Canvas ----------
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- World / perspective ----------
  const LANES = [-1, 0, 1];
  const FAR_Z = 40;   // spawn distance
  const CAM_D = 4;    // perspective strength
  const PORTAL_H = 2.6;

  const horizonY = () => H * 0.3;
  const groundY = () => H * 0.82;
  const laneW = () => Math.min(W * 0.3, 170);

  // z = 0 is the player, larger z is further away
  function project(lane, z) {
    const s = CAM_D / (z + CAM_D);
    return { x: W / 2 + lane * laneW() * s, y: horizonY() + (groundY() - horizonY()) * s, s };
  }

  // ---------- Themes (one per wave, blended) ----------
  const T = MD.THEMES;
  const waveDef = (n) => (n < MD.WAVES.length ? MD.WAVES[n] : MD.WAVES[3 + ((n - 3) % (MD.WAVES.length - 3))]);
  const waveTheme = (n) => (n < T.length ? T[n] : T[3 + ((n - 3) % (T.length - 3))]);
  let themeFrom = T[0], themeTo = T[0], themeMix = 1;
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function themeColor(key, alpha = 1) {
    const a = hexRgb(themeFrom[key]), b = hexRgb(themeTo[key]);
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * themeMix));
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
  }
  const themeValue = (key) => themeFrom[key] + (themeTo[key] - themeFrom[key]) * themeMix;
  function themeSnapshot() {
    const snap = {};
    for (const k of Object.keys(T[0])) {
      if (k === 'stars') snap[k] = themeValue(k);
      else snap[k] = '#' + themeColor(k).match(/\d+/g).slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('');
    }
    return snap;
  }
  const SKY_STARS = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.4, t: Math.random() * 6 }));

  // ---------- Emoji sprites (pre-rendered once) ----------
  const EMOJI_PX = 128;
  const emojiCache = new Map();
  function emojiSprite(e) {
    let c = emojiCache.get(e);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = EMOJI_PX;
      const g = c.getContext('2d');
      g.font = `${EMOJI_PX * 0.8}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(e, EMOJI_PX / 2, EMOJI_PX * 0.55);
      emojiCache.set(e, c);
    }
    return c;
  }

  // ---------- Native helpers (only inside the iOS/Android app) ----------
  const Native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? window.Capacitor.Plugins : null;
  function buzz(light) {
    if (!S.settings.haptics) return;
    try {
      if (Native && Native.Haptics) Native.Haptics.impact({ style: light ? 'LIGHT' : 'HEAVY' });
      else if (navigator.vibrate) navigator.vibrate(light ? 30 : 200);
    } catch (e) {}
  }
  if (Native && Native.StatusBar) Native.StatusBar.hide().catch(() => {});
  const sfx = (n) => MD.audio.play(n);

  // ---------- Run state ----------
  let state = 'menu'; // menu | play | paused | over
  let objects, particles, popups, player, speed, points, runStars, dodges, nearCount;
  let spawnTimer, time, shake, wave, waveTime, flash, portalFlare, fx, invuln, tutorial, completedThisRun, lastHud;

  function reset() {
    objects = [];
    particles = [];
    popups = [];
    player = { lane: 0, x: 0, tilt: 0, hop: 0 };
    speed = 15;
    points = 0;
    runStars = 0;
    dodges = 0;
    nearCount = 0;
    spawnTimer = 0.8;
    time = 0;
    shake = 0;
    wave = 0;
    waveTime = 0;
    flash = 0;
    portalFlare = 0;
    fx = { shield: 0, slowmo: 0, magnet: 0, double: 0 };
    invuln = 0;
    tutorial = null;
    completedThisRun = [];
    lastHud = '';
    themeFrom = themeTo = T[0];
    themeMix = 1;
  }
  reset();

  const powerDuration = (k) => MD.POWERUPS[k].base + MD.POWERUPS[k].per * (S.upgrades[k] || 0);

  function addPoints(n) {
    points += n;
    MD.missions.track('score', points);
  }

  function popup(text, opts = {}) {
    const pp = project(player.x, 0);
    popups.push({
      text, x: pp.x + (opts.jitter === false ? 0 : (Math.random() - 0.5) * 60),
      y: pp.y - laneW() * (opts.high ? 1.25 : 0.9),
      life: opts.life || 0.9, max: opts.life || 0.9, color: opts.color || '#fff', size: opts.size || 24,
    });
  }

  function burst(x, y, color, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 220;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0.6, color });
    }
  }

  // ---------- Spawning ----------
  function spawnRow() {
    const def = waveDef(wave);
    const learning = tutorial && !tutorial.done;
    const twoChance = learning ? 0 : Math.min(0.15 + wave * 0.1 + waveTime * 0.004, 0.6);
    const blocked = Math.random() < twoChance ? 2 : 1;
    const lanes = LANES.slice().sort(() => Math.random() - 0.5);

    for (let i = 0; i < blocked; i++) {
      // Each wave leans on a couple of featured memes
      const pool = def.pool && Math.random() < 0.6 ? MD.MEMES.filter((m) => def.pool.includes(m.e)) : MD.MEMES;
      const m = pool[Math.floor(Math.random() * pool.length)];
      const move = !learning && def.moves.length && Math.random() < 0.55 ? def.moves[Math.floor(Math.random() * def.moves.length)] : 'straight';
      const o = {
        type: 'meme', lane: lanes[i], z: FAR_Z, move,
        spin: Math.random() * Math.PI * 2,
        spinRate: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4),
        phase: Math.random() * Math.PI * 2,
        e: m.e, color: m.color, hit: m.hit,
      };
      // A switcher starts in a neighbouring lane and slides into its real lane
      // mid-flight; its final lane is still one of this row's blocked lanes.
      if (move === 'switch') {
        const opts = [o.lane - 1, o.lane + 1].filter((l) => l >= -1 && l <= 1);
        o.fromLane = opts[Math.floor(Math.random() * opts.length)];
      }
      objects.push(o);
    }

    // Free lanes get a star and sometimes a power-up
    const free = lanes.slice(blocked);
    const luck = 1 + 0.2 * (S.upgrades.luck || 0);
    const powerOnField = objects.some((o) => o.type === 'power');
    if (!learning && !powerOnField && time > 4 && Math.random() < 0.075 * luck) {
      const kinds = Object.keys(MD.POWERUPS).filter((k) => fx[k] <= 0);
      if (kinds.length) {
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        objects.push({ type: 'power', kind, lane: free.pop(), z: FAR_Z + 3, spin: 0, phase: Math.random() * 6 });
      }
    }
    if (free.length && Math.random() < 0.5) {
      objects.push({ type: 'star', lane: free[0], z: FAR_Z + 2, spin: 0 });
    }
  }

  // ---------- Input ----------
  function move(dir) {
    if (state !== 'play') return;
    const next = Math.max(-1, Math.min(1, player.lane + dir));
    if (next === player.lane) return;
    // A meme right on top of the lane you just left becomes a "close call" if you make it
    for (const o of objects) {
      if (o.type === 'meme' && o.z > 1.2 && o.z < 6 && Math.abs(laneAt(o, o.z) - player.lane) < 0.3) o.close = true;
    }
    player.lane = next;
    player.tilt = dir * 0.35;
    player.hop = 1;
    sfx('move');
    if (tutorial && !tutorial.done) tutorial.moves++;
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') move(-1);
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') move(1);
    else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') state === 'paused' ? resume() : pause();
  });

  let touchStart = null;
  canvas.addEventListener('pointerdown', (e) => { touchStart = { x: e.clientX, used: false }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!touchStart || touchStart.used) return;
    const dx = e.clientX - touchStart.x;
    if (Math.abs(dx) > 30) { move(Math.sign(dx)); touchStart.used = true; }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (touchStart && !touchStart.used) move(e.clientX < W / 2 ? -1 : 1);
    touchStart = null;
  });
  canvas.addEventListener('pointercancel', () => { touchStart = null; });

  // ---------- Flow ----------
  function start() {
    reset();
    state = 'play';
    if (!S.tutorialDone) tutorial = { moves: 0, dodges: 0, done: false };
    if (S.upgrades.headstart) fx.shield = powerDuration('shield');
    MD.missions.startRun((m) => {
      completedThisRun.push(m);
      sfx('mission');
      hook('toast', `🎯 ${MD.missions.text(m)}  +${m.reward}★`);
    });
    MD.missions.track('wave', 1);
    MD.audio.setTempo(0, true);
    hook('runStarted');
  }

  function startWave(n) {
    themeFrom = themeSnapshot();
    themeTo = waveTheme(n);
    themeMix = 0;
    wave = n;
    waveTime = 0;
    flash = 0.35;
    portalFlare = 1;
    spawnTimer = Math.max(spawnTimer, 1.4); // a short breather so the shift is noticeable
    buzz(true);
    sfx('wave');
    MD.audio.setTempo(n, true);
    MD.missions.track('wave', n + 1);
  }

  function activate(kind) {
    fx[kind] = powerDuration(kind);
    MD.missions.track('powers', 1);
    sfx('power');
    buzz(true);
    popup(`${MD.POWERUPS[kind].e} ${MD.POWERUPS[kind].name.toUpperCase()}!`, { color: MD.POWERUPS[kind].color, size: 26, jitter: false, high: true, life: 1.2 });
  }

  function endRun(o, quit) {
    state = 'over';
    MD.audio.setTempo(0, false);
    if (!quit) { shake = 0.4; buzz(); sfx('hit'); }

    const d = S;
    const newBest = points > d.best;
    d.best = Math.max(d.best, points);
    d.bestWave = Math.max(d.bestWave, wave + 1);
    d.stars += runStars;
    d.stats.runs++;
    d.stats.dodges += dodges;
    d.stats.starsTotal += runStars;
    MD.missions.track('runs', 1);
    MD.missions.endRun();
    const summary = {
      meme: o, quit, score: points, newBest, wave: wave + 1, stars: runStars, dodges, near: nearCount,
      completed: completedThisRun.slice(),
      missionStars: completedThisRun.reduce((a, m) => a + m.reward, 0),
    };
    MD.missions.fill();
    MD.save.write();
    setTimeout(() => hook('gameOver', summary), quit ? 0 : 650);
  }

  function pause() {
    if (state !== 'play') return;
    state = 'paused';
    MD.audio.duck(true);
    hook('paused');
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'play';
    last = performance.now();
    MD.audio.duck(false);
    hook('resumed');
  }
  function quit() {
    if (state !== 'paused') return;
    MD.audio.duck(false);
    endRun(null, true);
  }

  // ---------- Movement helpers ----------
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // Lane at distance z. Switchers slide between z=24 and z=15; zig-zaggers weave
  // until z=10. Both settle well before reaching the player.
  function laneAt(o, z) {
    let lane = o.lane;
    if (o.move === 'switch') lane = o.fromLane + (o.lane - o.fromLane) * smooth(24, 15, z);
    if (o.move === 'zigzag') lane += Math.sin(z * 0.45 + o.phase) * 0.7 * smooth(10, 20, z);
    return lane;
  }

  function objectScreenPos(o, z) {
    const t = Math.min(1, (FAR_Z - z) / (FAR_Z * 0.55));
    const lane = laneAt(o, z) * (1 - Math.pow(1 - t, 2));
    const p = project(lane, z);
    let height = 0.55 + (PORTAL_H - 0.55) * Math.max(0, z) / FAR_Z;
    if (o.move === 'bounce') height += Math.abs(Math.sin(z * 0.35 + o.phase)) * 1.3 * smooth(3, 12, z);
    if (o.type === 'power') height += Math.sin(z * 0.6 + o.phase) * 0.15;
    return { x: p.x, y: p.y - height * laneW() * p.s, ground: p.y, s: p.s };
  }

  // ---------- Update ----------
  function update(dt) {
    player.x += (player.lane - player.x) * Math.min(1, dt * 14);
    player.tilt *= Math.pow(0.002, dt);
    player.hop = Math.max(0, player.hop - dt * 4);

    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    for (const t of popups) { t.y -= 60 * dt; t.life -= dt; }
    popups = popups.filter((t) => t.life > 0);
    flash = Math.max(0, flash - dt * 1.5);
    portalFlare = Math.max(0, portalFlare - dt * 0.8);
    shake = Math.max(0, shake - dt);
    if (themeMix < 1) themeMix = Math.min(1, themeMix + dt / 2.5);

    if (state !== 'play') return;

    for (const k in fx) fx[k] = Math.max(0, fx[k] - dt);
    invuln = Math.max(0, invuln - dt);
    const wdt = dt * (fx.slowmo > 0 ? 0.5 : 1); // slow-mo slows the world, not you

    time += wdt;
    if (!tutorial || tutorial.done) waveTime += wdt;
    if (waveTime >= MD.WAVE_LEN) startWave(wave + 1);
    speed = Math.min(15 + wave * 3.5 + waveTime * 0.12, 46);

    spawnTimer -= wdt;
    if (spawnTimer <= 0) {
      spawnRow();
      spawnTimer = tutorial && !tutorial.done ? 1.5 : Math.max(0.45, 1.2 - wave * 0.12 - waveTime * 0.004);
    }

    for (const o of objects) {
      o.z -= speed * wdt;
      o.spin += wdt * (o.type === 'meme' ? o.spinRate : 3);
      // Magnet: pull nearby stars into your lane
      if (o.type === 'star' && fx.magnet > 0 && o.z < 22) o.lane += (player.x - o.lane) * Math.min(1, dt * 6);

      if (o.dead || o.z > 0.8 || o.z < -0.6 || Math.abs(laneAt(o, o.z) - player.x) >= 0.55) continue;
      const p = project(player.x, 0);
      if (o.type === 'star') {
        o.dead = true;
        const gain = fx.double > 0 ? 2 : 1;
        runStars += gain;
        addPoints(5 * gain);
        MD.missions.track('stars', gain);
        sfx('star');
        burst(p.x, p.y - 40, '#ffd23f', 10);
        if (gain > 1) popup('+2★', { color: '#ffd23f' });
      } else if (o.type === 'power') {
        o.dead = true;
        activate(o.kind);
        burst(p.x, p.y - 40, MD.POWERUPS[o.kind].color, 16);
      } else if (invuln > 0) {
        // just survived a shield break; let the rest of this row pass through
      } else if (fx.shield > 0) {
        o.dead = true;
        fx.shield = 0;
        invuln = 0.8;
        shake = 0.25;
        sfx('shieldBreak');
        buzz();
        burst(p.x, p.y - 40, '#4fc3f7', 24);
        popup('SHIELD SAVED YOU', { color: '#4fc3f7', size: 26, jitter: false, high: true, life: 1.2 });
        MD.missions.track('saves', 1);
      } else {
        o.dead = true;
        burst(p.x, p.y - 40, o.color, 24);
        endRun(o, false);
        return;
      }
    }

    for (const o of objects) {
      if (o.dead || o.counted || o.type !== 'meme' || o.z > -0.6) continue;
      o.counted = true;
      dodges++;
      addPoints(1 + wave); // later waves are worth more
      MD.missions.track('dodges', 1);
      MD.missions.track('meme', 1, o.e);
      if (tutorial && !tutorial.done) tutorial.dodges++;
      if (o.close) {
        nearCount++;
        addPoints(10);
        MD.missions.track('near', 1);
        sfx('near');
        buzz(true);
        popup(MD.NEAR_LINES[Math.floor(Math.random() * MD.NEAR_LINES.length)] + ' +10', { color: '#ff9a1f', size: 28 });
      } else if (Math.random() < 0.25) {
        popup(MD.DODGE_LINES[Math.floor(Math.random() * MD.DODGE_LINES.length)]);
      }
    }
    objects = objects.filter((o) => !o.dead && o.z > -2.5);

    if (tutorial && !tutorial.done && tutorial.moves >= 2 && tutorial.dodges >= 6) {
      tutorial.done = true;
      S.tutorialDone = true;
      MD.save.write();
      popup('YOU GOT IT!', { color: '#ffd23f', size: 30, jitter: false, high: true, life: 1.4 });
    }

    // HUD (only touch the DOM when something changed)
    const active = Object.keys(fx).filter((k) => fx[k] > 0);
    const hud = `${points}|${runStars}|${active.map((k) => k + Math.ceil(fx[k] * 4)).join()}`;
    if (hud !== lastHud) {
      lastHud = hud;
      $('score').textContent = points;
      $('stars').textContent = '★ ' + runStars;
      $('powers').innerHTML = active.map((k) =>
        `<div class="pw"><span>${MD.POWERUPS[k].e}</span><i style="width:${Math.round((fx[k] / powerDuration(k)) * 100)}%;background:${MD.POWERUPS[k].color}"></i></div>`).join('');
    }
  }

  // ---------- Drawing ----------
  function drawBackground() {
    const hy = horizonY();
    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, themeColor('skyTop'));
    sky.addColorStop(1, themeColor('skyBot'));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hy + 1);

    const starAlpha = themeValue('stars');
    if (starAlpha > 0.01) {
      const t = performance.now() / 1000;
      ctx.fillStyle = '#fff';
      for (const st of SKY_STARS) {
        ctx.globalAlpha = starAlpha * (0.5 + 0.5 * Math.sin(t * 2 + st.t));
        ctx.beginPath();
        ctx.arc(st.x * W, st.y * hy * 0.95, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = themeColor('sun', 0.35);
    ctx.beginPath();
    ctx.arc(W / 2, hy, Math.min(W, H) * 0.18, Math.PI, 0);
    ctx.fill();

    const ground = ctx.createLinearGradient(0, hy, 0, H);
    ground.addColorStop(0, themeColor('groundTop'));
    ground.addColorStop(1, themeColor('groundBot'));
    ctx.fillStyle = ground;
    ctx.fillRect(0, hy, W, H - hy);

    const farL = project(-1.6, FAR_Z), farR = project(1.6, FAR_Z);
    const nearL = project(-1.6, -3), nearR = project(1.6, -3);
    ctx.fillStyle = themeColor('floor');
    ctx.beginPath();
    ctx.moveTo(farL.x, farL.y); ctx.lineTo(farR.x, farR.y);
    ctx.lineTo(nearR.x, nearR.y); ctx.lineTo(nearL.x, nearL.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const lx of [-0.5, 0.5]) {
      const a = project(lx, FAR_Z), b = project(lx, -3);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.strokeStyle = themeColor('edge');
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(farL.x, farL.y); ctx.lineTo(nearL.x, nearL.y);
    ctx.moveTo(farR.x, farR.y); ctx.lineTo(nearR.x, nearR.y);
    ctx.stroke();

    // The portal that throws everything at you
    const p = project(0, FAR_Z);
    const r = laneW() * 1.3 * p.s * 4;
    const cx = p.x, cy = p.y - PORTAL_H * laneW() * p.s;
    const pulse = 1 + Math.sin(performance.now() / 180) * 0.06 + portalFlare * 1.2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * pulse);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, themeColor('portal', 0.8));
    g.addColorStop(1, themeColor('portal', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawShadow(x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function starPath(ro, ri) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? ri : ro;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function drawObject(o) {
    const p = objectScreenPos(o, o.z);
    const size = laneW() * 0.55 * p.s;
    drawShadow(p.x, p.ground, size * 0.45);

    const trail = o.type === 'star' ? '#ffd23f' : o.type === 'power' ? MD.POWERUPS[o.kind].color : o.color;
    for (let i = 3; i >= 1; i--) {
      const q = objectScreenPos(o, o.z + i * 1.2);
      ctx.globalAlpha = 0.1 * (4 - i);
      ctx.fillStyle = trail;
      ctx.beginPath();
      ctx.arc(q.x, q.y, laneW() * 0.13 * q.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(p.x, p.y);
    if (o.type === 'star') {
      ctx.rotate(Math.sin(o.spin) * 0.3);
      starPath(size * 0.45, size * 0.2);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.strokeStyle = '#e09b00';
      ctx.stroke();
    } else if (o.type === 'power') {
      // Glowing bubble with the power-up's icon
      const col = MD.POWERUPS[o.kind].color;
      const rr = size * 0.62 * (1 + Math.sin(o.spin * 2) * 0.06);
      const g = ctx.createRadialGradient(0, 0, rr * 0.2, 0, 0, rr);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.6, col + 'aa');
      g.addColorStop(1, col + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, rr * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      const d = size * 0.85;
      ctx.drawImage(emojiSprite(MD.POWERUPS[o.kind].e), -d / 2, -d / 2, d, d);
    } else {
      ctx.rotate(o.spin);
      const d = size * 1.25;
      ctx.drawImage(emojiSprite(o.e), -d / 2, -d / 2, d, d);
    }
    ctx.restore();
  }

  function skinColors() {
    const skin = MD.SKINS.find((s) => s.id === S.equip.skin) || MD.SKINS[0];
    if (!skin.rainbow) return skin.c;
    const h = (performance.now() / 15) % 360;
    return [`hsl(${h},100%,78%)`, `hsl(${h},95%,62%)`, `hsl(${h},80%,46%)`, `hsl(${h},75%,38%)`, '#ffffff'];
  }

  // The critter, seen from behind, drawn with shapes.
  function drawPlayer() {
    const p = project(player.x, 0);
    const r = laneW() * 0.32;
    const t = performance.now() / 1000;
    const [cLight, cBody, cShade, cFeet, cTail] = skinColors();
    const breathe = Math.sin(t * 4) * 0.03;
    const hop = Math.sin(player.hop * Math.PI) * r * 0.6;
    const step = player.hop > 0 ? Math.sin(t * 30) * r * 0.12 : 0;

    drawShadow(p.x, p.y, r * 0.9 * (1 - hop / (r * 3)));

    ctx.save();
    ctx.translate(p.x, p.y - hop);
    ctx.rotate(player.tilt);
    if (state === 'over') ctx.globalAlpha = 0.6;
    if (invuln > 0 && Math.floor(t * 20) % 2) ctx.globalAlpha = 0.5;

    ctx.fillStyle = cFeet;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * r * 0.42, -r * 0.1 + (side > 0 ? step : -step), r * 0.28, r * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = cBody;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * r * 0.95, -r * 1.05);
      ctx.rotate(side * (0.5 + Math.sin(t * 4 + side) * 0.1));
      ctx.beginPath();
      ctx.ellipse(0, r * 0.2, r * 0.17, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const by = -r * 1.1;
    const body = ctx.createRadialGradient(-r * 0.3, by - r * 0.4, r * 0.1, 0, by, r * 1.1);
    body.addColorStop(0, cLight);
    body.addColorStop(0.6, cBody);
    body.addColorStop(1, cShade);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, by, r * (1 + breathe), r * (1 - breathe), 0, 0, Math.PI * 2);
    ctx.fill();

    for (const side of [-1, 1]) {
      ctx.fillStyle = cBody;
      ctx.beginPath();
      ctx.ellipse(side * r * 0.55, by - r * 0.85, r * 0.2, r * 0.3, side * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cShade;
      ctx.beginPath();
      ctx.ellipse(side * r * 0.55, by - r * 0.82, r * 0.1, r * 0.17, side * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    const hat = MD.HATS.find((h) => h.id === S.equip.hat);
    if (hat && hat.e) {
      const d = r * 1.05;
      ctx.save();
      ctx.translate(0, by - r * 1.05);
      ctx.rotate(Math.sin(t * 3) * 0.05);
      ctx.drawImage(emojiSprite(hat.e), -d / 2, -d / 2, d, d);
      ctx.restore();
    } else {
      ctx.strokeStyle = cShade;
      ctx.lineWidth = Math.max(2, r * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const k of [-1, 0, 1]) {
        ctx.moveTo(k * r * 0.12, by - r * 0.95);
        ctx.quadraticCurveTo(k * r * 0.3, by - r * 1.35, k * r * 0.4 + r * 0.05, by - r * 1.25);
      }
      ctx.stroke();
    }

    ctx.fillStyle = cTail;
    ctx.beginPath();
    ctx.arc(0, by + r * 0.6, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // Shield bubble (flickers when about to run out)
    if (fx.shield > 0 && (fx.shield > 1.5 || Math.floor(t * 10) % 2)) {
      const sr = r * 1.55;
      const g = ctx.createRadialGradient(-sr * 0.3, by - sr * 0.4, sr * 0.1, 0, by, sr);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.7, 'rgba(79,195,247,0.15)');
      g.addColorStop(1, 'rgba(79,195,247,0.55)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, by + r * 0.1, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawTutorial() {
    if (!tutorial || tutorial.done || state !== 'play') return;
    const t = performance.now() / 1000;
    const y = H * 0.6;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(20,16,56,0.85)';
    ctx.fillStyle = '#fff';
    const msg = tutorial.moves < 2 ? 'Swipe or tap left / right' : 'Dodge the memes!';
    ctx.strokeText(msg, W / 2, y);
    ctx.fillText(msg, W / 2, y);
    if (tutorial.moves < 2) {
      const d = 54;
      ctx.drawImage(emojiSprite('👆'), W / 2 + Math.sin(t * 3) * 70 - d / 2, y + 22, d, d);
    }
    ctx.restore();
  }

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 16 * shake, (Math.random() - 0.5) * 16 * shake);
    drawBackground();

    const sorted = objects.slice().sort((a, b) => b.z - a.z);
    for (const o of sorted) if (o.z >= 0) drawObject(o);
    drawPlayer();
    for (const o of sorted) if (o.z < 0) drawObject(o);

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.6);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(20,16,56,0.8)';
    for (const t of popups) {
      ctx.font = `bold ${t.size}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.globalAlpha = Math.min(1, t.life / 0.4);
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Slow-mo tints the edges of the screen
    if (state === 'play' && fx.slowmo > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(179,136,255,0)');
      g.addColorStop(1, `rgba(179,136,255,${Math.min(0.45, fx.slowmo * 0.3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (flash > 0) {
      ctx.fillStyle = themeColor('sun', flash);
      ctx.fillRect(0, 0, W, H);
    }
    drawTutorial();
  }

  // ---------- Loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (document.hidden) pause();
  });
  window.addEventListener('blur', pause);

  MD.game = {
    start, pause, resume, quit,
    get state() { return state; },
    goMenu() { state = 'menu'; reset(); },
  };
})();
