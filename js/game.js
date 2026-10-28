// Swish Basket – spellogik, styrning, superkrafter, kamera och HUD
(() => {
  const $ = id => document.getElementById(id);
  const { HOOP, RIM_R, BOARD_Z } = World;
  const { BALL_R, BALL_LEVELS } = Actors;
  const G = 9.8, GAME_TIME = 120, PVP_TIME = 180, MAX_LIVES = 3, MAX_LEVEL = BALL_LEVELS.length - 1, MAX_OPP = 5;
  const SPEED = 5.4, CHARGE_SPEED = 2.2, SUPER_T = 1.35, SUPER_H = 3.1, FAKE_CD = 1.4;
  const DUNK_PTS = 5, DUNK_RANGE = 9.5, DUNK_PEAK = 1.75, DUNK_HANG = HOOP.y - 2.2;
  const BLOCK_T = 0.6, STEAL_CD = 0.9;
  const BOUNDS = { minX: -7.2, maxX: 7.2, minZ: 0.4, maxZ: 13.8 };
  const SCORE_KEY = 'geocoolness-scoreboard', NAME_KEY = 'geocoolness-name', SETUP_KEY = 'geocoolness-setup';
  const PCOLOR = ['#ffd23f', '#4fc3f7'];
  const clamp = THREE.MathUtils.clamp;
  const rand = (a, b) => a + Math.random() * (b - a);
  const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const headingTo = (dx, dz) => Math.atan2(-dx, -dz);
  const angLerp = (a, b, k) => {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * k;
  };
  const pname = p => `SPELARE ${p.idx + 1}`;
  const hearts = () => { const n = clamp(S.lives, 0, MAX_LIVES); return '♥'.repeat(n) + '♡'.repeat(MAX_LIVES - n); };
  const clock = secs => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  // Försvarets skicklighet efter nivå L (0–10, samma som bollens nivå): snabbare, kvickare, svårare att lura.
  const SKILL = {
    speed: L => 2.8 + L * 0.22,
    accel: L => 4.5 + L * 0.6,
    stealR: L => 0.75 + L * 0.035,
    stealT: L => 0.42 - L * 0.022,
    stun: L => 1.9 - L * 0.09,
    contest: L => 1.6 + L * 0.06,
    block: L => Math.min(0.5, 0.05 * L),
    jump: L => L >= 2 ? 0.4 + L * 0.2 : 0,
    interceptR: L => 0.55 + L * 0.04,
    interceptP: L => 0.35 + L * 0.04,
  };

  // superkrafter som dyker upp på planen
  const POWERS = {
    pad: { name: 'Hopp-pad', icon: '⤒', color: '#7df9ff', w: 3, desc: 'Glittrande cirkel – kliv på så flyger du högt. Spring mot korgen med bollen så blir det DUNK!' },
    speed: { name: 'Superfart', icon: '⚡', color: '#ff9f1c', w: 3, dur: 6, desc: 'Du blir jättesnabb i 6 sekunder.' },
    freeze: { name: 'Frysstråle', icon: '❄️', color: '#9be7ff', w: 2, dur: 3.5, desc: 'Alla motståndare fryser till is i 3,5 sekunder.' },
    double: { name: 'Dubbla poäng', icon: '×2', color: '#ffd23f', w: 2, dur: 12, desc: 'Nästa korg inom 12 sekunder ger dubbla poäng.' },
    sniper: { name: 'Prickskytt', icon: '🎯', color: '#7ee081', w: 2, dur: 8, desc: 'Dubbelt så stort grönt fält och ingen markering i 8 sekunder.' },
    ghost: { name: 'Spöke', icon: '👻', color: '#c9b6ff', w: 2, dur: 6, desc: 'Ingen kan sno eller blocka dig, och du går rakt igenom dem, i 6 sekunder.' },
  };
  const FX_TYPES = ['speed', 'double', 'sniper', 'ghost'];

  // ---------- enhet ----------
  const coarse = matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (coarse) document.body.classList.add('touch');
  const isTouch = () => document.body.classList.contains('touch');
  addEventListener('touchstart', () => {
    if (isTouch()) return;
    document.body.classList.add('touch');
    if (S.mode === 'playing' || S.mode === 'countdown') $('touch').classList.remove('hidden');
  }, { passive: true });

  // ---------- renderer & scen ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('game').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
  const world = World.build(scene, renderer);
  const hoopFloor = new THREE.Vector3(HOOP.x, 0, HOOP.z);
  function fitCamera() {
    camera.aspect = innerWidth / innerHeight;
    camera.fov = camera.aspect < 1 ? 72 : 55; // stående telefon: lite vidare vy
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', fitCamera);
  fitCamera();

  // ---------- spelare & försvarare ----------
  function actor(opts, extra) {
    const person = Actors.makePerson(opts);
    scene.add(person.group);
    const a = Object.assign({ person, pos: new THREE.Vector3(), vel: new THREE.Vector3(), heading: 0, walk: Math.random() * 6,
      stun: 0, frozen: 0, blockT: 0, slide: new THREE.Vector3(),
      mark: Actors.makeLabelSprite('?!', '#ffeb3b'), ice: Actors.makeLabelSprite('❄', '#bdf3ff') }, extra);
    for (const m of [a.mark, a.ice]) { m.position.y = 2.35; m.visible = false; person.group.add(m); }
    return a;
  }
  const newStats = () => ({ shots: 0, makes: 0, best: 0, dunks: 0, steals: 0, blocks: 0, passes: 0 });
  const newSide = () => ({ score: 0, level: 0, streak: 0, bestStreak: 0 });
  function human(opts, idx) {
    return actor(opts, Object.assign({ idx, isHuman: true, set: 'solo', inPlay: idx === 0, y: 0, hasBall: false, charging: false,
      power: 0, powerDir: 1, ballSide: 1, sideTarget: 1, dribble: 0, dribbleH: 0, hop: 0, invuln: 0, fakeCd: 0,
      fake: { t: 0, vx: 0, vz: 0 }, sup: { active: false }, squeakCd: 0, lastIx: 0, reachT: 0, stealCd: 0,
      fx: {}, ghostOn: false, st: newStats() }, newSide()));
  }
  const P = [
    human({ jersey: '#ffd23f', trim: '#6a1b9a', shorts: '#6a1b9a', numberColor: '#6a1b9a', skin: '#c68642', hair: '#1b1b1b', headband: '#ffffff', number: 23 }, 0),
    human({ jersey: '#1fa7e0', trim: '#ffffff', shorts: '#0b2545', numberColor: '#ffffff', skin: '#f1c27d', hair: '#6b3e1f', headband: '#ff4fa3', number: 7 }, 1),
  ];
  P[1].person.group.visible = false;
  let player = P[0];   // den som har bollen
  let rival = null;    // PvP: motspelaren som försvarar
  let mate = null;     // tillsammans: lagkamraten utan boll

  const defenders = [
    { number: 4, skin: '#8d5524', hair: '#2b1b0f' },
    { number: 11, skin: '#f1c27d', hair: '#c9a227' },
    { number: 32, skin: '#e0ac69', hair: '#3b2a1a' },
    { number: 8, skin: '#c68642', hair: '#111111' },
    { number: 15, skin: '#ffdbac', hair: '#8a3b12' },
  ].map(s => actor(
    { jersey: '#d62839', trim: '#ffffff', shorts: '#1d1d1f', numberColor: '#ffffff', skin: s.skin, hair: s.hair, number: s.number, shoes: '#222222' },
    { number: s.number, role: 'onball', side: 1, pressure: 0 }));

  // ringar under spelarna: zonfärg under bollhållaren, lagfärg under lagkamraten
  function floorRing(r1, r2, color, opacity) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.012;
    scene.add(m);
    return m;
  }
  const ring = floorRing(0.42, 0.52, '#ffffff', 0.8);
  const mateRing = floorRing(0.36, 0.42, '#ffffff', 0.55);
  mateRing.visible = false;

  const ball = { mesh: Actors.makeBall(), level: 0, state: 'dribble', vel: new THREE.Vector3(), segs: [], freeT: 0, holder: null,
    holderDrib: 0, sparkleT: 0, pass: null };
  scene.add(ball.mesh);
  let shot = null;

  // type: 'train', 'solo' (match mot botar, ensam eller tillsammans) eller 'pvp'
  const S = { mode: 'menu', type: 'solo', humans: 1, opp: 3, lives: MAX_LIVES, time: GAME_TIME, timeUp: false, poss: 0, trainSpot: null,
    resetTimer: 0, countdown: 0, lastCount: 0, upgradeTimer: 0, upgradeFor: null, shake: 0, saved: false, powerT: 0 };
  const TEAM = newSide();
  let lastType = 'solo';

  const side = p => S.type === 'pvp' ? p : TEAM;
  const bots = () => S.type === 'pvp' ? [] : defenders.slice(0, S.opp);
  const markers = () => S.type === 'pvp' ? (rival ? [rival] : []) : bots();
  const opponentsOf = p => S.type === 'pvp' ? [P[1 - p.idx]] : bots();
  const humans = () => P.filter(p => p.inPlay);
  const free = a => a.stun <= 0 && !(a.frozen > 0);
  const level = () => TEAM.level;

  function clampPos(p) {
    p.x = clamp(p.x, BOUNDS.minX, BOUNDS.maxX);
    p.z = clamp(p.z, BOUNDS.minZ, BOUNDS.maxZ);
    // man kan inte stå inuti tavlan/stolpen under korgen
    if (Math.abs(p.x) < 1 && p.z < 1.35) {
      if (1.35 - p.z < 1 - Math.abs(p.x)) p.z = 1.35;
      else p.x = (Math.sign(p.x) || 1) * 1;
    }
  }

  function localToWorld(a, lx, lz, out) {
    const c = Math.cos(a.heading), s = Math.sin(a.heading);
    return out.set(a.pos.x + lx * c + lz * s, 0, a.pos.z - lx * s + lz * c);
  }

  // ---------- partiklar ----------
  const particles = [];
  const confettiGeo = new THREE.PlaneGeometry(0.07, 0.04);
  const sparkGeo = new THREE.SphereGeometry(0.045, 6, 4);
  const dustGeo = new THREE.SphereGeometry(0.09, 6, 4);
  const matCache = new Map();
  function pmat(color, additive) {
    const key = color + (additive ? '+' : '');
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, transparent: !!additive, depthWrite: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    return matCache.get(key);
  }
  function emit(pos, n, o) {
    for (let i = 0; i < n && particles.length < 500; i++) {
      const m = new THREE.Mesh(o.geo || confettiGeo, pmat(o.colors[(Math.random() * o.colors.length) | 0], o.additive));
      const sp = o.spread || 0;
      m.position.set(pos.x + rand(-sp, sp), pos.y + rand(-sp, sp), pos.z + rand(-sp, sp));
      const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar((o.speed ?? 2) * rand(0.4, 1));
      v.y += o.up || 0;
      const life = (o.life || 1) * rand(0.6, 1);
      scene.add(m);
      particles.push({ m, v, life, max: life, grav: o.grav ?? 4, spin: o.spin ? rand(-12, 12) : 0, drag: o.drag ?? 1 });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { scene.remove(p.m); particles.splice(i, 1); continue; }
      p.v.y -= p.grav * dt;
      p.v.multiplyScalar(Math.exp(-p.drag * dt));
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.02) { p.m.position.y = 0.02; p.v.set(0, 0, 0); }
      if (p.spin) { p.m.rotation.x += p.spin * dt; p.m.rotation.y += p.spin * 0.7 * dt; }
      p.m.scale.setScalar(Math.max(0.01, Math.min(1, (p.life / p.max) * 3)));
    }
  }
  const CONFETTI = ['#ffd23f', '#ff6b81', '#7df9ff', '#7ee081', '#b388ff', '#ffffff'];

  // ---------- meddelanden ----------
  function say(text, cls = '', ms = 1300, color) {
    const el = document.createElement('div');
    el.className = 'msg ' + cls;
    el.textContent = text;
    el.style.animationDuration = ms + 'ms';
    if (color) el.style.color = color;
    $('message').appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  // ---------- superkrafter på planen ----------
  const powerups = [];
  const texCache = {};
  function canvasTex(key, draw) {
    if (!texCache[key]) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      draw(c.getContext('2d'));
      texCache[key] = new THREE.CanvasTexture(c);
    }
    return texCache[key];
  }
  const glitterTex = color => canvasTex('g' + color, g => {
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.35, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 120;
      g.fillStyle = Math.random() < 0.6 ? '#ffffff' : color;
      g.globalAlpha = rand(0.4, 1);
      g.beginPath(); g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, rand(1, 3.5), 0, Math.PI * 2); g.fill();
    }
  });
  const iconTex = type => canvasTex('i' + type, g => {
    const pw = POWERS[type];
    g.fillStyle = 'rgba(8,12,28,0.85)'; g.strokeStyle = pw.color; g.lineWidth = 14;
    g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = 'bold 120px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = pw.color;
    g.fillText(pw.icon, 128, 136);
  });

  function addMat(color, opacity, map) {
    return new THREE.MeshBasicMaterial({ color: map ? '#ffffff' : color, map: map || null, transparent: true, opacity,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  }
  function spawnPower() {
    const types = Object.keys(POWERS);
    let r = Math.random() * types.reduce((s, t) => s + POWERS[t].w, 0);
    const type = types.find(t => (r -= POWERS[t].w) < 0) || 'pad';
    const pos = new THREE.Vector3();
    for (let i = 0; i < 25; i++) {
      pos.set(rand(-6, 6), 0, rand(2.6, 11.5));
      if (hdist(pos, hoopFloor) > 2.5 && humans().every(h => hdist(h.pos, pos) > 2) && powerups.every(o => hdist(o.pos, pos) > 2.5)) break;
    }
    const pw = POWERS[type], R = type === 'pad' ? 0.8 : 0.5;
    const grp = new THREE.Group(); grp.position.copy(pos);
    const ringM = new THREE.Mesh(new THREE.RingGeometry(R * 0.82, R, 48), addMat(pw.color, 0.9));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.82, 48), addMat(pw.color, type === 'pad' ? 0.95 : 0.45, glitterTex(pw.color)));
    for (const m of [ringM, disc]) { m.rotation.x = -Math.PI / 2; grp.add(m); }
    ringM.position.y = 0.022; disc.position.y = 0.018;
    let icon = null, beam = null;
    if (type !== 'pad') {
      icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex(type), transparent: true, depthWrite: false }));
      icon.scale.set(0.75, 0.75, 1); icon.position.y = 1.15; grp.add(icon);
      beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 1.1, 10, 1, true), addMat(pw.color, 0.3));
      beam.position.y = 0.55; grp.add(beam);
    }
    scene.add(grp);
    powerups.push({ type, pos: pos.clone(), age: 0, life: 11, grp, ringM, disc, icon, beam, R, sparkT: 0 });
    Sound.powerSpawn();
    emit(_v.set(pos.x, 0.3, pos.z), 25, { colors: [pw.color, '#ffffff'], geo: sparkGeo, additive: true, speed: 2, up: 2, life: 0.8, grav: 2, drag: 2 });
  }
  function removePower(o) {
    scene.remove(o.grp);
    o.grp.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } else if (m.isSprite) m.material.dispose(); });
    powerups.splice(powerups.indexOf(o), 1);
  }
  const clearPowers = () => { while (powerups.length) removePower(powerups[0]); };

  function updatePowers(dt, t) {
    if (S.mode === 'playing' && !S.timeUp) {
      S.powerT -= dt;
      if (S.powerT <= 0) {
        if (powerups.length < (S.type === 'train' ? 3 : 2)) spawnPower();
        S.powerT = S.type === 'train' ? rand(4, 7) : rand(7, 12);
      }
    }
    for (const o of powerups.slice()) {
      o.age += dt;
      if (o.age > o.life) { removePower(o); continue; }
      o.disc.rotation.z += dt * (o.type === 'pad' ? 1.6 : 0.8);
      o.ringM.scale.setScalar(1 + 0.07 * Math.sin(t * 6));
      if (o.icon) { o.icon.position.y = 1.15 + Math.sin(t * 3 + o.pos.x) * 0.1; o.icon.material.rotation = Math.sin(t * 2) * 0.15; }
      o.grp.visible = o.life - o.age > 2 || Math.floor(o.age * 8) % 2 === 0; // blinkar innan den försvinner
      o.sparkT -= dt;
      if (o.sparkT <= 0) {
        o.sparkT = o.type === 'pad' ? 0.05 : 0.15;
        const a = Math.random() * Math.PI * 2, r = Math.random() * o.R * 0.8;
        emit(_v.set(o.pos.x + Math.cos(a) * r, 0.05, o.pos.z + Math.sin(a) * r), 1,
          { colors: [POWERS[o.type].color, '#ffffff'], geo: sparkGeo, additive: true, speed: 0.2, up: 1.2, life: 0.8, grav: 0, drag: 0.5 });
      }
      if (S.mode !== 'playing') continue;
      for (const h of humans()) {
        if (h.y > 0.05 || h.sup.active || !free(h)) continue;
        if (hdist(h.pos, o.pos) < (o.type === 'pad' ? o.R * 0.85 : 0.65)) { removePower(o); applyPower(h, o.type); break; }
      }
    }
  }

  function applyPower(p, type) {
    const pw = POWERS[type];
    Sound.powerUp();
    emit(_v.set(p.pos.x, 1, p.pos.z), 30, { colors: [pw.color, '#ffffff'], geo: sparkGeo, additive: true, speed: 3, life: 0.7, grav: 0, drag: 2 });
    if (S.humans === 2 || S.type === 'pvp') say(pname(p), 'small', 1200, PCOLOR[p.idx]);
    if (type === 'pad') return launch(p);
    say(`${pw.icon} ${pw.name.toUpperCase()}!`, 'power', 1400, pw.color);
    if (type === 'freeze') {
      const targets = opponentsOf(p).filter(o => o.person.group.visible);
      if (!targets.length) { say('Ingen att frysa här!', 'small', 1200); return; }
      Sound.freeze();
      for (const o of targets) {
        o.frozen = pw.dur; o.blockT = 0; o.stun = 0;
        if (o.isHuman && o.charging) { o.charging = false; hideMeter(); }
        emit(_v.set(o.pos.x, 1.2, o.pos.z), 20, { colors: ['#bdf3ff', '#ffffff'], geo: sparkGeo, additive: true, speed: 2, life: 0.8, grav: 1 });
      }
      return;
    }
    p.fx[type] = pw.dur;
  }

  // spöket syns halvgenomskinligt
  function setGhost(p, on) {
    if (p.ghostOn === on) return;
    p.ghostOn = on;
    p.person.group.traverse(m => {
      if (!m.isMesh || !m.material) return;
      for (const mat of [].concat(m.material)) { mat.transparent = on; mat.opacity = on ? 0.35 : 1; mat.needsUpdate = true; }
    });
  }

  // ---------- matchflöde ----------
  function setBallLevel(lv) {
    ball.level = lv;
    Actors.setBallLevel(ball.mesh, lv);
    Sound.setIntensity(lv);
    renderBallHud();
  }

  function assignRoles() {
    const coop = !!mate;
    const roles = coop ? ['onball', 'mate', 'help', 'wing', 'wing'] : ['onball', 'help', 'wing', 'wing', 'zone'];
    bots().forEach((d, i) => { d.role = roles[i]; d.side = i % 2 ? 1 : -1; });
  }

  function placeDefenders() {
    assignRoles();
    const dir = new THREE.Vector3(player.pos.x - HOOP.x, 0, player.pos.z - HOOP.z).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const dp = hdist(player.pos, hoopFloor);
    bots().forEach(d => {
      if (d.role === 'onball') d.pos.copy(player.pos).addScaledVector(dir, -3.2);
      else if (d.role === 'help') d.pos.copy(hoopFloor).addScaledVector(dir, 1.8);
      else if (d.role === 'mate') d.pos.copy(mate.pos).lerp(player.pos, 0.25);
      else if (d.role === 'zone') d.pos.copy(hoopFloor).addScaledVector(dir, 4).addScaledVector(perp, -1.5);
      else d.pos.copy(hoopFloor).addScaledVector(dir, Math.min(dp * 0.6, 5)).addScaledVector(perp, 2.8 * d.side);
      clampPos(d.pos);
      d.vel.set(0, 0, 0); d.stun = 0; d.frozen = 0; d.pressure = 0; d.blockT = 0; d.slide.set(0, 0, 0);
      d.heading = headingTo(player.pos.x - d.pos.x, player.pos.z - d.pos.z);
    });
  }

  function resetHuman(p) {
    Object.assign(p, { hasBall: false, charging: false, y: 0, hop: 0, invuln: 0, stun: 0, frozen: 0, blockT: 0, reachT: 0 });
    p.vel.set(0, 0, 0); p.slide.set(0, 0, 0);
    p.sup = { active: false }; p.fake.t = 0;
    p.person.group.rotation.z = 0;
  }

  function resetPossession(first) {
    rival = mate = null;
    if (S.type === 'pvp') { player = P[S.poss]; rival = P[1 - S.poss]; }
    else if (S.humans === 2) { player = P[S.poss]; mate = P[1 - S.poss]; }
    else player = P[0];
    resetHuman(player);
    if (S.type === 'train' && !first && S.trainSpot) player.pos.copy(S.trainSpot);
    else {
      const ang = rand(-1.25, 1.25), dist = first ? 8 : rand(5.2, 9.5);
      player.pos.set(HOOP.x + Math.sin(ang) * dist, 0, HOOP.z + Math.cos(ang) * dist);
    }
    clampPos(player.pos);
    player.heading = headingTo(HOOP.x - player.pos.x, HOOP.z - player.pos.z);
    player.hasBall = true;
    player.invuln = first || S.type === 'train' ? 0 : S.type === 'pvp' ? 1 : 1.5;
    const toHoop = new THREE.Vector3(HOOP.x - player.pos.x, 0, HOOP.z - player.pos.z).normalize();
    if (rival) {
      resetHuman(rival);
      rival.pos.copy(player.pos).addScaledVector(toHoop, 2.4);
      clampPos(rival.pos);
      rival.heading = headingTo(player.pos.x - rival.pos.x, player.pos.z - rival.pos.z);
    }
    if (mate) {
      resetHuman(mate);
      // lagkamraten startar på andra kanten
      const a = Math.atan2(player.pos.x - HOOP.x, player.pos.z - HOOP.z);
      const ma = -a * 0.8 + (Math.abs(a) < 0.3 ? 1 : 0), md = rand(5, 6.5);
      mate.pos.set(HOOP.x + Math.sin(ma) * md, 0, HOOP.z + Math.cos(ma) * md);
      clampPos(mate.pos);
      mate.heading = headingTo(HOOP.x - mate.pos.x, HOOP.z - mate.pos.z);
    }
    ball.state = 'dribble'; ball.holder = null; ball.segs = []; ball.pass = null;
    shot = null;
    setBallLevel(side(player).level);
    if (bots().length) placeDefenders();
    hideMeter();
    if (!first) {
      Sound.catchBall();
      if (S.type === 'pvp') say(`${pname(player)} ANFALLER`, 'small', 1200, PCOLOR[player.idx]);
    }
  }

  // vilka figurer som är med på planen
  function setupCast() {
    defenders.forEach((d, i) => {
      d.person.group.visible = S.type !== 'pvp' && i < S.opp;
      d.mark.visible = d.ice.visible = false;
    });
    P[1].inPlay = S.type === 'pvp' || S.humans === 2;
    P[1].person.group.visible = P[1].inPlay;
    P[0].set = P[1].inPlay ? 'p1' : 'solo';
    P[1].set = 'p2';
    P.forEach(p => { p.fx = {}; setGhost(p, false); });
  }

  // ---------- inställningar före start ----------
  const cfg = (() => {
    const def = { train: { humans: 1, opp: 0 }, solo: { humans: 1, opp: 3 } };
    try { const s = JSON.parse(localStorage.getItem(SETUP_KEY)); if (s) return { train: Object.assign(def.train, s.train), solo: Object.assign(def.solo, s.solo) }; } catch { /* tomt */ }
    return def;
  })();
  const saveCfg = () => { try { localStorage.setItem(SETUP_KEY, JSON.stringify(cfg)); } catch { /* privat läge */ } };
  let setupType = 'solo';

  function openSetup(type) {
    setupType = type;
    S.mode = 'setup';
    $('menu').classList.add('hidden');
    $('setup').classList.remove('hidden');
    renderSetup();
  }
  function renderSetup() {
    const c = cfg[setupType], train = setupType === 'train';
    if (isTouch()) c.humans = 1;
    if (!train) c.opp = Math.max(1, c.opp);
    $('setupTitle').innerHTML = train ? 'Trä<span>na</span>' : 'Spe<span>la</span>';
    $('setupTag').textContent = train ? 'Ingen klocka, inga liv – öva i lugn och ro' : 'Två minuter, tre liv – hur långt når ni?';
    document.querySelectorAll('#segPlayers button').forEach(b => b.classList.toggle('on', +b.dataset.v === c.humans));
    document.querySelectorAll('#segOpp button').forEach(b => {
      b.classList.toggle('on', +b.dataset.v === c.opp);
      b.disabled = !train && b.dataset.v === '0';
    });
    let hint = train
      ? (c.opp === 0 ? 'Fri träning: bara du och korgen.' : c.opp === 1 ? '1 mot 1 mot en bot.' : `Träna mot ${c.opp} botar.`)
      : `${c.opp} ${c.opp === 1 ? 'bot' : 'botar'}${c.humans === 2 ? ', gemensamma liv och poäng' : ''}.`;
    if (c.opp) hint += ' Försvaret går upp en nivå för varje mål – nivå 10 är riktigt tufft!';
    if (c.humans === 2) {
      const k = Controls.kbd;
      hint += ` Passa: Spelare 1 ${k('p1', 'pass')}, Spelare 2 ${k('p2', 'pass')}.`;
    }
    $('setupHint').innerHTML = hint;
  }
  function setupChange(key, v) {
    const c = cfg[setupType];
    if (key === 'opp') c.opp = clamp(v, setupType === 'train' ? 0 : 1, MAX_OPP);
    else c.humans = isTouch() ? 1 : clamp(v, 1, 2);
    saveCfg(); renderSetup(); Sound.click();
  }
  document.querySelectorAll('#segPlayers button').forEach(b => b.addEventListener('click', e => { e.currentTarget.blur(); setupChange('humans', +b.dataset.v); }));
  document.querySelectorAll('#segOpp button').forEach(b => b.addEventListener('click', e => { e.currentTarget.blur(); setupChange('opp', +b.dataset.v); }));

  function startGame(type = lastType) {
    Sound.init();
    lastType = S.type = type;
    const c = type === 'pvp' ? { humans: 2, opp: 0 } : cfg[type];
    S.humans = isTouch() && type !== 'pvp' ? 1 : c.humans;
    S.opp = c.opp;
    Object.assign(S, { mode: 'countdown', lives: MAX_LIVES, time: type === 'pvp' ? PVP_TIME : GAME_TIME, timeUp: false, poss: 0,
      trainSpot: null, resetTimer: 0, countdown: 3.5, lastCount: 4, upgradeTimer: 0, saved: false, powerT: type === 'train' ? 3 : 5 });
    Object.assign(TEAM, newSide());
    P.forEach(p => Object.assign(p, newSide(), { st: newStats(), fakeCd: 0, stealCd: 0 }));
    setupCast();
    clearPowers();
    resetPossession(true);
    ['menu', 'setup', 'gameover', 'pause', 'controls'].forEach(id => $(id).classList.add('hidden'));
    $('hud').className = type + (S.humans === 2 && type !== 'pvp' ? ' coop' : '');
    $('touch').classList.toggle('hidden', !isTouch());
    $('tPass').classList.toggle('hidden', !mate);
    clearHudCache();
    $('message').innerHTML = '';
    Sound.startMusic();
  }

  function showMenu() {
    S.mode = 'menu'; S.type = 'solo'; S.humans = 1; S.opp = 3;
    setupCast();
    clearPowers();
    Sound.stopMusic();
    ['gameover', 'pause', 'hud', 'controls', 'setup', 'touch'].forEach(id => $(id).classList.add('hidden'));
    renderScoreboard($('menuBoard'));
    renderMenuControls();
    $('menu').classList.remove('hidden');
    TEAM.level = 0;
    resetPossession(true);
  }

  function togglePause() {
    if (S.mode === 'playing') {
      S.mode = 'paused';
      $('pause').classList.remove('hidden');
      Sound.stopMusic();
      releaseTouch();
    } else if (S.mode === 'paused') {
      S.mode = 'playing';
      $('pause').classList.add('hidden');
      clearKeys();
      Sound.startMusic();
    }
  }

  function openKeys() {
    const fromPause = S.mode === 'paused';
    $(fromPause ? 'pause' : 'menu').classList.add('hidden');
    Controls.open(() => {
      clearKeys();
      $(fromPause ? 'pause' : 'menu').classList.remove('hidden');
    });
  }

  function statBoxes(list) {
    const box = $('goStats'); box.innerHTML = '';
    for (const [k, v, color] of list) {
      const el = document.createElement('div'); el.className = 'stat';
      const b = document.createElement('b'); b.textContent = v;
      if (color) b.style.color = color;
      el.append(b, k); box.appendChild(el);
    }
  }

  function gameOver() {
    S.mode = 'gameover';
    player.charging = false; hideMeter();
    clearPowers();
    Sound.stopMusic(); Sound.gameOver();
    $('hud').classList.add('hidden');
    $('touch').classList.add('hidden');
    if (S.type === 'pvp') {
      const [a, b] = P;
      const win = a.score === b.score ? null : a.score > b.score ? a : b;
      $('goTitle').innerHTML = win ? `${pname(win)} <span>vinner!</span>` : 'Oav<span>gjort!</span>';
      $('goFinal').innerHTML = `<span style="color:${PCOLOR[0]}">${a.score}</span> – <span style="color:${PCOLOR[1]}">${b.score}</span>`;
      const list = [];
      P.forEach(p => list.push(
        [`Sp ${p.idx + 1} mål`, `${p.st.makes} / ${p.st.shots}`, PCOLOR[p.idx]], [`Sp ${p.idx + 1} dunkar`, p.st.dunks, PCOLOR[p.idx]],
        [`Sp ${p.idx + 1} snor`, p.st.steals, PCOLOR[p.idx]], [`Sp ${p.idx + 1} blockar`, p.st.blocks, PCOLOR[p.idx]]));
      statBoxes(list);
      $('goSolo').classList.add('hidden');
      if (win) { world.cheer(1); Sound.cheer(1); }
    } else {
      const hs = humans(), sum = k => hs.reduce((s, p) => s + p.st[k], 0);
      const shots = sum('shots'), makes = sum('makes');
      $('goTitle').innerHTML = 'Slut<span>signal!</span>';
      $('goFinal').innerHTML = `<span>${TEAM.score}</span> poäng`;
      const list = [
        ['Mål', `${makes} / ${shots}`], ['Träff', (shots ? Math.round(100 * makes / shots) : 0) + ' %'],
        ['Längsta mål', Math.max(...hs.map(p => p.st.best)) ? Math.max(...hs.map(p => p.st.best)).toFixed(1) + ' m' : '–'],
        ['Dunkar', sum('dunks')], ['Försvar', `${S.opp} botar, nivå ${TEAM.level}`], ['Boll', BALL_LEVELS[TEAM.level].name],
      ];
      if (hs.length === 2) hs.forEach(p => list.push([`Sp ${p.idx + 1} mål / pass`, `${p.st.makes} / ${p.st.passes}`, PCOLOR[p.idx]]));
      statBoxes(list);
      $('goSolo').classList.remove('hidden');
      $('nameForm').classList.remove('hidden');
      $('nameInput').value = storage.get(NAME_KEY) || '';
      renderScoreboard($('goBoard'));
      if (!isTouch()) setTimeout(() => $('nameInput').focus(), 60);
    }
    $('gameover').classList.remove('hidden');
  }

  // ---------- scoreboard (sparas i webbläsaren) ----------
  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* privat läge */ } },
  };
  function loadBoard() {
    try { return JSON.parse(storage.get(SCORE_KEY)) || []; } catch { return []; }
  }
  function saveScore() {
    if (S.saved) return;
    S.saved = true;
    const name = ($('nameInput').value.trim() || 'Anonym').slice(0, 16);
    storage.set(NAME_KEY, name);
    const entry = { id: Date.now(), name, score: TEAM.score, level: TEAM.level, opp: S.opp, coop: S.humans === 2,
      makes: humans().reduce((s, p) => s + p.st.makes, 0), date: new Date().toLocaleDateString('sv-SE') };
    const list = loadBoard();
    list.push(entry);
    list.sort((a, b) => b.score - a.score || b.level - a.level || a.id - b.id);
    storage.set(SCORE_KEY, JSON.stringify(list.slice(0, 10)));
    renderScoreboard($('goBoard'), entry.id);
    $('nameForm').classList.add('hidden');
    $('nameInput').blur();
    Sound.click();
  }
  function renderScoreboard(el, highlight) {
    const list = loadBoard();
    el.innerHTML = '';
    if (!list.length) {
      el.innerHTML = '<div class="empty">Inga resultat än – bli först på tavlan!</div>';
      return;
    }
    const table = document.createElement('table'); table.className = 'board';
    table.innerHTML = '<tr><th>#</th><th>NAMN</th><th>POÄNG</th><th>BOLL</th><th>MOT</th><th>DATUM</th></tr>';
    list.forEach((e, i) => {
      const tr = document.createElement('tr');
      if (e.id === highlight) tr.className = 'me';
      const lv = BALL_LEVELS[Math.min(e.level, MAX_LEVEL)];
      const cells = [[String(i + 1), 'rank'], [(e.coop ? '👥 ' : '') + e.name, ''], [String(e.score), 'score'], [null, ''],
        [`${e.opp ?? 3} 🤖`, ''], [e.date, '']];
      cells.forEach(([txt, cls], ci) => {
        const td = document.createElement('td'); td.className = cls;
        if (ci === 3) {
          const dot = document.createElement('span'); dot.className = 'ball-dot'; dot.style.background = lv.color;
          td.append(dot, `${e.level}/10`);
        } else td.textContent = txt;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    if (highlight && !list.some(e => e.id === highlight)) {
      const note = document.createElement('div'); note.className = 'empty';
      note.textContent = 'Inte topp 10 den här gången – kör igen!';
      el.append(table, note);
    } else el.appendChild(table);
  }

  function renderMenuControls() {
    const k = Controls.kbd, mv = Controls.moveKbds;
    const pk = s => `${mv(s)} gå · ${k(s, 'shoot')} skjut · ${k(s, 'fake')} finta · ${k(s, 'pass')} passa`;
    $('menuControls').innerHTML = `
      <li><span class="who">ENSAM</span>${mv('solo')} Gå och snutsa bollen</li>
      <li>${k('solo', 'shoot')} Håll in och släpp i det gröna fältet för att skjuta</li>
      <li>${k('solo', 'fake')} Finta: försvarare nära dig tappar balansen</li>
      <li><span class="who">TVÅ SPELARE (TILLSAMMANS ELLER MOT VARANDRA)</span><b style="color:${PCOLOR[0]}">Spelare 1:</b> ${pk('p1')}</li>
      <li><b style="color:${PCOLOR[1]}">Spelare 2:</b> ${pk('p2')}</li>
      <li>När du försvarar i 2 spelare: skjut-knappen = hoppa och blocka, finta-knappen = sno bollen.</li>
      <li><kbd>M</kbd> Musik · <kbd>N</kbd> Ljud · <kbd>P</kbd>/<kbd>Esc</kbd> Paus</li>`;
    $('menuPowers').innerHTML = Object.values(POWERS)
      .map(pw => `<li><span style="color:${pw.color}">${pw.icon}</span><div><b style="color:${pw.color}">${pw.name}</b> – ${pw.desc}</div></li>`).join('');
  }

  // ---------- input ----------
  const keys = {};
  const clearKeys = () => Object.keys(keys).forEach(k => keys[k] = false);
  const ALWAYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'AltLeft', 'AltRight'];
  const touch = { ix: 0, iz: 0, id: null };
  function inputDir(p) {
    const b = Controls.get(p.set);
    let ix = (keys[b.right] ? 1 : 0) - (keys[b.left] ? 1 : 0), iz = (keys[b.down] ? 1 : 0) - (keys[b.up] ? 1 : 0);
    if (p === P[0] && touch.id !== null) { ix += touch.ix; iz += touch.iz; }
    return { ix, iz };
  }

  // en handling från tangentbord eller touchknapp
  function act(p, action, down) {
    if (action === 'shoot') {
      if (p === player) down ? startCharge() : releaseShot();
      else if (down) doBlock(p);
    } else if (down && action === 'fake') p === player ? doFake() : doSteal(p);
    else if (down && action === 'pass') doPass(p);
  }

  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || Controls.isOpen()) return;
    if (ALWAYS.includes(e.code) || Controls.isBound(e.code)) e.preventDefault();
    Sound.init();
    if (e.repeat) return;
    keys[e.code] = true;
    if (S.mode === 'setup') {
      const c = cfg[setupType];
      if (e.code === 'Escape') showMenu();
      else if (e.code === 'Enter') { e.preventDefault(); startGame(setupType); }
      else if (e.code === 'ArrowLeft') setupChange('opp', c.opp - 1);
      else if (e.code === 'ArrowRight') setupChange('opp', c.opp + 1);
      else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') setupChange('humans', 3 - c.humans);
      else if (/^(Digit|Numpad)[0-5]$/.test(e.code)) setupChange('opp', +e.code.slice(-1));
      return;
    }
    switch (e.code) {
      case 'KeyP': togglePause(); return;
      case 'Escape': if (S.mode === 'gameover') showMenu(); else togglePause(); return;
      case 'KeyM': say(Sound.toggleMusic() ? 'MUSIK PÅ' : 'MUSIK AV', 'small', 900); return;
      case 'KeyN': say(Sound.toggleSfx() ? 'LJUD PÅ' : 'LJUD AV', 'small', 900); return;
    }
    if (S.mode === 'menu') {
      const pick = { Digit1: 'train', Numpad1: 'train', Digit2: 'solo', Numpad2: 'solo', Digit3: 'pvp', Numpad3: 'pvp' }[e.code];
      if (pick) pick === 'pvp' ? startGame('pvp') : openSetup(pick);
      else if (e.code === 'Enter') { e.preventDefault(); startGame(); }
      else if (e.code === 'KeyK') openKeys();
      return;
    }
    if (S.mode === 'gameover') { if (e.code === 'Enter') startGame(); return; }
    if (S.mode === 'paused') { if (e.code === 'KeyK') openKeys(); return; }
    for (const p of humans()) {
      const b = Controls.get(p.set);
      for (const a of ['shoot', 'fake', 'pass']) if (e.code === b[a]) act(p, a, true);
    }
  });
  addEventListener('keyup', e => {
    if (e.target.tagName === 'INPUT') return;
    if (ALWAYS.includes(e.code) || Controls.isBound(e.code)) e.preventDefault();
    keys[e.code] = false;
    for (const p of humans()) if (e.code === Controls.get(p.set).shoot) act(p, 'shoot', false);
  });
  addEventListener('blur', () => {
    clearKeys(); releaseTouch();
    if (S.mode === 'playing') togglePause();
  });
  addEventListener('beforeunload', e => { if (S.mode === 'playing' && S.type !== 'train') { e.preventDefault(); e.returnValue = ''; } });

  // ---------- touch: joystick och knappar ----------
  const stick = $('stick'), knob = $('stickKnob'), STICK_R = 50;
  function releaseTouch() {
    touch.id = null; touch.ix = touch.iz = 0;
    stick.style.left = stick.style.top = stick.style.bottom = ''; knob.style.transform = '';
    if (player.charging && player === P[0]) act(P[0], 'shoot', false);
    document.querySelectorAll('.tbtn.down').forEach(b => b.classList.remove('down'));
  }
  $('stickZone').addEventListener('pointerdown', e => {
    if (touch.id !== null) return;
    e.preventDefault(); Sound.init();
    touch.id = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* äldre webbläsare */ }
    // joysticken hamnar där tummen sätts ned
    stick.style.left = (e.clientX - 65) + 'px'; stick.style.top = (e.clientY - 65) + 'px'; stick.style.bottom = 'auto';
    touch.cx = e.clientX; touch.cy = e.clientY; touch.ix = touch.iz = 0;
  });
  $('stickZone').addEventListener('pointermove', e => {
    if (e.pointerId !== touch.id) return;
    let dx = e.clientX - touch.cx, dy = e.clientY - touch.cy;
    const l = Math.hypot(dx, dy);
    if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.hypot(dx, dy) / STICK_R;
    touch.ix = m < 0.15 ? 0 : dx / STICK_R; touch.iz = m < 0.15 ? 0 : dy / STICK_R;
  });
  for (const ev of ['pointerup', 'pointercancel']) $('stickZone').addEventListener(ev, e => {
    if (e.pointerId !== touch.id) return;
    touch.id = null; touch.ix = touch.iz = 0;
    stick.style.left = stick.style.top = stick.style.bottom = ''; knob.style.transform = '';
  });
  function touchBtn(id, action) {
    const b = $(id);
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); Sound.init();
      try { b.setPointerCapture(e.pointerId); } catch { /* äldre webbläsare */ }
      b.classList.add('down');
      act(P[0], action, true);
    });
    for (const ev of ['pointerup', 'pointercancel']) b.addEventListener(ev, () => {
      if (!b.classList.contains('down')) return;
      b.classList.remove('down');
      if (action === 'shoot') act(P[0], 'shoot', false);
    });
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  touchBtn('tShoot', 'shoot'); touchBtn('tFake', 'fake'); touchBtn('tPass', 'pass');
  $('tPause').addEventListener('pointerdown', e => { e.preventDefault(); togglePause(); });

  const click = (id, fn) => $(id).addEventListener('click', e => { e.currentTarget.blur(); Sound.init(); fn(); });
  document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', e => {
    e.currentTarget.blur(); Sound.init();
    b.dataset.mode === 'pvp' ? startGame('pvp') : openSetup(b.dataset.mode);
  }));
  click('setupGo', () => startGame(setupType));
  click('setupBack', showMenu);
  click('keysBtn', openKeys);
  click('pauseKeysBtn', openKeys);
  click('resumeBtn', togglePause);
  click('quitBtn', showMenu);
  click('soundBtn', () => {
    const on = Sound.toggleMusic();
    if (Sound.toggleSfx() !== on) Sound.toggleSfx();
    $('soundBtn').textContent = on ? '🔊 Ljud & musik: på' : '🔇 Ljud & musik: av';
  });
  click('againBtn', () => startGame());
  click('menuBtn', showMenu);
  $('nameForm').addEventListener('submit', e => { e.preventDefault(); saveScore(); });
  Controls.onChange(() => { renderMenuControls(); clearHudCache(); if (S.mode === 'setup') renderSetup(); });

  // ---------- handlingar ----------
  const canAct = () => S.mode === 'playing' && !S.timeUp && S.resetTimer <= 0;
  const canActP = p => canAct() && free(p);

  // Längre bort = smalare grönt fält. Markering och högre försvarsnivå gör det ännu svårare.
  function shotParams(d) {
    const ideal = clamp(0.3 + d * 0.042, 0.3, 0.9);
    let w = (0.085 + ball.level * 0.006) * clamp(1.15 - d * 0.055, 0.3, 1.1);
    const near = Math.min(99, ...markers().filter(free).map(x => hdist(x.pos, player.pos)));
    const reach = S.type === 'pvp' ? 1.6 : SKILL.contest(level());
    let contested = near < reach && !player.sup.active;
    if (player.fx.sniper > 0) { w *= 2.2; contested = false; }
    if (contested) w *= S.type === 'pvp' ? 0.6 : 0.65 - level() * 0.02;
    if (contested && markers().some(m => m.blockT > 0 && hdist(m.pos, player.pos) < reach)) w *= 0.6;
    if (player.sup.active) w *= 1.25;
    return { ideal, w, contested };
  }

  function startCharge() {
    if (!canActP(player) || !player.hasBall || player.charging || player.sup.dunk) return;
    player.charging = true; player.power = 0; player.powerDir = 1;
    $('meter').classList.remove('hidden');
    $('meterLabel').classList.remove('hidden');
  }

  function hideMeter() {
    $('meter').classList.add('hidden');
    $('meterLabel').classList.add('hidden');
  }

  function seg(p0, p1, T, hit) {
    return { p0: p0.clone(), p1: p1.clone(), T, vy: (p1.y - p0.y + 0.5 * G * T * T) / T, t: 0, hit };
  }

  function releaseShot() {
    if (!player.charging) return;
    player.charging = false;
    hideMeter();
    if (S.mode !== 'playing' || !player.hasBall) return;

    const from = ball.mesh.position.clone();
    const d = hdist(player.pos, hoopFloor);
    const { ideal, w, contested } = shotParams(d);
    const err = (player.power - ideal) / w + rand(-0.12, 0.12) * (1 + d * 0.04);
    const a = Math.abs(err);
    let outcome = a <= 0.5 ? 'swish' : a <= 1 ? 'rimIn' : a <= 1.9 ? 'rimOut' : err < 0 ? 'short' : 'long';
    if (outcome === 'long' && from.z < BOARD_Z + 0.4) outcome = 'rimOut'; // bakom tavlans plan, studsa på ringen i stället
    let blocker = null;
    if (!player.sup.active && !(player.fx.ghost > 0)) {
      const b = markers().find(m => free(m) && m.blockT > 0.05 && hdist(m.pos, player.pos) < 1.5);
      if (b && Math.random() < (b.isHuman ? 0.65 : SKILL.block(level()))) { outcome = 'blocked'; blocker = b; }
    }
    shot = { points: World.zoneFor(d).pts, outcome, make: outcome === 'swish' || outcome === 'rimIn',
      scored: false, resolved: false, dist: d, air: player.sup.active };
    player.st.shots++;
    if (S.type === 'train') S.trainSpot = player.pos.clone();
    player.hasBall = false; player.hop = 0.45;
    ball.state = 'flight';

    const dir = new THREE.Vector3(from.x - HOOP.x, 0, from.z - HOOP.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    const T = 0.75 + Math.min(d, 15) * 0.055;
    const center = new THREE.Vector3(HOOP.x, HOOP.y + 0.03, HOOP.z);
    const rimPt = s => new THREE.Vector3(HOOP.x + dir.x * RIM_R * s, HOOP.y + 0.13, HOOP.z + dir.z * RIM_R * s);
    const dropIn = v => { v.x *= 0.08; v.z *= 0.08; };
    const segs = [];
    switch (outcome) {
      case 'swish':
        segs.push(seg(from, center, T, dropIn));
        break;
      case 'rimIn': {
        const first = rimPt(err < 0 ? 1 : -1); // för kort → främre ringen, för långt → bakre
        segs.push(seg(from, first, T, () => Sound.rim()));
        if (Math.random() < 0.5) {
          const second = rimPt(err < 0 ? -1 : 1);
          segs.push(seg(first, second, 0.32, () => Sound.rim(0.7)));
          segs.push(seg(second, center, 0.3, dropIn));
        } else segs.push(seg(first, center, 0.4, dropIn));
        break;
      }
      case 'rimOut': {
        const hitPt = rimPt(err < 0 ? 1 : -1);
        const ang = Math.atan2(dir.x, dir.z) + rand(-1.1, 1.1), r = rand(1.6, 2.8);
        const out = new THREE.Vector3(HOOP.x + Math.sin(ang) * r, BALL_R, Math.max(-0.5, HOOP.z + Math.cos(ang) * r));
        segs.push(seg(from, hitPt, T, () => { Sound.rim(); say(Math.random() < 0.5 ? 'NÄSTAN!' : 'STUDS UT!', 'miss', 900); }));
        segs.push(seg(hitPt, out, 0.85));
        break;
      }
      case 'short': {
        const land = new THREE.Vector3(from.x + (HOOP.x - from.x) * 0.86, BALL_R, from.z + (HOOP.z - from.z) * 0.86);
        segs.push(seg(from, land, T * 0.9, () => { Sound.airball(); say('AIRBALL!', 'miss', 1100); }));
        break;
      }
      case 'long': {
        const bp = new THREE.Vector3(HOOP.x + rand(-0.45, 0.45), HOOP.y + rand(0.3, 0.65), BOARD_Z + BALL_R + 0.01);
        segs.push(seg(from, bp, T, v => {
          v.z = Math.abs(v.z) * 0.45 + 0.8; v.x *= 0.5; v.y = Math.max(0.4, v.y * 0.2);
          Sound.backboard(); say('BRICK!', 'miss', 900);
        }));
        break;
      }
      case 'blocked': {
        // bollen slås bort, bakåt och åt sidan
        const perp = Math.random() < 0.5 ? -1 : 1;
        const land = new THREE.Vector3(from.x + dir.x * rand(2, 3.2) - dir.z * perp * rand(0.5, 1.5), BALL_R,
          from.z + dir.z * rand(2, 3.2) + dir.x * perp * rand(0.5, 1.5));
        segs.push(seg(from, land, 0.55));
        Sound.block(); Sound.ooh(); world.cheer(0.6);
        say('BLOCKAD!', 'bad', 1300);
        if (blocker.isHuman) { blocker.st.blocks++; say(`${pname(blocker)} SÄGER NEJ!`, 'small', 1300); }
        else say(`#${blocker.number} SÄGER NEJ!`, 'small', 1300);
        S.shake = 0.25;
        break;
      }
    }
    ball.segs = segs;
    if (outcome === 'blocked') return;
    Sound.shoot();
    if (a < 0.25) say('PERFEKT RELEASE!', 'small', 800);
    else if (contested) say('MARKERAD!', 'small', 700);
  }

  function doFake() {
    const p = player;
    if (!canActP(p) || !p.hasBall || p.fakeCd > 0 || p.sup.active || p.charging) return;
    p.fakeCd = FAKE_CD;
    const toHoop = new THREE.Vector3(HOOP.x - p.pos.x, 0, HOOP.z - p.pos.z).normalize();
    const perp = new THREE.Vector3(-toHoop.z, 0, toHoop.x);
    const side = Math.sign(inputDir(p).ix) || (p.sideTarget > 0 ? -1 : 1); // crossover till andra handen
    p.sideTarget = side;
    const dash = perp.multiplyScalar(side).addScaledVector(toHoop, 0.35).normalize();
    p.fake = { t: 0.26, vx: dash.x * 8, vz: dash.z * 8 };

    let fooled = 0;
    for (const d of markers()) {
      if (!free(d) || hdist(d.pos, p.pos) > 3.4) continue;
      d.stun = d.isHuman ? 0.75 : SKILL.stun(level()); fooled++;
      d.blockT = 0;
      d.slide.set(-dash.x, 0, -dash.z).multiplyScalar(d.isHuman ? 2.5 : 3.2); // de går på finten åt fel håll
    }
    Sound.fake();
    if (fooled) {
      Sound.ooh(); world.cheer(0.35);
      say(fooled > 1 ? `ANKELBRYTARE x${fooled}!` : 'ANKELBRYTARE!', 'cool', 1100);
    } else say('FINT!', 'small', 700);
  }

  // hopp-paden: högt hopp, och med bollen mot korgen blir det dunk
  function launch(p) {
    if (p.sup.active) return;
    const hx = HOOP.x - p.pos.x, hz = HOOP.z - p.pos.z, d = Math.hypot(hx, hz) || 0.01;
    let dx = p.vel.x, dz = p.vel.z;
    if (Math.hypot(dx, dz) < 0.8) { dx = hx; dz = hz; }
    const n = Math.hypot(dx, dz) || 1;
    dx /= n; dz /= n;
    p.fake.t = 0;
    if (S.type === 'train' && p.hasBall) S.trainSpot = p.pos.clone();
    if (p.hasBall && !p.charging && d < DUNK_RANGE && (dx * hx + dz * hz) / d > 0.15) {
      const back = d > 0.6 ? new THREE.Vector3(-hx / d, 0, -hz / d) : new THREE.Vector3(0, 0, 1);
      const to = new THREE.Vector3(HOOP.x + back.x * 0.5, 0, HOOP.z + back.z * 0.5);
      p.sup = { active: true, dunk: true, phase: 'fly', t: 0, T: 0.8 + d * 0.05, from: p.pos.clone(), to, dist: d };
      say('⤒ DUNKHOPP! ⤒', 'super', 1100);
    } else {
      p.sup = { active: true, t: 0, dx, dz };
      say('⤒ HOPP-PAD! ⤒', 'super', 1200);
    }
    Sound.superJump(); world.cheer(0.6);
    S.shake = 0.2;
  }

  function slamDunk(p) {
    const s = p.sup;
    s.phase = 'hang'; s.t = 0;
    shot = { points: DUNK_PTS, outcome: 'dunk', make: true, scored: false, resolved: false, dist: s.dist, air: false, dunk: true };
    p.st.shots++;
    p.hasBall = false;
    ball.state = 'flight';
    ball.segs = [seg(ball.mesh.position, new THREE.Vector3(HOOP.x, HOOP.y - 0.02, HOOP.z), 0.1,
      v => { v.x *= 0.05; v.z *= 0.05; v.y = Math.min(v.y, -5); })];
    Sound.dunk();
    S.shake = 0.5;
    world.wobbleNet(1.6); world.cheer(1);
    emit(new THREE.Vector3(HOOP.x, HOOP.y, HOOP.z), 40, { colors: ['#ff7b00', '#ffe66d', '#ffffff'], geo: sparkGeo, additive: true, speed: 4, life: 0.7, grav: 2, drag: 2 });
  }

  function landSuper(p) {
    p.sup = { active: false }; p.y = 0;
    p.invuln = Math.max(p.invuln, 0.5);
    Sound.land(); S.shake = Math.max(S.shake, 0.25);
    emit(_v.set(p.pos.x, 0.1, p.pos.z), 18, { colors: ['#d9c3a5', '#ffffff'], geo: dustGeo, speed: 2.5, life: 0.6, grav: 1, drag: 3 });
  }

  // PvP-försvar: skjutknappen = hoppa och blocka
  function doBlock(d) {
    if (S.type !== 'pvp' || d !== rival || !canActP(d) || d.blockT > 0) return;
    d.blockT = BLOCK_T;
    Sound.squeak();
  }

  // PvP-försvar: fintknappen = försök sno bollen. Missar man tappar man balansen en kort stund.
  function doSteal(d) {
    if (S.type !== 'pvp' || d !== rival || !canActP(d) || d.stealCd > 0 || d.blockT > 0) return;
    d.stealCd = STEAL_CD; d.reachT = 0.25;
    const a = player;
    if (!a.hasBall || a.sup.active || hdist(d.pos, a.pos) > 1.35) return;
    const chance = a.invuln > 0 || a.fx.ghost > 0 ? 0 : a.charging ? 0.2 : 0.45;
    if (Math.random() < chance) return steal(d);
    d.stun = 0.35; d.slide.set(0, 0, 0);
    say('MISS!', 'small', 600);
  }

  // tillsammans: passa till lagkamraten. En försvarare i passningslinjen kan snappa bollen.
  function doPass(p) {
    if (!mate || p !== player || !canActP(p) || !p.hasBall || p.charging || p.sup.active) return;
    const L = level();
    let thief = null, best = Infinity;
    for (const d of bots()) {
      if (!free(d)) continue;
      const abx = mate.pos.x - p.pos.x, abz = mate.pos.z - p.pos.z, l2 = abx * abx + abz * abz || 1;
      const t = ((d.pos.x - p.pos.x) * abx + (d.pos.z - p.pos.z) * abz) / l2;
      if (t < 0.12 || t > 0.92) continue;
      const off = Math.hypot(d.pos.x - (p.pos.x + abx * t), d.pos.z - (p.pos.z + abz * t));
      if (off < SKILL.interceptR(L) && t < best) { best = t; thief = d; }
    }
    if (thief && (p.fx.ghost > 0 || Math.random() > SKILL.interceptP(L))) thief = null;
    p.hasBall = false;
    p.st.passes++;
    ball.state = 'pass';
    ball.pass = { from: ball.mesh.position.clone(), to: thief || mate, thief: !!thief, t: 0, T: 0.22 + hdist(p.pos, mate.pos) * 0.055 };
    Sound.pass();
  }

  function catchPass(m) {
    const passer = player;
    m.hasBall = true; m.dribble = 0;
    m.invuln = Math.max(m.invuln, 0.4);
    player = m; mate = passer;
    ball.state = 'dribble'; ball.pass = null;
    Sound.catchBall();
    if (bots().length) assignRoles();
  }

  function steal(d, text) {
    player.hasBall = false; player.charging = false; hideMeter();
    ball.state = 'stolen'; ball.holder = d; ball.holderDrib = 0; ball.pass = null;
    side(player).streak = 0;
    Sound.whistle();
    S.shake = 0.3;
    if (S.type === 'pvp') {
      d.st.steals++;
      S.poss = d.idx;
      Sound.ooh(); world.cheer(0.5);
      say(`${pname(d)} SNODDE BOLLEN!`, 'bad', 1500);
      S.resetTimer = 1.4;
      return;
    }
    say(text || 'BOLLFÖRLUST!', 'bad', 1500);
    if (S.type === 'solo') {
      S.lives--;
      Sound.steal();
      if (S.lives > 0) say(`${S.lives} liv kvar`, 'small', 1500);
    }
    if (mate) S.poss = 1 - S.poss;
    S.resetTimer = S.type === 'solo' ? 1.9 : 1.3;
  }

  function scored() {
    const p = player, sd = side(p);
    shot.scored = true; p.st.makes++; sd.streak++;
    sd.bestStreak = Math.max(sd.bestStreak, sd.streak);
    let pts = shot.points;
    const extras = [];
    if (shot.dunk) p.st.dunks++;
    else {
      if (shot.outcome === 'swish') { pts += 1; extras.push('SWISH +1'); }
      if (shot.air) { pts += 2; extras.push('LUFTSKOTT +2'); }
      p.st.best = Math.max(p.st.best, shot.dist);
      shot.outcome === 'swish' ? Sound.swish() : Sound.netIn();
    }
    if (p.fx.double > 0) { pts *= 2; p.fx.double = 0; extras.push('×2 DUBBLA POÄNG!'); }
    if (S.timeUp) extras.push('BUZZER BEATER!');
    if (sd.streak === 3) extras.push('🔥 HET HAND! 🔥');
    sd.score += pts;
    Sound.scoreDing(pts);
    Sound.cheer(Math.min(1, 0.3 + pts / 6));
    world.cheer(Math.min(1, 0.35 + pts / 6));
    world.wobbleNet(1);
    emit(new THREE.Vector3(HOOP.x, HOOP.y - 0.2, HOOP.z), 50 + pts * 15, { colors: CONFETTI, speed: 4, up: 2, life: 1.8, grav: 3, spin: true, drag: 1.5 });
    if (shot.dunk) say('💥 DUNK! 💥', 'dunk', 1600);
    say(`+${pts}`, 'points', 1400);
    if (!shot.dunk) say(World.zoneFor(shot.dist).label + '!', '', 1400);
    if (S.type === 'pvp' || mate) say(pname(p), 'small', 1400, PCOLOR[p.idx]);
    extras.forEach(e => say(e, 'bonus', 1600));
    if (sd.level < MAX_LEVEL) { S.upgradeFor = sd; S.upgradeTimer = 0.55; }
  }

  function upgradeBall() {
    const sd = S.upgradeFor;
    sd.level++;
    setBallLevel(sd.level);
    const lv = BALL_LEVELS[sd.level];
    Sound.levelUp(sd.level);
    emit(ball.mesh.position, 40, { colors: [lv.color, '#ffffff'], geo: sparkGeo, additive: true, speed: 3, life: 0.9, grav: 0, drag: 2 });
    if (sd.level === MAX_LEVEL) {
      say('🏆 GULDBOLLEN! 🏆', 'gold', 2600);
      world.cheer(1); Sound.cheer(1);
      emit(ball.mesh.position, 120, { colors: ['#ffcf40', '#fff3b0', '#ffffff'], speed: 5, up: 3, life: 2.2, grav: 3, spin: true, drag: 1.2 });
    } else say(`NY BOLL: ${lv.name}`, 'up', 1800);
    if (sd === TEAM && bots().length) say(`FÖRSVARET NIVÅ ${sd.level}!`, 'small', 1800, '#ff8a9b');
  }

  function resolveShot() {
    shot.resolved = true;
    if (!shot.scored) side(player).streak = 0;
    if (S.type === 'pvp') S.poss = 1 - player.idx;
    else if (mate) S.poss = 1 - S.poss;
    S.resetTimer = 0.9;
  }

  // ---------- uppdatering ----------
  const _v = new THREE.Vector3(), _t = new THREE.Vector3();

  function updateDunk(p, dt) {
    const s = p.sup;
    s.t += dt;
    p.vel.set(0, 0, 0);
    if (s.phase === 'fly') {
      const u = Math.min(s.t / s.T, 1), e = u * u * (3 - 2 * u);
      p.pos.x = s.from.x + (s.to.x - s.from.x) * e;
      p.pos.z = s.from.z + (s.to.z - s.from.z) * e;
      p.y = u < 0.6 ? DUNK_PEAK * Math.sin(Math.PI / 2 * u / 0.6)
        : DUNK_HANG + (DUNK_PEAK - DUNK_HANG) * Math.cos(Math.PI / 2 * (u - 0.6) / 0.4);
      emit(_v.set(p.pos.x, p.y + 1.1, p.pos.z), 2, { colors: ['#ff7b00', '#ffeb3b', '#ffffff'], geo: sparkGeo, additive: true, speed: 0.8, life: 0.5, grav: -1, spread: 0.3 });
      if (u >= 1) slamDunk(p);
    } else if (s.phase === 'hang') {
      // hänger kvar i ringen en stund
      p.y = DUNK_HANG - Math.sin(Math.min(s.t / 0.5, 1) * Math.PI) * 0.07;
      if (s.t >= 0.5) { s.phase = 'drop'; s.t = 0; }
    } else {
      const u = Math.min(s.t / 0.32, 1);
      p.y = DUNK_HANG * (1 - u * u);
      if (u >= 1) landSuper(p);
    }
  }

  function updateHuman(p, dt, t) {
    if (!p.inPlay) return;
    const defending = p === rival;
    let { ix, iz } = canActP(p) ? inputDir(p) : { ix: 0, iz: 0 };
    const il = Math.hypot(ix, iz);
    if (il > 1) { ix /= il; iz /= il; }
    p.fakeCd = Math.max(0, p.fakeCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.stealCd = Math.max(0, p.stealCd - dt);
    p.reachT = Math.max(0, p.reachT - dt);
    p.blockT = Math.max(0, p.blockT - dt);
    p.frozen = Math.max(0, p.frozen - dt);
    if (S.mode === 'playing') for (const k of FX_TYPES) if (p.fx[k] > 0) p.fx[k] = Math.max(0, p.fx[k] - dt);
    setGhost(p, p.fx.ghost > 0);
    p.squeakCd -= dt;
    const g = p.person.group;
    const fast = p.fx.speed > 0 ? 1.75 : 1;

    if (p.frozen > 0) {
      p.vel.set(0, 0, 0);
    } else if (p.stun > 0) {
      p.stun -= dt;
      p.pos.addScaledVector(p.slide, dt);
      p.slide.multiplyScalar(Math.exp(-5 * dt));
      p.vel.set(0, 0, 0);
      g.rotation.z = Math.sin(p.stun * 14) * 0.25 * Math.min(1, p.stun);
    } else if (p.sup.dunk) {
      updateDunk(p, dt);
    } else if (p.sup.active) {
      p.sup.t += dt;
      const u = Math.min(p.sup.t / SUPER_T, 1);
      p.vel.set(p.sup.dx * 5 + ix * 1.6, 0, p.sup.dz * 5 + iz * 1.6);
      p.y = SUPER_H * Math.sin(Math.PI * u);
      emit(_v.set(p.pos.x, p.y + 1.1, p.pos.z), 2, { colors: ['#ffeb3b', '#00e5ff', '#ffffff'], geo: sparkGeo, additive: true, speed: 0.8, life: 0.5, grav: -1, spread: 0.3 });
      if (u >= 1) landSuper(p);
    } else if (p.fake.t > 0) {
      p.fake.t -= dt;
      p.vel.set(p.fake.vx, 0, p.fake.vz);
    } else {
      const sp = (p.charging ? CHARGE_SPEED : p.blockT > 0 ? SPEED * 0.35 : SPEED) * fast, k = 1 - Math.exp(-12 * dt);
      p.vel.x += (ix * sp - p.vel.x) * k;
      p.vel.z += (iz * sp - p.vel.z) * k;
      const six = Math.sign(Math.round(ix));
      if (six && six !== p.lastIx && p.squeakCd <= 0 && Math.hypot(p.vel.x, p.vel.z) > 2.5) { Sound.squeak(); p.squeakCd = 0.35; }
      p.lastIx = six;
    }
    if (p.stun <= 0) g.rotation.z *= 0.85;
    p.mark.visible = p.stun > 0 && !(p.frozen > 0);
    p.ice.visible = p.frozen > 0;
    if (!p.sup.dunk) {
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      clampPos(p.pos);
    }

    const hs = Math.hypot(p.vel.x, p.vel.z);
    if (fast > 1 && hs > 3 && p.y < 0.05) {
      emit(_v.set(p.pos.x, 0.25, p.pos.z), 1, { colors: ['#ff9f1c', '#ffe066'], geo: sparkGeo, additive: true, speed: 0.3, life: 0.4, grav: 0, spread: 0.15 });
    }
    let want = p.heading;
    if (defending) want = headingTo(player.pos.x - p.pos.x, player.pos.z - p.pos.z);
    else if (p.charging || p.sup.dunk || (!p.hasBall && shot)) want = headingTo(HOOP.x - p.pos.x, HOOP.z - p.pos.z);
    else if (p === mate && ball.state === 'pass') want = headingTo(ball.mesh.position.x - p.pos.x, ball.mesh.position.z - p.pos.z);
    else if (hs > 0.6) want = headingTo(p.vel.x, p.vel.z);
    if (!(p.frozen > 0)) p.heading = angLerp(p.heading, want, 1 - Math.exp(-14 * dt));

    if (p.charging) {
      // markören rör sig fortare ju längre bort man står
      const cyc = 0.95 - Math.min(hdist(p.pos, hoopFloor), 14) * 0.022;
      p.power += p.powerDir * dt / cyc;
      if (p.power >= 1) { p.power = 1; p.powerDir = -1; }
      else if (p.power <= 0) { p.power = 0; p.powerDir = 1; }
    }
    p.hop = Math.max(0, p.hop - dt);
    const hopY = p.hop > 0 ? Math.sin(Math.PI * (1 - p.hop / 0.45)) * 0.45 : 0;
    const blockY = p.blockT > 0 ? Math.sin(Math.PI * (1 - p.blockT / BLOCK_T)) * 0.7 : 0;
    p.walk += dt * hs * 2.3 / fast;
    p.ballSide += (p.sideTarget - p.ballSide) * (1 - Math.exp(-18 * dt));

    // bollen i handen: snutsa, håll över huvudet när man laddar, håll vid bröstet i luften
    if (p.hasBall) {
      const m = ball.mesh;
      if (p.sup.dunk) {
        localToWorld(p, 0, -0.3, m.position).y = p.y + 2.3;
      } else if (p.charging || p.hop > 0) {
        localToWorld(p, 0.08, -0.12, m.position).y = p.y + hopY + 2.12;
      } else if (p.sup.active || p.frozen > 0) {
        localToWorld(p, 0, -0.32, m.position).y = p.y + 1.3;
      } else {
        const prev = p.dribble;
        p.dribble += dt * (1.9 + hs * 0.22 / fast) * (ball.level === 0 ? 0.85 : 1) * fast;
        if (Math.floor(p.dribble) !== Math.floor(prev) && (S.mode === 'playing' || S.mode === 'countdown')) Sound.dribble(ball.level);
        p.dribbleH = Math.sin(Math.PI * (p.dribble % 1));
        const top = ball.level === 0 ? 0.78 : 0.86;
        localToWorld(p, p.ballSide * 0.38, -0.32 - hs * 0.04 / fast, m.position).y = BALL_R + (top - BALL_R) * p.dribbleH;
      }
      m.rotation.x -= dt * 6;
    }

    g.position.set(p.pos.x, p.y + hopY + blockY + Math.abs(Math.sin(p.walk)) * 0.04 * Math.min(hs / SPEED, 1), p.pos.z);
    g.rotation.y = p.heading;
    let armL, armR, spread = 0;
    if (p.frozen > 0) { armL = armR = 0.6; spread = 0.3; }
    else if (p.stun > 0) { armL = 1.2 + Math.sin(t * 18) * 1.2; armR = 1.2 + Math.cos(t * 18) * 1.2; spread = 0.5; }
    else if (p.sup.dunk) { armL = armR = p.sup.phase === 'drop' ? 2.2 : p.sup.phase === 'hang' ? 2.75 : 2.6; }
    else if (p.blockT > 0) { armL = armR = 2.95; }
    else if (p.charging || p.hop > 0) armL = armR = 2.75;
    else if (p.sup.active) { armL = 2.4; armR = 2.9; }
    else if (ball.holder === p) { armL = 2.6; armR = 0.5; }
    else if (p.reachT > 0) { armR = 1.5; armL = 0.4; }
    else if (p === mate && ball.state === 'pass') { armL = armR = 1.4; }
    else if (p.hasBall) {
      const drib = 0.3 + 0.3 * p.dribbleH;
      if (p.ballSide > 0) armR = drib; else armL = drib;
    } else if (defending) { armL = armR = 0.5; spread = 0.7; }
    const still = p.y > 0.05 || blockY > 0.05 || p.frozen > 0;
    Actors.pose(p.person, p.walk, still ? 0 : Math.min(hs / SPEED, 1), armL, armR, spread);
    if (p.sup.active && !p.sup.dunk) { p.person.legL.rotation.x = 1.1; p.person.legR.rotation.x = 0.5; }
    if (p.sup.dunk && p.sup.phase === 'fly') { p.person.legL.rotation.x = 0.9; p.person.legR.rotation.x = -0.3; }
    g.visible = !(S.mode === 'playing' && p.invuln > 0 && !p.sup.active && Math.floor(p.invuln * 12) % 2);

    if (p === player) {
      const zone = World.zoneFor(hdist(p.pos, hoopFloor));
      ring.position.x = p.pos.x; ring.position.z = p.pos.z;
      ring.material.color.set(zone.color);
      ring.visible = S.mode !== 'menu' && S.mode !== 'gameover' && S.mode !== 'setup';
    }
    if (p === mate) {
      mateRing.position.x = p.pos.x; mateRing.position.z = p.pos.z;
      mateRing.material.color.set(PCOLOR[p.idx]);
    }
  }

  // man kan inte springa igenom varandra (utom som spöke)
  function separatePlayers() {
    const pairs = [];
    if (rival) pairs.push([player, rival]);
    if (mate) pairs.push([player, mate]);
    for (const [a, b] of pairs) {
      if (a.sup.active || b.sup.active || a.fx.ghost > 0 || b.fx.ghost > 0) continue;
      const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, dl = Math.hypot(dx, dz);
      const MIN = 0.7;
      if (dl >= MIN || dl < 1e-4) continue;
      const push = (MIN - dl) / 2;
      a.pos.x += dx / dl * push; a.pos.z += dz / dl * push;
      b.pos.x -= dx / dl * push; b.pos.z -= dz / dl * push;
      clampPos(a.pos); clampPos(b.pos);
    }
    mateRing.visible = !!mate && (S.mode === 'playing' || S.mode === 'countdown');
  }

  function updateDefenders(dt, t) {
    const list = bots();
    if (!list.length) return;
    const L = level(), live = canAct();
    // vem försvaret jagar: bollhållaren, eller den som ska ta emot en passning
    const h = ball.state === 'pass' ? ball.pass.to : player;
    const handling = player.hasBall || ball.state === 'pass';
    const dirHP = new THREE.Vector3(h.pos.x - HOOP.x, 0, h.pos.z - HOOP.z);
    const dHP = dirHP.length() || 1;
    dirHP.divideScalar(dHP);
    const perp = new THREE.Vector3(-dirHP.z, 0, dirHP.x);
    const sp0 = SKILL.speed(L), accel = SKILL.accel(L);

    list.forEach((d, i) => {
      const g = d.person.group;
      const dist = hdist(d.pos, h.pos);
      d.blockT = Math.max(0, d.blockT - dt);
      d.frozen = Math.max(0, d.frozen - dt);
      d.ice.visible = d.frozen > 0;
      if (d.frozen > 0) {
        d.vel.set(0, 0, 0);
        d.mark.visible = false;
        Actors.pose(d.person, d.walk, 0, 0.6, 0.6, 0.3);
        g.position.set(d.pos.x, 0, d.pos.z);
        return;
      }
      if (d.stun > 0) {
        d.stun -= dt;
        d.pos.addScaledVector(d.slide, dt);
        d.slide.multiplyScalar(Math.exp(-5 * dt));
        d.vel.set(0, 0, 0);
        g.rotation.z = Math.sin(d.stun * 14) * 0.25 * Math.min(1, d.stun);
        d.mark.visible = true;
        d.mark.material.rotation = Math.sin(t * 8) * 0.3;
      } else {
        g.rotation.z *= 0.85;
        d.mark.visible = false;
        let tx = d.pos.x, tz = d.pos.z, sp = 0;
        if (!live) {
          sp = 0;
        } else if (!handling) {
          // skottet är i luften: backa mot korgen för returen
          const k = i - (list.length - 1) / 2;
          tx = HOOP.x + perp.x * k * 1.4 + dirHP.x * 1.6;
          tz = HOOP.z + perp.z * k * 1.4 + dirHP.z * 1.6;
          sp = 2.5 + L * 0.1;
        } else if (player.sup.active && h === player) {
          tx = player.pos.x; tz = player.pos.z; sp = 1;
        } else if (d.role === 'onball') {
          tx = h.pos.x - dirHP.x; tz = h.pos.z - dirHP.z; sp = sp0 * 1.1;
          if (dist < 2.3) { tx = h.pos.x - dirHP.x * 0.55; tz = h.pos.z - dirHP.z * 0.55; sp *= 1.12; }
        } else if (d.role === 'mate' && mate) {
          // täcker lagkamraten och står i passningslinjen
          const other = h === mate ? player : mate;
          const vx = h.pos.x - other.pos.x, vz = h.pos.z - other.pos.z, vl = Math.hypot(vx, vz) || 1;
          const off = Math.min(1.2 + L * 0.08, vl * 0.45);
          tx = other.pos.x + vx / vl * off; tz = other.pos.z + vz / vl * off; sp = sp0;
          if (h === mate) { tx = h.pos.x - dirHP.x * 0.55; tz = h.pos.z - dirHP.z * 0.55; }
        } else if (d.role === 'help') {
          const r = Math.min(3.2, dHP * 0.45);
          tx = HOOP.x + dirHP.x * r; tz = HOOP.z + dirHP.z * r; sp = sp0 * 0.95;
          if (dist < 2.2) { tx = h.pos.x - dirHP.x * 0.55; tz = h.pos.z - dirHP.z * 0.55; }
        } else if (d.role === 'zone') {
          tx = HOOP.x + dirHP.x * 4 - perp.x * 1.2; tz = HOOP.z + dirHP.z * 4 - perp.z * 1.2; sp = sp0 * 0.85;
          if (dist < 1.8) { tx = h.pos.x - dirHP.x * 0.55; tz = h.pos.z - dirHP.z * 0.55; }
        } else {
          tx = h.pos.x - dirHP.x * 2.8 + perp.x * 1.5 * d.side;
          tz = h.pos.z - dirHP.z * 2.8 + perp.z * 1.5 * d.side;
          sp = sp0 * 0.9;
          if (dist < 1.9) { tx = h.pos.x - dirHP.x * 0.55; tz = h.pos.z - dirHP.z * 0.55; }
        }
        const dx = tx - d.pos.x, dz = tz - d.pos.z, dl = Math.hypot(dx, dz);
        const want = dl > 0.05 ? sp * Math.min(1, dl / 0.4) : 0;
        const k = 1 - Math.exp(-accel * dt);
        d.vel.x += ((dl ? dx / dl : 0) * want - d.vel.x) * k;
        d.vel.z += ((dl ? dz / dl : 0) * want - d.vel.z) * k;
        for (const o of list) {
          if (o === d) continue;
          const sx = d.pos.x - o.pos.x, sz = d.pos.z - o.pos.z, sl = Math.hypot(sx, sz);
          if (sl < 1 && sl > 0.001) { d.vel.x += sx / sl * (1 - sl) * 60 * dt; d.vel.z += sz / sl * (1 - sl) * 60 * dt; }
        }
        d.pos.addScaledVector(d.vel, dt);
        // från nivå 2 hoppar de för att blocka när man laddar ett skott nära dem
        if (live && player.charging && d.blockT <= 0 && hdist(d.pos, player.pos) < 1.3 + L * 0.03 && Math.random() < dt * SKILL.jump(L)) {
          d.blockT = BLOCK_T;
        }
      }
      clampPos(d.pos);

      const look = player.hasBall || ball.state === 'stolen' ? player.pos : ball.mesh.position;
      d.heading = angLerp(d.heading, headingTo(look.x - d.pos.x, look.z - d.pos.z), 1 - Math.exp(-8 * dt));
      const hs = Math.hypot(d.vel.x, d.vel.z);
      d.walk += dt * hs * 2.4;
      const blockY = d.blockT > 0 ? Math.sin(Math.PI * (1 - d.blockT / BLOCK_T)) * 0.6 : 0;
      g.position.set(d.pos.x, blockY + Math.abs(Math.sin(d.walk)) * 0.03 * Math.min(hs / 4, 1), d.pos.z);
      g.rotation.y = d.heading;
      d.person.head.rotation.x = player.sup.active ? 0.5 : 0;
      if (d.stun > 0) Actors.pose(d.person, d.walk, 0, 1.2 + Math.sin(t * 18) * 1.2, 1.2 + Math.cos(t * 18) * 1.2, 0.5);
      else if (d.blockT > 0 || player.sup.active) Actors.pose(d.person, d.walk, blockY > 0.05 ? 0 : Math.min(hs / 4, 1), 2.9, 2.9, 0.2);
      else if (ball.holder === d) Actors.pose(d.person, d.walk, 0, 2.6, 0.5, 0);
      else Actors.pose(d.person, d.walk, Math.min(hs / 4, 1), 0.5 + Math.sin(t * 6 + i) * 0.1, 0.5 + Math.cos(t * 6 + i) * 0.1, 0.7);
    });
  }

  // En försvarare måste vara tätt inpå en kort stund för att sno bollen – på högre nivå går det fortare.
  function checkSteal(dt) {
    const list = bots();
    if (!list.length) return;
    const L = level();
    const open = player.hasBall && !player.sup.active && player.invuln <= 0 && !(player.fx.ghost > 0) && canAct();
    for (const d of list) {
      const close = open && free(d) && hdist(d.pos, player.pos) < SKILL.stealR(L);
      d.pressure = close ? d.pressure + dt : Math.max(0, d.pressure - dt * 2);
      if (d.pressure > SKILL.stealT(L)) return steal(d);
    }
  }

  function updateBall(dt) {
    const m = ball.mesh, p = m.position;
    if (ball.state === 'stolen' && ball.holder) {
      ball.holderDrib += dt * 2.2;
      localToWorld(ball.holder, 0.38, -0.3, p).y = BALL_R + 0.72 * Math.sin(Math.PI * (ball.holderDrib % 1));
    } else if (ball.state === 'pass') {
      const ps = ball.pass;
      ps.t += dt;
      const u = Math.min(ps.t / ps.T, 1);
      localToWorld(ps.to, 0.15, -0.35, _t).y = 1.15;
      p.lerpVectors(ps.from, _t, u);
      p.y += Math.sin(Math.PI * u) * 0.5;
      m.rotation.x -= dt * 12;
      if (u >= 1) {
        if (ps.thief) { if (S.mode === 'playing') steal(ps.to, 'SNAPPAD!'); }
        else catchPass(ps.to);
      }
    } else if (ball.state === 'flight') {
      const s = ball.segs[0];
      s.t += dt;
      const tt = Math.min(s.t, s.T), u = tt / s.T;
      p.set(s.p0.x + (s.p1.x - s.p0.x) * u, s.p0.y + s.vy * tt - 0.5 * G * tt * tt, s.p0.z + (s.p1.z - s.p0.z) * u);
      m.rotation.x -= dt * 9;
      if (s.t >= s.T) {
        ball.segs.shift();
        const v = new THREE.Vector3((s.p1.x - s.p0.x) / s.T, s.vy - G * s.T, (s.p1.z - s.p0.z) / s.T);
        if (s.hit) s.hit(v);
        if (!ball.segs.length) { ball.state = 'free'; ball.freeT = 0; ball.vel.copy(v); }
      }
    } else if (ball.state === 'free') {
      const v = ball.vel;
      ball.freeT += dt;
      v.y -= G * dt;
      const rh = Math.hypot(p.x - HOOP.x, p.z - HOOP.z);
      if (shot && shot.make && rh < RIM_R && p.y < HOOP.y + 0.05 && p.y > HOOP.y - 0.45) {
        // nätet bromsar bollen
        v.x *= Math.exp(-8 * dt); v.z *= Math.exp(-8 * dt); v.y *= Math.exp(-3 * dt);
      }
      p.addScaledVector(v, dt);
      if (shot && shot.make && !shot.scored && p.y < HOOP.y - 0.12 && rh < RIM_R + 0.05) scored();
      if (v.z < 0 && p.z < BOARD_Z + BALL_R && p.z > BOARD_Z - 0.1 && Math.abs(p.x) < 0.9 && p.y > 2.9 && p.y < 3.95) {
        p.z = BOARD_Z + BALL_R; v.z = -v.z * 0.6; Sound.backboard();
      }
      if (p.y < BALL_R) {
        p.y = BALL_R;
        if (v.y < -0.6) { Sound.bounce(Math.min(1, -v.y / 6), ball.level); v.y = -v.y * 0.62; } else v.y = 0;
        v.x *= 0.86; v.z *= 0.86;
      }
      if (p.y <= BALL_R + 0.001) { v.x *= Math.exp(-1.2 * dt); v.z *= Math.exp(-1.2 * dt); }
      if (Math.abs(p.x) > 9) { p.x = Math.sign(p.x) * 9; v.x *= -0.5; }
      if (p.z < -2) { p.z = -2; v.z *= -0.5; }
      if (p.z > 16) { p.z = 16; v.z *= -0.5; }
      m.rotation.x -= v.z * dt / BALL_R;
      m.rotation.z += v.x * dt / BALL_R;
      if (shot && !shot.resolved && ball.freeT > (shot.scored ? 0.9 : 1.3)) resolveShot();
    }

    // effekter för de finare bollarna
    ball.sparkleT -= dt;
    if (ball.sparkleT <= 0) {
      if (ball.level >= MAX_LEVEL) {
        emit(p, 1, { colors: ['#ffcf40', '#fff3b0'], geo: sparkGeo, additive: true, speed: 0.3, life: 0.6, grav: -0.4, spread: 0.15 });
        ball.sparkleT = 0.04;
      } else if (ball.level >= 5 && ball.state === 'flight') {
        emit(p, 1, { colors: [BALL_LEVELS[ball.level].color], geo: sparkGeo, additive: true, speed: 0.1, life: 0.4, grav: 0 });
        ball.sparkleT = 0.015;
      }
    }
  }

  function updateTimers(dt) {
    if (S.type !== 'train' && !S.timeUp) {
      S.time -= dt;
      if (S.time <= 0) {
        S.time = 0; S.timeUp = true;
        Sound.buzzer();
        say('TIDEN ÄR UTE!', 'bad', 1800);
        if (player.charging) { player.charging = false; hideMeter(); }
        if (ball.state !== 'flight' && ball.state !== 'free' && S.resetTimer <= 0) S.resetTimer = 1.8;
      }
    }
    if (S.upgradeTimer > 0) {
      S.upgradeTimer -= dt;
      if (S.upgradeTimer <= 0) upgradeBall();
    }
    if (S.resetTimer > 0) {
      S.resetTimer -= dt;
      if (S.resetTimer <= 0) {
        if ((S.type === 'solo' && S.lives <= 0) || S.timeUp) return gameOver();
        resetPossession();
      }
    }
  }

  function updateCountdown(dt) {
    S.countdown -= dt;
    const n = Math.ceil(S.countdown - 0.5);
    if (n !== S.lastCount) {
      S.lastCount = n;
      if (n > 0) { say(String(n), 'count', 800); Sound.beep(false); }
      else {
        say('KÖR!', 'count go', 900); Sound.beep(true); world.cheer(0.5);
        if (S.type === 'pvp') say(`${pname(player)} BÖRJAR MED BOLLEN`, 'small', 1500);
        else if (S.type === 'train') say(S.opp === 1 ? 'TRÄNING 1 MOT 1!' : S.opp ? `TRÄNING MOT ${S.opp} BOTAR` : 'TRÄNING – KASTA SÅ MYCKET DU VILL!', 'small', 2000);
        else if (mate) say('SPELA TILLSAMMANS – PASSA!', 'small', 1800);
      }
    }
    if (S.countdown <= 0.5) S.mode = 'playing';
  }

  // ---------- kamera ----------
  const camPos = new THREE.Vector3(0, 7, 22), camLook = new THREE.Vector3(0, 2, 4);
  const _want = new THREE.Vector3(), _look = new THREE.Vector3(), _focus = new THREE.Vector3();
  function updateCamera(dt, t) {
    if (S.mode === 'menu' || S.mode === 'gameover' || S.mode === 'setup') {
      const a = Math.sin(t * 0.12) * 0.7;
      _want.set(Math.sin(a) * 13, 6.2, HOOP.z + Math.cos(a) * 13);
      _look.set(0, 2.2, HOOP.z + 2.5);
    } else {
      _focus.copy(ball.state === 'pass' ? ball.mesh.position : player.pos);
      if (mate) _focus.lerp(mate.pos, 0.3);
      const y = player.y;
      const back = camera.aspect < 1 ? 10 : 7.4; // stående telefon: lite längre bak
      _want.set(_focus.x * 0.72, 4.4 + y * 0.55 + (camera.aspect < 1 ? 1.5 : 0), Math.max(_focus.z, mate ? mate.pos.z : 0) + back);
      _look.set(_focus.x * 0.6 + HOOP.x * 0.4, 2.1 + y * 0.5, _focus.z * 0.55 + HOOP.z * 0.45);
    }
    camPos.lerp(_want, 1 - Math.exp(-4 * dt));
    camLook.lerp(_look, 1 - Math.exp(-6 * dt));
    camera.position.copy(camPos);
    if (S.shake > 0) {
      S.shake -= dt;
      camera.position.x += rand(-1, 1) * S.shake * 0.3;
      camera.position.y += rand(-1, 1) * S.shake * 0.3;
    }
    camera.lookAt(camLook);
  }

  // ---------- HUD ----------
  const hudCache = {};
  const clearHudCache = () => Object.keys(hudCache).forEach(k => delete hudCache[k]);
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function setHtml(id, v) { if (hudCache['h' + id] !== v) { hudCache['h' + id] = v; $(id).innerHTML = v; } }
  function setClass(id, cls) { if (hudCache['c' + id] !== cls) { hudCache['c' + id] = cls; $(id).className = cls; } }
  const ballDotBg = lv => `radial-gradient(circle at 35% 35%, #ffffff88, ${lv.color} 45%)`;
  const keyHtml = (p, a) => isTouch() && p === P[0] && !P[1].inPlay ? '' : Controls.kbd(p.set, a);

  function renderBallHud() {
    const lv = BALL_LEVELS[ball.level];
    $('ballLabel').textContent = `${lv.name} (${ball.level}/10)`;
    $('ballDot').style.background = ballDotBg(lv);
    $('ballName').classList.toggle('gold', ball.level >= MAX_LEVEL);
    const pips = $('ballPips');
    pips.innerHTML = '';
    for (let i = 0; i < MAX_LEVEL; i++) {
      const s = document.createElement('span');
      if (i < ball.level) s.className = ball.level >= MAX_LEVEL ? 'gold' : 'on';
      pips.appendChild(s);
    }
  }

  function fxHtml(p, withName) {
    const items = [];
    if (p.frozen > 0) items.push(['❄️', 'Fryst', p.frozen, '#9be7ff']);
    if (p.sup.dunk) items.push(['💥', 'DUNK!', 0, '#ff7b00']);
    else if (p.sup.active) items.push(['⤒', 'I luften – skjut för +2', 0, '#7df9ff']);
    for (const k of FX_TYPES) if (p.fx[k] > 0) items.push([POWERS[k].icon, POWERS[k].name, p.fx[k], POWERS[k].color]);
    const who = withName ? `<b style="color:${PCOLOR[p.idx]}">SP${p.idx + 1}</b> ` : '';
    if (!items.length) return withName ? '' : '<span class="fx-none">Plocka upp superkrafter på planen!</span>';
    return items.map(([icon, name, sec, color]) =>
      `<span class="fx" style="color:${color}">${who}${icon} ${name}${sec ? ` <i>${Math.ceil(sec)} s</i>` : ''}</span>`).join('');
  }

  function updateHUD() {
    const secs = Math.ceil(S.time);
    const low = S.time < 15 && S.mode === 'playing';
    if (S.type === 'pvp') {
      setText('pvpTime', clock(secs));
      setClass('pvpTime', low ? 'low' : '');
      setHtml('pvpPoss', `<span style="color:${PCOLOR[player.idx]}">${pname(player)} ANFALLER</span>`);
      for (const p of P) {
        const i = p.idx, k = a => Controls.kbd(p.set, a), attack = p === player;
        setText('pvpScore' + i, String(p.score));
        setClass('pvpCard' + i, `panel pvp-card pvp-ui${i ? ' right' : ''}${attack ? ' attack' : ''}`);
        const lv = BALL_LEVELS[p.level];
        if (hudCache['lv' + i] !== p.level) {
          hudCache['lv' + i] = p.level;
          $('pvpBall' + i).textContent = `${lv.name} (${p.level}/10)`;
          $('pvpDot' + i).style.background = ballDotBg(lv);
        }
        setHtml('pvpRole' + i, attack
          ? `<b>ANFALLER</b><br>${Controls.moveKbds(p.set)}<br>${k('shoot')} skjut · ${k('fake')} finta`
          : `<b>FÖRSVARAR</b><br>${Controls.moveKbds(p.set)}<br>${k('shoot')} blocka · ${k('fake')} sno`);
        setHtml('pvpFx' + i, fxHtml(p, false));
      }
    } else {
      const hs = humans(), sum = key => hs.reduce((s, p) => s + p.st[key], 0);
      setText('modeLabel', S.type === 'train' ? 'TRÄNING · POÄNG' : mate || S.humans === 2 ? 'LAGET · POÄNG' : 'POÄNG');
      setText('score', String(TEAM.score));
      setText('time', clock(secs));
      setClass('time', low ? 'low' : '');
      setText('lives', hearts());
      const shots = sum('shots'), makes = sum('makes');
      setText('acc', `${makes} / ${shots} (${shots ? Math.round(100 * makes / shots) : 0} %)`);
      setText('streak', `${TEAM.streak} (bästa ${TEAM.bestStreak})`);
      $('defRow').style.display = bots().length ? '' : 'none';
      setText('defLvl', `NIVÅ ${TEAM.level} · ${S.opp} ${S.opp === 1 ? 'BOT' : 'BOTAR'}`);
      setHtml('fxList', hs.length > 1 ? (hs.map(p => fxHtml(p, true)).join('') || fxHtml({ frozen: 0, sup: {}, fx: {} }, false)) : fxHtml(P[0], false));
      setHtml('fakeStatus', `↯ FINT ${keyHtml(player, 'fake')}`);
      $('fakeCd').style.width = (100 * (1 - player.fakeCd / FAKE_CD)) + '%';
      if (S.humans === 2) setHtml('passHint', `⇄ PASSA ${Controls.kbd('p1', 'pass')} / ${Controls.kbd('p2', 'pass')}`);
    }
    const d = hdist(player.pos, hoopFloor), zone = World.zoneFor(d);
    setHtml('distance', `${d.toFixed(1).replace('.', ',')} m till korgen <b style="color:${zone.color}">${zone.pts}P</b>`);

    let info;
    if (S.type === 'pvp') info = {
      cols: [['SPELARE 1', String(P[0].score).padStart(2, '0'), PCOLOR[0]], ['TID', clock(secs), low ? '#ff4d6d' : '#ff6b3d'],
        ['SPELARE 2', String(P[1].score).padStart(2, '0'), PCOLOR[1]]],
      footer: [`${pname(player)} ANFALLER`, PCOLOR[player.idx]],
    };
    else {
      const hs = humans(), makes = hs.reduce((s, p) => s + p.st.makes, 0), shots = hs.reduce((s, p) => s + p.st.shots, 0);
      const lvl = bots().length ? `   NIVÅ ${TEAM.level}` : '';
      info = {
        cols: [['POÄNG', String(TEAM.score).padStart(3, '0'), '#ffb000'],
          S.type === 'train' ? ['TRÄFF', `${makes}/${shots}`, '#7df9ff', 90] : ['TID', clock(secs), secs <= 15 ? '#ff4d6d' : '#ff6b3d'],
          ['BOLL', `${ball.level}/10`, ball.level >= MAX_LEVEL ? '#ffd23f' : '#4ade80', 100]],
        footer: S.type === 'train' ? ['TRÄNING' + lvl, '#7df9ff']
          : [hearts() + lvl, '#ff5370'],
      };
    }
    world.drawJumbotron(info);
  }

  function updateMeter() {
    if (!player.charging) return;
    const { ideal, w, contested } = shotParams(hdist(player.pos, hoopFloor));
    $('meterZone').style.left = (ideal - w) * 100 + '%';
    $('meterZone').style.width = 2 * w * 100 + '%';
    $('meterPerfect').style.left = (ideal - w / 2) * 100 + '%';
    $('meterPerfect').style.width = w * 100 + '%';
    $('meterFill').style.width = player.power * 100 + '%';
    $('meterMark').style.left = player.power * 100 + '%';
    $('meter').classList.toggle('contested', contested);
    $('meterLabel').classList.toggle('contested', contested);
    const who = S.type === 'pvp' || mate ? pname(player) + ': ' : '';
    const key = isTouch() && !P[1].inPlay ? 'KNAPPEN' : Controls.label(Controls.get(player.set).shoot).toUpperCase();
    $('meterLabel').textContent = who + (contested ? 'MARKERAD – SVÅRARE SKOTT!' : `SLÄPP ${key} I DET GRÖNA`);
  }

  // ---------- huvudloop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000), t = now / 1000;
    last = now;
    if (S.mode !== 'paused') {
      world.update(dt, t);
      if (S.mode === 'countdown') updateCountdown(dt);
      if (S.mode === 'playing') updateTimers(dt);
      P.forEach(p => updateHuman(p, dt, t));
      separatePlayers();
      updateDefenders(dt, t);
      updateBall(dt);
      if (S.mode === 'playing') checkSteal(dt);
      updatePowers(dt, t);
      updateParticles(dt);
      updateCamera(dt, t);
      updateHUD();
      updateMeter();
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  renderBallHud();
  renderScoreboard($('menuBoard'));
  renderMenuControls();
  setupCast();
  resetPossession(true);
  requestAnimationFrame(frame);
})();
