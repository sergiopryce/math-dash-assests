// Menus and screens: main menu, shop, missions, settings, pause, game over.
(() => {
  'use strict';

  const S = MD.save.data;
  const $ = (id) => document.getElementById(id);
  const screens = ['menu', 'shop', 'missions', 'settings', 'pause', 'over'];
  const click = () => MD.audio.play('click');

  function show(id) {
    for (const s of screens) $(s).classList.toggle('hidden', s !== id);
    const playing = id === null;
    $('hud').classList.toggle('hidden', !playing && id !== 'pause');
    $('pauseBtn').classList.toggle('hidden', !playing);
    if (id === 'menu') renderMenu();
    if (id === 'shop') renderShop();
    if (id === 'missions') renderMissions();
    if (id === 'settings') renderSettings();
  }

  // ---------- Main menu ----------
  function renderMenu() {
    $('menuStars').textContent = '★ ' + S.stars;
    $('menuBest').textContent = S.best ? `Best: ${S.best} · Wave ${S.bestWave}` : 'Memes incoming! Swipe or tap to dodge.';
    $('missionDot').classList.add('hidden');
  }

  $('play').addEventListener('click', () => { click(); MD.game.start(); });
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { click(); show(b.dataset.open); }));
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { click(); show('menu'); }));

  // ---------- Shop ----------
  let tab = 'upgrades';
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    click();
    tab = b.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
    renderShop();
  }));

  function buy(price) {
    if (S.stars < price) { MD.audio.play('nope'); return false; }
    S.stars -= price;
    MD.audio.play('buy');
    return true;
  }

  function renderShop() {
    $('shopStars').textContent = '★ ' + S.stars;
    const list = $('shopList');
    list.innerHTML = '';
    if (tab === 'upgrades') {
      for (const u of MD.UPGRADES) {
        const lvl = S.upgrades[u.id] || 0;
        const maxed = lvl >= u.max;
        const price = maxed ? 0 : (u.costs || MD.UPGRADE_COSTS)[lvl];
        const pips = u.max > 1 ? `<div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>` : '';
        list.appendChild(item(u.icon, u.name, u.info(lvl), pips,
          maxed ? 'MAX' : `★ ${price}`, !maxed && S.stars >= price, maxed, () => {
            if (maxed || !buy(price)) return;
            S.upgrades[u.id] = lvl + 1;
            MD.save.write();
            renderShop();
          }));
      }
    } else {
      const isSkin = tab === 'skins';
      const items = isSkin ? MD.SKINS : MD.HATS;
      const owned = isSkin ? S.owned.skins : S.owned.hats;
      for (const it of items) {
        const has = owned.includes(it.id);
        const equipped = (isSkin ? S.equip.skin : S.equip.hat) === it.id;
        const icon = isSkin ? `<span class="swatch" style="background:${it.rainbow ? 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' : it.c[1]}"></span>` : (it.e || '🚫');
        const label = equipped ? 'Wearing' : has ? 'Wear' : `★ ${it.price}`;
        list.appendChild(item(icon, it.name, '', '', label, has || S.stars >= it.price, equipped, () => {
          if (equipped) return;
          if (!has) {
            if (!buy(it.price)) return;
            owned.push(it.id);
          } else click();
          if (isSkin) S.equip.skin = it.id; else S.equip.hat = it.id;
          MD.save.write();
          renderShop();
        }));
      }
    }
  }

  function item(icon, name, info, extra, btnLabel, affordable, disabled, onBuy) {
    const row = document.createElement('div');
    row.className = 'row item';
    row.innerHTML = `<div class="ic">${icon}</div><div class="txt"><b>${name}</b>${info ? `<small>${info}</small>` : ''}${extra}</div>`;
    const b = document.createElement('button');
    b.className = 'buy' + (disabled ? ' done' : affordable ? '' : ' poor');
    b.textContent = btnLabel;
    b.addEventListener('click', onBuy);
    row.appendChild(b);
    return row;
  }

  // ---------- Missions ----------
  function missionRow(m, justDone) {
    const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
    const row = document.createElement('div');
    row.className = 'row mission' + (m.done || justDone ? ' complete' : '');
    row.innerHTML = `<div class="txt"><b>${MD.missions.text(m)}</b>
      <div class="bar"><i style="width:${m.done || justDone ? 100 : pct}%"></i></div>
      <small>${m.done || justDone ? 'Done!' : `${Math.floor(m.progress)} / ${m.target}`}</small></div>
      <div class="reward">+${m.reward}★</div>`;
    return row;
  }

  function renderMissions() {
    $('missionStars').textContent = '★ ' + S.stars;
    const list = $('missionList');
    list.innerHTML = '';
    for (const m of S.missions) list.appendChild(missionRow(m));
  }

  // ---------- Settings ----------
  function applySettings() {
    MD.audio.setSound(S.settings.sound);
    MD.audio.setMusic(S.settings.music);
  }
  function renderSettings() {
    $('setSound').checked = S.settings.sound;
    $('setMusic').checked = S.settings.music;
    $('setHaptics').checked = S.settings.haptics;
    $('statsLine').textContent = `${S.stats.runs} run${S.stats.runs === 1 ? "" : "s"} · ${S.stats.dodges} memes dodged · ${S.stats.starsTotal} stars collected`;
    resetArmed = false;
    $('resetBtn').textContent = 'Reset all progress';
  }
  for (const [id, key] of [['setSound', 'sound'], ['setMusic', 'music'], ['setHaptics', 'haptics']]) {
    $(id).addEventListener('change', (e) => {
      S.settings[key] = e.target.checked;
      MD.save.write();
      applySettings();
      click();
    });
  }
  let resetArmed = false;
  $('resetBtn').addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      $('resetBtn').textContent = 'Tap again to erase everything';
      MD.audio.play('nope');
      return;
    }
    MD.save.resetAll();
    applySettings();
    show('menu');
  });

  // ---------- In-run ----------
  let toastTimer = null;
  MD.hooks.toast = (text) => {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
  };
  MD.hooks.runStarted = () => show(null);
  MD.hooks.paused = () => show('pause');
  MD.hooks.resumed = () => show(null);

  $('pauseBtn').addEventListener('click', () => { click(); MD.game.pause(); });
  $('resume').addEventListener('click', () => { click(); MD.game.resume(); });
  $('quit').addEventListener('click', () => { click(); MD.game.quit(); });

  // ---------- Game over ----------
  MD.hooks.gameOver = (r) => {
    $('toast').classList.add('hidden');
    $('overEmoji').textContent = r.meme ? r.meme.e : '🏳️';
    $('overTitle').textContent = r.meme ? r.meme.hit : 'You bailed';
    $('finalScore').textContent = r.score;
    $('newBest').classList.toggle('hidden', !r.newBest || r.score === 0);
    $('overWave').textContent = r.wave;
    $('overStars').textContent = r.stars + (r.missionStars ? ` +${r.missionStars}` : '');
    $('overNear').textContent = r.near;
    const box = $('overMissions');
    box.innerHTML = '';
    for (const m of r.completed) box.appendChild(missionRow(m, true));
    for (const m of S.missions) if (!r.completed.includes(m)) box.appendChild(missionRow(m));
    show('over');
  };
  $('again').addEventListener('click', () => { click(); MD.game.start(); });
  $('home').addEventListener('click', () => { click(); MD.game.goMenu(); show('menu'); });

  applySettings();
  MD.audio.music(true);
  show('menu');
})();
