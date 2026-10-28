// Swish Basket – all musik och alla ljudeffekter genereras live med Web Audio
const Sound = (() => {
  let ctx = null, master, musicBus, sfxBus, noiseBuf;
  let musicOn = true, sfxOn = true, playing = false, timer = null, nextTime = 0, step = 0, intensity = 0;
  const MUSIC_VOL = 0.3;
  const BPM = 100, STEP = 60 / BPM / 4;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 0.9;
    master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  // ---------- byggstenar ----------
  function env(gain, t, a, peak, d) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function tone(o) {
    const t = o.t ?? ctx.currentTime, a = o.a || 0.005, d = o.d || 0.2;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + a + d);
    const g = ctx.createGain();
    env(g, t, a, o.g ?? 0.3, d);
    let node = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.Q || 1;
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(o.dest || sfxBus);
    osc.start(t); osc.stop(t + a + d + 0.05);
  }

  function noise(o) {
    const t = o.t ?? ctx.currentTime, a = o.a || 0.005, d = o.d || 0.2;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + a + d);
    f.Q.value = o.Q ?? 1;
    const g = ctx.createGain();
    env(g, t, a, o.g ?? 0.3, d);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxBus);
    src.start(t, Math.random() * 1.5); src.stop(t + a + d + 0.05);
  }

  // ---------- ljudeffekter ----------
  const fx = fn => (...args) => { if (ctx && sfxOn) fn(...args); };

  const crowdOoh = (g = 0.03) => {
    for (let i = 0; i < 8; i++) {
      const f = rnd(150, 270);
      tone({ f, f2: f * 0.82, type: 'sawtooth', a: 0.18, d: 0.95, g, lp: 650, Q: 2 });
    }
  };

  const sfx = {
    dribble: fx((level = 3, vol = 1) => {
      const dull = level === 0;
      tone({ f: dull ? 105 : 150, f2: dull ? 42 : 55, d: dull ? 0.16 : 0.11, g: 0.55 * vol });
      noise({ type: 'bandpass', f: dull ? 600 : 1500, Q: 1.2, d: 0.035, g: (dull ? 0.1 : 0.2) * vol });
      if (level >= 10) tone({ f: 2600, f2: 3400, d: 0.08, g: 0.03 * vol });
    }),
    bounce: fx((vol = 1, level = 3) => {
      tone({ f: level === 0 ? 110 : 140, f2: 50, d: 0.12, g: 0.5 * vol });
      noise({ type: 'bandpass', f: 1200, d: 0.03, g: 0.15 * vol });
    }),
    squeak: fx(() => {
      tone({ f: rnd(1800, 2400), f2: rnd(2600, 3300), type: 'triangle', a: 0.01, d: 0.07, g: 0.05 });
      tone({ f: rnd(2200, 2800), f2: rnd(1700, 2100), type: 'sine', a: 0.01, d: 0.05, g: 0.04, t: ctx.currentTime + 0.05 });
    }),
    catchBall: fx(() => {
      tone({ f: 180, f2: 90, d: 0.08, g: 0.4 });
      noise({ type: 'bandpass', f: 900, d: 0.04, g: 0.15 });
    }),
    shoot: fx(() => {
      noise({ type: 'bandpass', f: 500, f2: 2200, Q: 0.8, a: 0.03, d: 0.25, g: 0.22 });
    }),
    swish: fx(() => {
      const t = ctx.currentTime;
      noise({ type: 'highpass', f: 2500, f2: 6500, a: 0.04, d: 0.35, g: 0.35 });
      noise({ t: t + 0.05, type: 'bandpass', f: 4200, f2: 1800, Q: 0.6, a: 0.08, d: 0.3, g: 0.2 });
    }),
    netIn: fx(() => {
      noise({ type: 'bandpass', f: 3200, f2: 1500, Q: 0.7, a: 0.03, d: 0.3, g: 0.25 });
    }),
    rim: fx((vol = 1) => {
      const base = rnd(420, 500);
      [1, 2.76, 5.4, 8.93].forEach((m, i) =>
        tone({ f: base * m, type: i ? 'sine' : 'triangle', d: 0.65 - i * 0.12, g: 0.18 / (i + 1) * vol }));
      noise({ type: 'highpass', f: 3000, d: 0.03, g: 0.25 * vol });
    }),
    backboard: fx(() => {
      tone({ f: 110, f2: 65, d: 0.18, g: 0.5 });
      noise({ type: 'lowpass', f: 900, d: 0.12, g: 0.35 });
      tone({ f: 320, type: 'square', d: 0.06, g: 0.04 });
    }),
    fake: fx(() => {
      noise({ type: 'bandpass', f: 1800, f2: 400, Q: 1.5, a: 0.01, d: 0.18, g: 0.35 });
      tone({ f: 500, f2: 1100, type: 'square', d: 0.1, g: 0.05, lp: 2500 });
      sfx.squeak();
    }),
    superJump: fx(() => {
      const t = ctx.currentTime;
      tone({ f: 120, f2: 900, type: 'sawtooth', a: 0.02, d: 0.7, g: 0.16, lp: 2000 });
      tone({ f: 220, f2: 660, d: 0.35, g: 0.3 });
      [0, 4, 7, 12, 16, 19].forEach((n, i) =>
        tone({ t: t + 0.1 + i * 0.06, f: mtof(84 + n), type: 'triangle', d: 0.25, g: 0.07 }));
    }),
    land: fx(() => {
      tone({ f: 90, f2: 40, d: 0.25, g: 0.6 });
      noise({ type: 'lowpass', f: 500, d: 0.2, g: 0.3 });
    }),
    dunk: fx(() => {
      tone({ f: 75, f2: 30, d: 0.5, g: 0.85 });
      noise({ type: 'lowpass', f: 800, d: 0.3, g: 0.5 });
      sfx.rim(1.4);
      noise({ t: ctx.currentTime + 0.05, type: 'bandpass', f: 3000, f2: 1200, Q: 0.7, a: 0.02, d: 0.35, g: 0.3 });
    }),
    pass: fx(() => {
      noise({ type: 'bandpass', f: 900, f2: 1800, Q: 0.9, a: 0.02, d: 0.15, g: 0.18 });
    }),
    powerSpawn: fx(() => {
      const t = ctx.currentTime;
      [0, 7, 12].forEach((n, i) => tone({ t: t + i * 0.07, f: mtof(88 + n), d: 0.3, g: 0.05 }));
    }),
    powerUp: fx(() => {
      const t = ctx.currentTime;
      [0, 4, 7, 12, 16].forEach((n, i) => tone({ t: t + i * 0.05, f: mtof(76 + n), type: 'square', d: 0.15, g: 0.05, lp: 3000 }));
      tone({ f: 300, f2: 1200, type: 'triangle', d: 0.3, g: 0.12 });
    }),
    freeze: fx(() => {
      const t = ctx.currentTime;
      noise({ type: 'highpass', f: 4000, f2: 9000, a: 0.02, d: 0.6, g: 0.2 });
      [0, 3, 7].forEach((n, i) => tone({ t: t + i * 0.04, f: mtof(96 + n), d: 0.5, g: 0.04 }));
    }),
    block: fx(() => {
      tone({ f: 170, f2: 60, d: 0.16, g: 0.65 });
      noise({ type: 'bandpass', f: 700, d: 0.08, g: 0.45 });
      sfx.squeak();
    }),
    whistle: fx(() => {
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
      o.frequency.value = 2900; lfo.frequency.value = 38; lg.gain.value = 180;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.setValueAtTime(0.16, t + 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g); g.connect(sfxBus);
      o.start(t); lfo.start(t); o.stop(t + 0.5); lfo.stop(t + 0.5);
      noise({ type: 'bandpass', f: 2900, Q: 3, d: 0.4, g: 0.06 });
    }),
    steal: fx(() => {
      const t = ctx.currentTime + 0.3;
      [0, 0.32, 0.64].forEach((dt, i) =>
        tone({ t: t + dt, f: mtof(55 - i), f2: i === 2 ? mtof(47) : undefined, type: 'sawtooth',
          a: 0.03, d: i === 2 ? 0.9 : 0.26, g: 0.13, lp: 900, Q: 2 }));
    }),
    buzzer: fx(() => {
      const t = ctx.currentTime;
      [['sawtooth', 196], ['square', 201]].forEach(([type, f]) => {
        const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = type; o.frequency.value = f; lp.frequency.value = 1500;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.14, t + 0.02);
        g.gain.setValueAtTime(0.14, t + 1.0);
        g.gain.linearRampToValueAtTime(0.0001, t + 1.1);
        o.connect(lp); lp.connect(g); g.connect(sfxBus);
        o.start(t); o.stop(t + 1.15);
      });
    }),
    beep: fx(go => {
      tone({ f: go ? 1320 : 880, type: 'square', d: go ? 0.4 : 0.15, g: 0.1, lp: 3000 });
    }),
    click: fx(() => tone({ f: 1200, f2: 900, type: 'triangle', d: 0.05, g: 0.1 })),
    scoreDing: fx(pts => {
      const t = ctx.currentTime;
      [72, 76, 79, 84, 88, 91].slice(0, Math.min(6, 2 + pts)).forEach((n, i) =>
        tone({ t: t + 0.1 + i * 0.07, f: mtof(n), type: 'triangle', d: 0.18, g: 0.09 }));
    }),
    levelUp: fx(level => {
      const t = ctx.currentTime + 0.05, base = 60 + Math.min(level, 9);
      const seq = level >= 10 ? [0, 4, 7, 12, 16, 19, 24, 28] : [0, 4, 7, 12];
      seq.forEach((n, i) => {
        tone({ t: t + i * 0.07, f: mtof(base + n), type: 'square', d: 0.16, g: 0.055, lp: 3000 });
        tone({ t: t + i * 0.07, f: mtof(base + n + 12), type: 'triangle', d: 0.2, g: 0.05 });
      });
      if (level >= 10) [0, 4, 7].forEach(n =>
        tone({ t: t + seq.length * 0.07, f: mtof(base + 12 + n), type: 'sawtooth', a: 0.02, d: 1.4, g: 0.05, lp: 2500 }));
      noise({ t, type: 'highpass', f: 6000, f2: 12000, a: 0.05, d: 0.5, g: 0.08 });
    }),
    cheer: fx((amount = 0.5) => {
      const t = ctx.currentTime, dur = 1.4 + amount * 1.8;
      noise({ type: 'bandpass', f: 1100, Q: 0.5, a: 0.25, d: dur, g: 0.08 + 0.25 * amount });
      noise({ type: 'bandpass', f: 2600, Q: 0.7, a: 0.3, d: dur * 0.8, g: 0.03 + 0.12 * amount });
      const claps = Math.floor(10 + amount * 40);
      for (let i = 0; i < claps; i++)
        noise({ t: t + Math.random() * dur * 0.9, type: 'highpass', f: 1200, a: 0.002, d: rnd(0.03, 0.07), g: rnd(0.04, 0.12) });
      for (let i = 0; i < 1 + amount * 3; i++)
        tone({ t: t + rnd(0.2, dur * 0.6), f: rnd(900, 1400), f2: rnd(1600, 2400), a: 0.08, d: 0.4, g: 0.04 });
    }),
    ooh: fx(() => crowdOoh()),
    airball: fx(() => {
      crowdOoh(0.025);
      tone({ f: 700, f2: 140, type: 'triangle', a: 0.02, d: 0.7, g: 0.12 });
    }),
    gameOver: fx(() => {
      const t = ctx.currentTime + 1.0;
      [72, 76, 79, 77, 76, 74, 72].forEach((n, i) =>
        tone({ t: t + i * 0.13, f: mtof(n), type: 'triangle', d: i === 6 ? 0.8 : 0.14, g: 0.12 }));
    }),
  };

  // ---------- musik: funkig hiphop-loop i A-moll som växer med bollnivån ----------
  const _ = null;
  const CHORDS = [
    { bass: 45, notes: [57, 60, 64, 67] }, // Am7
    { bass: 38, notes: [57, 60, 62, 65] }, // Dm9
    { bass: 41, notes: [57, 60, 64, 65] }, // Fmaj7
    { bass: 40, notes: [56, 59, 62, 64] }, // E7
  ];
  const KICK  = [1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0];
  const SNARE = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];
  const HAT   = [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,0,1,0];
  const STAB  = [0,0,0,1, 0,0,1,0, 0,0,0,1, 0,0,0,0];
  const BASS  = [0,_,_,0, _,_,12,_, 0,_,7,_, _,10,_,_];
  const MELODY = [
    [76,_,_,74, _,_,72,_, 69,_,72,_, _,_,74,_],
    [76,_,_,79, _,_,76,_, 74,_,_,72, _,_,_,_],
    [72,_,_,74, _,_,76,_, 79,_,81,_, 79,_,76,_],
    [76,_,_,74, _,_,71,_, _,_,68,_, 71,_,_,_],
  ];

  function playStep(s, t) {
    const i = s % 16, bar = Math.floor(s / 16) % 4, phrase = Math.floor(s / 64);
    const ch = CHORDS[bar], dest = musicBus;
    if (KICK[i] || (intensity >= 6 && i === 14)) tone({ t, f: 150, f2: 42, d: 0.3, g: 0.9, dest });
    if (SNARE[i] || (bar === 3 && i === 15)) {
      const g = SNARE[i] ? 1 : 0.4;
      noise({ t, type: 'highpass', f: 1400, d: 0.14, g: 0.32 * g, dest });
      tone({ t, f: 220, f2: 160, type: 'triangle', d: 0.08, g: 0.22 * g, dest });
    }
    if (HAT[i]) noise({ t, type: 'highpass', f: 7000, d: i === 7 ? 0.14 : 0.035, g: i % 4 === 0 ? 0.06 : 0.1, dest });
    if (BASS[i] !== null) {
      const f = mtof(ch.bass + BASS[i]);
      tone({ t, f, type: 'sawtooth', d: 0.2, g: 0.18, lp: 420 + intensity * 40, Q: 5, dest });
      tone({ t, f, d: 0.22, g: 0.22, dest });
    }
    if (i === 0) ch.notes.forEach(n => tone({ t, f: mtof(n), type: 'triangle', a: 0.25, d: 2.2, g: 0.03, dest }));
    if (STAB[i]) ch.notes.forEach(n => tone({ t, f: mtof(n + 12), type: 'square', d: 0.1, g: 0.016, lp: 2200, dest }));
    const lead = intensity >= 7 || (intensity >= 1 && phrase % 2 === 1);
    const n = MELODY[bar][i];
    if (lead && n) {
      tone({ t, f: mtof(n), type: 'square', d: 0.22, g: 0.045, lp: 2600, dest });
      tone({ t, f: mtof(n - 12), type: 'triangle', d: 0.25, g: 0.05, dest });
    }
    if (intensity >= 4 && i % 2 === 0) tone({ t, f: mtof(ch.notes[(i / 2) % 4] + 24), type: 'triangle', d: 0.08, g: 0.022, dest });
    if (intensity >= 8) noise({ t, type: 'highpass', f: 9000, d: 0.02, g: 0.04, dest });
    if (intensity >= 10 && i % 8 === 0) tone({ t, f: mtof(ch.notes[3] + 24), d: 0.6, g: 0.04, dest });
  }

  function schedule() {
    if (nextTime < ctx.currentTime - 0.2) nextTime = ctx.currentTime + 0.05; // fliken har sovit
    while (nextTime < ctx.currentTime + 0.15) {
      playStep(step, nextTime);
      nextTime += STEP * (step % 2 === 0 ? 1.12 : 0.88); // lite swing
      step++;
    }
  }

  return {
    init, ...sfx,
    startMusic() {
      if (!ctx || playing) return;
      playing = true; step = 0; nextTime = ctx.currentTime + 0.1;
      timer = setInterval(schedule, 25);
    },
    stopMusic() { playing = false; clearInterval(timer); },
    setIntensity(v) { intensity = v; },
    toggleMusic() {
      musicOn = !musicOn;
      if (ctx) musicBus.gain.setTargetAtTime(musicOn ? MUSIC_VOL : 0, ctx.currentTime, 0.05);
      return musicOn;
    },
    toggleSfx() { sfxOn = !sfxOn; return sfxOn; },
  };
})();
