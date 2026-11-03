// Player profile (stars, unlocks, upgrades, missions, settings), saved on the device.
window.MD = window.MD || {};

MD.save = (() => {
  const KEY = 'mathdash.save.v1';

  const defaults = () => ({
    stars: 0,
    best: 0,
    bestWave: 0,
    stats: { runs: 0, dodges: 0, starsTotal: 0 },
    upgrades: { shield: 0, slowmo: 0, magnet: 0, double: 0, luck: 0, headstart: 0 },
    owned: { skins: ['orange'], hats: ['none'] },
    equip: { skin: 'orange', hat: 'none' },
    missions: [],
    missionTiers: {},
    settings: { sound: true, music: true, haptics: true },
    tutorialDone: false,
  });

  let data = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const d = defaults();
      data = Object.assign(d, raw);
      for (const k of ['stats', 'upgrades', 'owned', 'equip', 'settings']) data[k] = Object.assign(d[k], raw[k] || {});
      if (!Array.isArray(data.missions)) data.missions = [];
    } else {
      // Carry over the best score from the first versions of the game
      const oldBest = Number(localStorage.getItem('mathdash.best') || 0);
      if (oldBest) data.best = oldBest;
    }
  } catch (e) {}

  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  function resetAll() {
    const fresh = defaults();
    fresh.tutorialDone = true;
    for (const k of Object.keys(data)) delete data[k];
    Object.assign(data, fresh);
    MD.missions.fill();
    write();
  }

  return { data, write, resetAll };
})();

// ---------- Missions ----------
MD.missions = (() => {
  const S = () => MD.save.data;
  let runStats = null;
  let onComplete = null;

  function typeOf(m) { return MD.MISSION_TYPES.find((t) => t.id === m.type); }

  function make(excludeIds) {
    const choices = MD.MISSION_TYPES.filter((t) => !excludeIds.includes(t.id));
    const t = choices[Math.floor(Math.random() * choices.length)];
    const tier = Math.min(S().missionTiers[t.id] || 0, t.tiers.length - 1);
    const m = { type: t.id, tier, target: t.tiers[tier], progress: 0, done: false, reward: MD.MISSION_REWARDS[tier] };
    if (t.stat === 'meme') m.meme = MD.MEMES[Math.floor(Math.random() * 6)].e; // the most common memes
    return m;
  }

  // Keep three missions on the board; finished ones are swapped out between runs.
  function fill() {
    const d = S();
    d.missions = d.missions.filter((m) => !m.done && typeOf(m));
    while (d.missions.length < 3) d.missions.push(make(d.missions.map((m) => m.type)));
  }

  function text(m) { return typeOf(m).text(m.target, m.meme); }

  function startRun(cb) {
    onComplete = cb;
    runStats = { dodges: 0, wave: 1, stars: 0, near: 0, score: 0 };
    for (const m of S().missions) if (!m.done && typeOf(m).run) m.progress = 0;
  }

  // stat: which counter moved; amount: how much; extra: e.g. the meme emoji
  function track(stat, amount = 1, extra) {
    if (runStats && stat in runStats) {
      runStats[stat] = stat === 'wave' || stat === 'score' ? Math.max(runStats[stat], amount) : runStats[stat] + amount;
    }
    for (const m of S().missions) {
      if (m.done) continue;
      const t = typeOf(m);
      if (t.stat !== stat) continue;
      if (t.stat === 'meme' && extra !== m.meme) continue;
      if (t.run) m.progress = runStats ? runStats[stat] : 0;
      else m.progress += amount;
      if (m.progress >= m.target) complete(m);
    }
  }

  function complete(m) {
    const d = S();
    m.done = true;
    m.progress = m.target;
    d.stars += m.reward;
    d.missionTiers[m.type] = (d.missionTiers[m.type] || 0) + 1;
    MD.save.write();
    if (onComplete) onComplete(m);
  }

  function endRun() { runStats = null; MD.save.write(); }

  return { fill, text, startRun, track, endRun, typeOf };
})();

MD.missions.fill();
MD.save.write();
