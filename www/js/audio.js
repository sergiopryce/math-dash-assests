// Sound effects and music, all synthesized with Web Audio (no audio files needed).
window.MD = window.MD || {};

MD.audio = (() => {
  let ac = null, master, sfxBus, musicBus, noiseBuf;
  let soundOn = true, musicOn = true;

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC(); } catch (e) { return null; }
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = soundOn ? 1 : 0; sfxBus.connect(master);
      musicBus = ac.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }

  // Browsers only allow audio after the player touches the screen.
  const unlock = () => { ensure(); if (musicWanted) startMusic(); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  function tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, to = null, bus = null, attack = 0.005 } = {}) {
    if (!ensure()) return;
    const t = ac.currentTime + at;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, { vol = 0.2, freq = 1000, to = null, at = 0, q = 1, type = 'bandpass' } = {}) {
    if (!ensure()) return;
    const t = ac.currentTime + at;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
  }

  const sfx = {
    star: () => { tone(1046, 0.08, { type: 'square', vol: 0.06 }); tone(1568, 0.14, { type: 'square', vol: 0.06, at: 0.06 }); },
    power: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.15, at: i * 0.05 })),
    hit: () => { tone(260, 0.35, { type: 'sine', vol: 0.5, to: 50 }); noise(0.2, { vol: 0.35, freq: 900, type: 'lowpass' }); },
    shieldBreak: () => { noise(0.35, { vol: 0.25, freq: 4000, to: 800, type: 'highpass' }); tone(990, 0.25, { type: 'triangle', vol: 0.15, to: 300 }); },
    near: () => noise(0.18, { vol: 0.18, freq: 600, to: 3000, q: 2 }),
    move: () => noise(0.07, { vol: 0.05, freq: 1800, to: 900, q: 1.5 }),
    wave: () => [392, 494, 587, 784].forEach((f, i) => tone(f, 0.7, { type: 'triangle', vol: 0.09, at: i * 0.04, attack: 0.08 })),
    mission: () => [523, 659, 784, 659, 1046].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.06, at: i * 0.09 })),
    click: () => tone(700, 0.05, { type: 'square', vol: 0.04 }),
    buy: () => { tone(880, 0.08, { type: 'square', vol: 0.06 }); tone(1320, 0.18, { type: 'square', vol: 0.06, at: 0.07 }); },
    nope: () => tone(200, 0.15, { type: 'square', vol: 0.06, to: 150 }),
  };

  // ---------- Music: a small looping groove whose tempo follows the wave ----------
  // A minor: Am - F - C - G, one chord per bar, 8 steps per bar.
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  let musicWanted = false, musicTimer = null, nextStep = 0, step = 0, bpm = 112, intensity = 0;

  function scheduleStep(s, t) {
    const chord = CHORDS[Math.floor(s / 8) % 4];
    const beat = s % 8;
    const at = t - ac.currentTime;
    if (beat % 4 === 0) tone(midi(chord[0] - 24), 0.32, { type: 'triangle', vol: 0.22, at, bus: musicBus });
    if (beat % 4 === 2) tone(midi(chord[0] - 12), 0.18, { type: 'triangle', vol: 0.12, at, bus: musicBus });
    const arp = chord[[0, 1, 2, 1][beat % 4]] + (beat >= 4 ? 12 : 0);
    tone(midi(arp), 0.14, { type: 'square', vol: 0.035, at, bus: musicBus });
    // Hi-hat comes in once the game picks up
    if (intensity > 0 && beat % 2 === 1) {
      const src = ac.createBufferSource(); src.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.05 * Math.min(1, intensity), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      src.connect(f); f.connect(g); g.connect(musicBus);
      src.start(t); src.stop(t + 0.05);
    }
  }

  function startMusic() {
    musicWanted = true;
    if (!musicOn || !ensure() || musicTimer) return;
    musicBus.gain.setTargetAtTime(0.55, ac.currentTime, 0.3);
    nextStep = ac.currentTime + 0.05;
    musicTimer = setInterval(() => {
      while (nextStep < ac.currentTime + 0.15) {
        scheduleStep(step++, nextStep);
        nextStep += 60 / bpm / 2;
      }
    }, 30);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (ac) musicBus.gain.setTargetAtTime(0, ac.currentTime, 0.1);
  }

  return {
    play(name) { if (soundOn && sfx[name]) try { sfx[name](); } catch (e) {} },
    music(on) { musicWanted = on; on ? startMusic() : stopMusic(); },
    setTempo(waveNum, playing) { bpm = Math.min(150, 112 + waveNum * 6); intensity = playing ? waveNum + 1 : 0; },
    duck(on) { if (ac && musicTimer) musicBus.gain.setTargetAtTime(on ? 0.15 : 0.55, ac.currentTime, 0.2); },
    setSound(on) { soundOn = on; if (ac) sfxBus.gain.value = on ? 1 : 0; },
    setMusic(on) {
      musicOn = on;
      if (!on) stopMusic();
      else if (musicWanted) startMusic();
    },
  };
})();
