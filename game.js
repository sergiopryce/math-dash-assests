(() => {
  'use strict';

  // ---------- Setup ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  const playerImg = new Image();
  playerImg.src = 'assets/player.png';

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
  let best = Number(localStorage.getItem(BEST_KEY) || 0);

  let state = 'menu'; // menu | play | over
  let objects, particles, player, speed, distance, starCount, spawnTimer, time, shake, stripeOffset;

  function reset() {
    objects = [];
    particles = [];
    player = { lane: 0, x: 0, tilt: 0, hop: 0 };
    speed = 14;          // world units / second
    distance = 0;
    starCount = 0;
    spawnTimer = 0.6;
    time = 0;
    shake = 0;
    stripeOffset = 0;
  }
  reset();

  const score = () => Math.floor(distance) + starCount * 25;

  // ---------- Spawning ----------
  const SYMBOLS = ['+', '−', '×', '÷', '='];
  const COLORS = ['#ff4d6d', '#3aa0ff', '#7b5cff', '#2ec4b6', '#ff7b00'];

  function spawnRow() {
    // Block 1 or 2 lanes, always leave at least one open.
    const blocked = Math.random() < Math.min(0.15 + time * 0.012, 0.55) ? 2 : 1;
    const lanes = LANES.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < blocked; i++) {
      const kind = Math.random() < 0.5 ? 'spike' : 'block';
      const k = Math.floor(Math.random() * SYMBOLS.length);
      objects.push({
        type: kind, lane: lanes[i], z: FAR_Z,
        spin: Math.random() * Math.PI * 2,
        symbol: SYMBOLS[k], color: COLORS[k],
      });
    }
    // Sometimes a star in a free lane
    if (Math.random() < 0.45) {
      objects.push({ type: 'star', lane: lanes[blocked], z: FAR_Z + 2, spin: 0 });
    }
  }

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
    $('over').classList.add('hidden');
    $('hud').classList.remove('hidden');
  }

  function gameOver() {
    state = 'over';
    shake = 0.4;
    if (navigator.vibrate) navigator.vibrate(200);
    const s = score();
    if (s > best) {
      best = s;
      localStorage.setItem(BEST_KEY, String(best));
    }
    $('finalScore').textContent = s;
    $('bestOver').textContent = best;
    $('bestMenu').textContent = best;
    setTimeout(() => {
      $('hud').classList.add('hidden');
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
    player.hop = Math.max(0, player.hop - dt * 5);

    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
    shake = Math.max(0, shake - dt);

    if (state !== 'play') {
      stripeOffset = (stripeOffset + dt * 6) % 4;
      return;
    }

    time += dt;
    speed = Math.min(14 + time * 0.45, 42);
    distance += speed * dt * 0.5;
    stripeOffset = (stripeOffset + speed * dt) % 4;

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnRow();
      // rows get closer together as speed rises, but never impossible
      spawnTimer = Math.max(0.45, 1.25 - time * 0.012);
    }

    for (const o of objects) {
      o.z -= speed * dt;
      o.spin += dt * (o.type === 'star' ? 3 : 2);

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
          gameOver();
          return;
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

    // Road
    const farL = project(-1.6, FAR_Z), farR = project(1.6, FAR_Z);
    const nearL = project(-1.6, -3), nearR = project(1.6, -3);
    ctx.fillStyle = '#3b3285';
    ctx.beginPath();
    ctx.moveTo(farL.x, farL.y); ctx.lineTo(farR.x, farR.y);
    ctx.lineTo(nearR.x, nearR.y); ctx.lineTo(nearL.x, nearL.y);
    ctx.closePath();
    ctx.fill();

    // Moving dashes between lanes
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const lx of [-0.5, 0.5]) {
      for (let z = -stripeOffset + FAR_Z; z > -3; z -= 4) {
        const a = project(lx, z), b = project(lx, z - 1.6);
        const w = 4 * a.s, w2 = 4 * b.s;
        ctx.beginPath();
        ctx.moveTo(a.x - w, a.y); ctx.lineTo(a.x + w, a.y);
        ctx.lineTo(b.x + w2, b.y); ctx.lineTo(b.x - w2, b.y);
        ctx.fill();
      }
    }
    // Road edges
    ctx.strokeStyle = '#ff9a1f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(farL.x, farL.y); ctx.lineTo(nearL.x, nearL.y);
    ctx.moveTo(farR.x, farR.y); ctx.lineTo(nearR.x, nearR.y);
    ctx.stroke();
  }

  function drawShadow(x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawObject(o) {
    const p = project(o.lane, o.z);
    const size = laneW() * 0.55 * p.s;
    const fade = Math.min(1, (FAR_Z - o.z) / 6); // fade in from horizon
    ctx.globalAlpha = Math.max(0, fade);
    drawShadow(p.x, p.y, size * 0.5);

    const cy = p.y - size * 0.75; // hover above the road
    ctx.save();
    ctx.translate(p.x, cy);

    if (o.type === 'star') {
      ctx.rotate(Math.sin(o.spin) * 0.3);
      starPath(size * 0.45, size * 0.2);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.strokeStyle = '#e09b00';
      ctx.stroke();
    } else if (o.type === 'spike') {
      ctx.rotate(o.spin);
      const r = size * 0.5;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = i % 2 ? r * 0.68 : r;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.lineWidth = Math.max(1, size * 0.04);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
      ctx.rotate(-o.spin);
      symbol(o.symbol, size * 0.42);
    } else {
      ctx.rotate(Math.sin(o.spin) * 0.25);
      const s = size;
      roundRect(-s / 2, -s / 2, s, s, s * 0.2);
      ctx.fillStyle = o.color;
      ctx.fill();
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
      symbol(o.symbol, s * 0.62);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function symbol(ch, px) {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${px}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, 0, px * 0.05);
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

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPlayer() {
    const p = project(player.x, 0);
    const size = laneW() * 0.85;
    const run = state === 'play' ? Math.sin(time * 18) : Math.sin(performance.now() / 160);
    const bob = Math.abs(run) * size * 0.06 + player.hop * size * 0.12;
    drawShadow(p.x, p.y, size * 0.38 * (1 - bob / size));

    if (!playerImg.complete || !playerImg.naturalWidth) return;
    const h = size * (playerImg.naturalHeight / playerImg.naturalWidth);
    ctx.save();
    ctx.translate(p.x, p.y - bob);
    ctx.rotate(player.tilt + run * 0.04);
    if (state === 'over') ctx.globalAlpha = 0.6;
    ctx.drawImage(playerImg, -size / 2, -h, size, h);
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

  // Don't run the clock while the app is in the background
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
})();
