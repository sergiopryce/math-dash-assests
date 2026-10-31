(() => {
  'use strict';

  // ---------- Setup ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- World / perspective ----------
  const LANES = [-1, 0, 1];
  const FAR_Z = 40;     // spawn distance
  const CAM_D = 4;      // perspective strength

  // Geometry derived from screen size
  const horizonY = () => H * 0.3;
  const groundY = () => H * 0.82;          // where the player stands
  const laneW = () => Math.min(W * 0.3, 170);

  // z = 0 is the player's position, larger z is further away
  function project(lane, z) {
    const s = CAM_D / (z + CAM_D);
    return {
      x: W / 2 + lane * laneW() * s,
      y: horizonY() + (groundY() - horizonY()) * s,
      s,
    };
  }

  // ---------- State ----------
  const BEST_KEY = 'mathdash.best';
  let best = 0;
  try { best = Number(localStorage.getItem(BEST_KEY) || 0); } catch (e) {}

  let state = 'menu'; // menu | play | over
  let objects, particles, popups, player, speed, dodged, starCount, spawnTimer, time, shake;

  function reset() {
    objects = [];
    particles = [];
    popups = [];
    player = { lane: 0, x: 0, tilt: 0, hop: 0 };
    speed = 14;          // world units / second
    dodged = 0;
    starCount = 0;
    spawnTimer = 0.6;
    time = 0;
    shake = 0;
  }
  reset();

  const score = () => dodged + starCount * 5;

  // ---------- Spawning ----------
  // Meme projectiles: emoji, a trail colour, and the line shown when it gets you.
  const MEMES = [
    { e: '🩴', color: '#3aa0ff', hit: 'NOT THE CHANCLA' },
    { e: '🗿', color: '#9aa3b5', hit: 'Moai said no' },
    { e: '🦆', color: '#ffd23f', hit: 'Bonked by a duck' },
    { e: '🍌', color: '#ffe066', hit: 'Banana for scale' },
    { e: '🧻', color: '#ffffff', hit: 'Wiped out' },
    { e: '🐸', color: '#5cd65c', hit: "It's Wednesday, my dudes" },
    { e: '🥔', color: '#c9a26b', hit: 'Potato aim. Yours.' },
    { e: '💀', color: '#e6e6e6', hit: 'I am deceased' },
    { e: '🤡', color: '#ff4d6d', hit: 'Clowned' },
    { e: '🧀', color: '#ffc43d', hit: 'Cheesed' },
    { e: '🐟', color: '#4fc3f7', hit: 'Slapped by a fish' },
    { e: '🍕', color: '#ff9a1f', hit: 'Pizza delivered. To your face.' },
    { e: '🪑', color: '#b07d4f', hit: 'Chair. Thrown.' },
    { e: '🦖', color: '#66bb6a', hit: 'Rawr means goodbye' },
    { e: '🐔', color: '#ffffff', hit: 'Chicken jockey got you' },
  ];
  const DODGE_LINES = ['nope', 'ez', 'not today', 'lol', 'skill diff', 'too slow', 'missed me', 'dodged', 'bruh', 'yeet'];

  // Pre-render each emoji once so drawing it every frame is cheap.
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

  function spawnRow() {
    // Block 1 or 2 lanes, always leave at least one open.
    const blocked = Math.random() < Math.min(0.15 + time * 0.012, 0.55) ? 2 : 1;
    const lanes = LANES.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < blocked; i++) {
      const m = MEMES[Math.floor(Math.random() * MEMES.length)];
      objects.push({
        type: 'meme', lane: lanes[i], z: FAR_Z,
        spin: Math.random() * Math.PI * 2,
        spinRate: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4),
        e: m.e, color: m.color, hit: m.hit,
      });
    }
    // Sometimes a star in a free lane
    if (Math.random() < 0.45) {
      objects.push({ type: 'star', lane: lanes[blocked], z: FAR_Z + 2, spin: 0 });
    }
  }

  // ---------- Native helpers (only active inside the iOS/Android app) ----------
  const Native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
    ? window.Capacitor.Plugins : null;
  function buzz() {
    try {
      if (Native && Native.Haptics) Native.Haptics.impact({ style: 'HEAVY' });
      else if (navigator.vibrate) navigator.vibrate(200);
    } catch (e) {}
  }
  if (Native && Native.StatusBar) Native.StatusBar.hide().catch(() => {});

  // ---------- Input ----------
  function move(dir) {
    if (state !== 'play') return;
    const next = Math.max(-1, Math.min(1, player.lane + dir));
    if (next !== player.lane) {
      player.lane = next;
      player.tilt = dir * 0.35;
      player.hop = 1;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') move(-1);
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') move(1);
    else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') state === 'paused' ? resume() : pause();
    else if ((e.key === ' ' || e.key === 'Enter') && state === 'paused') resume();
    else if ((e.key === ' ' || e.key === 'Enter') && state !== 'play') start();
  });

  // Swipe or tap: a swipe uses its direction, a tap uses which half of the screen.
  let touchStart = null;
  canvas.addEventListener('pointerdown', (e) => {
    touchStart = { x: e.clientX, y: e.clientY, used: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!touchStart || touchStart.used) return;
    const dx = e.clientX - touchStart.x;
    if (Math.abs(dx) > 30) {
      move(Math.sign(dx));
      touchStart.used = true;
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (touchStart && !touchStart.used) move(e.clientX < W / 2 ? -1 : 1);
    touchStart = null;
  });
  canvas.addEventListener('pointercancel', () => { touchStart = null; });

  // ---------- Game flow ----------
  function start() {
    reset();
    state = 'play';
    $('menu').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('over').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('pauseBtn').classList.remove('hidden');
  }

  function gameOver(o) {
    $('overTitle').textContent = o ? o.hit : 'Ouch!';
    $('overEmoji').textContent = o ? o.e : '';
    state = 'over';
    shake = 0.4;
    buzz();
    const s = score();
    if (s > best) {
      best = s;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    }
    $('finalScore').textContent = s;
    $('bestOver').textContent = best;
    $('bestMenu').textContent = best;
    setTimeout(() => {
      $('hud').classList.add('hidden');
      $('pauseBtn').classList.add('hidden');
      $('over').classList.remove('hidden');
    }, 600);
  }

  $('play').addEventListener('click', start);
  $('again').addEventListener('click', start);
  $('bestMenu').textContent = best;

  function burst(x, y, color, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 220;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0.6, color });
    }
  }

  // ---------- Update ----------
  function update(dt) {
    // Player motion always animates (menu too) so it looks alive
    const targetX = player.lane;
    player.x += (targetX - player.x) * Math.min(1, dt * 14);
    player.tilt *= Math.pow(0.002, dt);
    player.hop = Math.max(0, player.hop - dt * 4);

    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const t of popups) { t.y -= 60 * dt; t.life -= dt; }
    popups = popups.filter((t) => t.life > 0);
    shake = Math.max(0, shake - dt);

    if (state !== 'play') return;

    time += dt;
    speed = Math.min(14 + time * 0.45, 42);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnRow();
      // rows get closer together as speed rises, but never impossible
      spawnTimer = Math.max(0.45, 1.25 - time * 0.012);
    }

    for (const o of objects) {
      o.z -= speed * dt;
      o.spin += dt * (o.type === 'star' ? 3 : o.spinRate);

      // Collision window right at the player
      if (!o.dead && o.z < 0.8 && o.z > -0.6 && Math.abs(o.lane - player.x) < 0.55) {
        const p = project(o.lane, 0);
        if (o.type === 'star') {
          o.dead = true;
          starCount++;
          burst(p.x, p.y - 40, '#ffd23f', 10);
        } else {
          o.dead = true;
          burst(p.x, p.y - 40, o.color, 24);
          gameOver(o);
          return;
        }
      }
    }
    for (const o of objects) {
      if (!o.dead && !o.counted && o.type !== 'star' && o.z < -0.6) {
        o.counted = true;
        dodged++;
        if (Math.random() < 0.4) {
          const pp = project(player.x, 0);
          popups.push({
            text: DODGE_LINES[Math.floor(Math.random() * DODGE_LINES.length)],
            x: pp.x + (Math.random() - 0.5) * 60, y: pp.y - laneW() * 0.9, life: 0.9,
          });
        }
      }
    }
    objects = objects.filter((o) => !o.dead && o.z > -2.5);

    $('score').textContent = score();
    $('stars').textContent = '★ ' + starCount;
  }

  // ---------- Drawing ----------
  function drawBackground() {
    const hy = horizonY();
    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, '#1a1546');
    sky.addColorStop(1, '#5b3fa8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hy + 1);

    // Distant glow
    ctx.fillStyle = 'rgba(255, 154, 31, 0.35)';
    ctx.beginPath();
    ctx.arc(W / 2, hy, Math.min(W, H) * 0.18, Math.PI, 0);
    ctx.fill();

    const ground = ctx.createLinearGradient(0, hy, 0, H);
    ground.addColorStop(0, '#2b2466');
    ground.addColorStop(1, '#4a3c9e');
    ctx.fillStyle = ground;
    ctx.fillRect(0, hy, W, H - hy);

    // Floor of the arena (static: the player stands still, objects come to you)
    const farL = project(-1.6, FAR_Z), farR = project(1.6, FAR_Z);
    const nearL = project(-1.6, -3), nearR = project(1.6, -3);
    ctx.fillStyle = '#3b3285';
    ctx.beginPath();
    ctx.moveTo(farL.x, farL.y); ctx.lineTo(farR.x, farR.y);
    ctx.lineTo(nearR.x, nearR.y); ctx.lineTo(nearL.x, nearL.y);
    ctx.closePath();
    ctx.fill();

    // Lane lines
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const lx of [-0.5, 0.5]) {
      const a = project(lx, FAR_Z), b = project(lx, -3);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.strokeStyle = '#ff9a1f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(farL.x, farL.y); ctx.lineTo(nearL.x, nearL.y);
    ctx.moveTo(farR.x, farR.y); ctx.lineTo(nearR.x, nearR.y);
    ctx.stroke();

    drawPortal();
  }

  // The launcher in the distance that throws objects at the player
  const PORTAL_H = 2.6; // height above floor, in lane widths
  function drawPortal() {
    const p = project(0, FAR_Z);
    const r = laneW() * 1.3 * p.s * 4;
    const cx = p.x, cy = p.y - PORTAL_H * laneW() * p.s;
    const pulse = 1 + Math.sin(performance.now() / 180) * 0.06;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * pulse);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.35, 'rgba(255,154,31,0.8)');
    g.addColorStop(1, 'rgba(255,77,109,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  // Where an object is on screen: it leaves the portal, spreads to its lane
  // and drops toward the player's height as it flies closer.
  function objectScreenPos(o, z) {
    const t = Math.min(1, (FAR_Z - z) / (FAR_Z * 0.55));
    const lane = o.lane * (1 - Math.pow(1 - t, 2));
    const p = project(lane, z);
    const height = 0.55 + (PORTAL_H - 0.55) * Math.max(0, z) / FAR_Z;
    return { x: p.x, y: p.y - height * laneW() * p.s, ground: p.y, s: p.s };
  }

  function drawShadow(x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawObject(o) {
    const p = objectScreenPos(o, o.z);
    const size = laneW() * 0.55 * p.s;

    // Shadow on the floor and a motion trail behind it
    drawShadow(p.x, p.ground, size * 0.45);
    const trail = o.type === 'star' ? '#ffd23f' : o.color;
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
    } else {
      ctx.rotate(o.spin);
      const d = size * 1.25;
      ctx.drawImage(emojiSprite(o.e), -d / 2, -d / 2, d, d);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
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

  // Simple round critter seen from behind, drawn with shapes.
  function drawPlayer() {
    const p = project(player.x, 0);
    const r = laneW() * 0.32;
    const t = performance.now() / 1000;
    const breathe = Math.sin(t * 4) * 0.03;
    const hop = Math.sin(player.hop * Math.PI) * r * 0.6;
    const moving = player.hop > 0;
    const step = moving ? Math.sin(t * 30) * r * 0.12 : 0;

    drawShadow(p.x, p.y, r * 0.9 * (1 - hop / (r * 3)));

    ctx.save();
    ctx.translate(p.x, p.y - hop);
    ctx.rotate(player.tilt);
    if (state === 'over') ctx.globalAlpha = 0.6;

    // Feet
    ctx.fillStyle = '#c45a12';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * r * 0.42, -r * 0.1 + (side > 0 ? step : -step), r * 0.28, r * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Arms
    ctx.fillStyle = '#e8741b';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * r * 0.95, -r * 1.05);
      ctx.rotate(side * (0.5 + Math.sin(t * 4 + side) * 0.1));
      ctx.beginPath();
      ctx.ellipse(0, r * 0.2, r * 0.17, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Body
    const by = -r * 1.1;
    const sx = 1 + breathe, sy = 1 - breathe;
    const body = ctx.createRadialGradient(-r * 0.3, by - r * 0.4, r * 0.1, 0, by, r * 1.1);
    body.addColorStop(0, '#ffb35c');
    body.addColorStop(0.6, '#ff8a1f');
    body.addColorStop(1, '#d9620f');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, by, r * sx, r * sy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#ff8a1f';
      ctx.beginPath();
      ctx.ellipse(side * r * 0.55, by - r * 0.85, r * 0.2, r * 0.3, side * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d9620f';
      ctx.beginPath();
      ctx.ellipse(side * r * 0.55, by - r * 0.82, r * 0.1, r * 0.17, side * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hair tuft on top
    ctx.strokeStyle = '#d9620f';
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const k of [-1, 0, 1]) {
      ctx.moveTo(k * r * 0.12, by - r * 0.95);
      ctx.quadraticCurveTo(k * r * 0.3, by - r * 1.35, k * r * 0.4 + r * 0.05, by - r * 1.25);
    }
    ctx.stroke();

    // Little tail
    ctx.fillStyle = '#ffd9a8';
    ctx.beginPath();
    ctx.arc(0, by + r * 0.6, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 16 * shake, (Math.random() - 0.5) * 16 * shake);
    drawBackground();

    // Far objects first, then player, then anything that has passed the player
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
    ctx.font = 'bold 24px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(20,16,56,0.8)';
    for (const t of popups) {
      ctx.globalAlpha = Math.min(1, t.life / 0.4);
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = '#fff';
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
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

  // Pause when the app goes to the background so nothing hits you while away.
  function pause() {
    if (state !== 'play') return;
    state = 'paused';
    $('pause').classList.remove('hidden');
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'play';
    last = performance.now();
    $('pause').classList.add('hidden');
  }
  $('resume').addEventListener('click', resume);
  $('pauseBtn').addEventListener('click', pause);
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (document.hidden) pause();
  });
  window.addEventListener('blur', pause);
})();
