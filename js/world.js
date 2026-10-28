// Swish Basket – arenan: plan, korg, publik, ljus och storbildsskärm
const World = (() => {
  // Banan: baslinjen ligger på z = 0, mittlinjen på z = 14. Korgen hänger ovanför (0, 3.05, 1.575).
  const HOOP = new THREE.Vector3(0, 3.05, 1.575);
  const RIM_R = 0.23;
  const BOARD_Z = 1.2;
  const ZONES = [
    { max: 4, pts: 1, color: '#4fc3f7', label: 'NÄRA SKOTT' },
    { max: 6.75, pts: 2, color: '#7ee081', label: 'TVÅPOÄNGARE' },
    { max: 10, pts: 3, color: '#ffb74d', label: 'TREPOÄNGARE' },
    { max: Infinity, pts: 5, color: '#ff6b81', label: 'LÅNGSKOTT' },
  ];
  const zoneFor = d => ZONES.find(z => d < z.max);
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  function courtTexture(renderer) {
    const S = 100, W = 1500, H = 1400;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const X = x => (x + 7.5) * S, Z = z => z * S;

    // parkettplankor längs banan
    const pw = 15;
    for (let x = 0; x < W; x += pw) {
      let y = -Math.random() * 400;
      while (y < H) {
        const len = 180 + Math.random() * 280;
        g.fillStyle = `hsl(${28 + Math.random() * 8}, ${50 + Math.random() * 12}%, ${55 + Math.random() * 9}%)`;
        g.fillRect(x, y, pw, len);
        g.fillStyle = 'rgba(70,35,10,0.35)';
        g.fillRect(x, y, 1, len);
        g.fillRect(x, y, pw, 2);
        y += len;
      }
    }
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = `rgba(90,50,20,${Math.random() * 0.08})`;
      g.fillRect(Math.random() * W, Math.random() * H, 1, 6 + Math.random() * 20);
    }

    const hx = X(HOOP.x), hz = Z(HOOP.z);
    // målade ytor
    g.fillStyle = 'rgba(32,72,170,0.88)';
    g.fillRect(X(-2.45), 0, 4.9 * S, 5.8 * S);
    g.beginPath(); g.arc(X(0), H, 1.8 * S, Math.PI, 2 * Math.PI); g.fill();

    // spelets poängzoner (streckade ringar)
    const zoneRing = (r, color) => {
      g.save(); g.setLineDash([26, 18]); g.strokeStyle = color; g.lineWidth = 8;
      g.beginPath(); g.arc(hx, hz, r * S, 0, Math.PI); g.stroke(); g.restore();
    };
    zoneRing(4, '#4fc3f7');
    zoneRing(10, '#ff6b81');

    // vanliga linjer
    g.strokeStyle = '#fff'; g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);
    g.strokeRect(X(-2.45), 0, 4.9 * S, 5.8 * S);
    g.beginPath(); g.arc(X(0), Z(5.8), 1.8 * S, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(hx, hz, 1.25 * S, 0, Math.PI); g.stroke();
    g.beginPath(); g.arc(X(0), H, 1.8 * S, Math.PI, 2 * Math.PI); g.stroke();
    // trepoängslinjen
    const a = Math.atan2(Z(2.99) - hz, 6.6 * S);
    g.beginPath();
    g.moveTo(X(-6.6), 0); g.lineTo(X(-6.6), Z(2.99));
    g.arc(hx, hz, 6.75 * S, Math.PI - a, a, true);
    g.lineTo(X(6.6), 0);
    g.stroke();

    // zonetiketter i golvet
    g.font = 'bold 110px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const label = (txt, x, z, color) => { g.globalAlpha = 0.5; g.fillStyle = color; g.fillText(txt, X(x), Z(z)); g.globalAlpha = 1; };
    label('1P', 0, 3.6, '#bfe9ff');
    label('2P', -4.3, 4.6, '#c9f7c9'); label('2P', 4.3, 4.6, '#c9f7c9');
    label('3P', -5.5, 8.6, '#ffe0b2'); label('3P', 5.5, 8.6, '#ffe0b2');
    label('5P', -5.2, 12.6, '#ffc1cc'); label('5P', 5.2, 12.6, '#ffc1cc');
    g.font = 'bold 70px "Arial Black", Arial, sans-serif';
    label('SB', 0, 13.2, '#ffd23f');

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  function buildCourt(scene, renderer) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 14),
      new THREE.MeshStandardMaterial({ map: courtTexture(renderer), color: '#c4b2a0', roughness: 0.45, envMapIntensity: 0.35 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 7);
    floor.receiveShadow = true;
    scene.add(floor);

    const apron = new THREE.Mesh(new THREE.PlaneGeometry(19, 21), new THREE.MeshStandardMaterial({ color: '#7a4a24', roughness: 0.5 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(0, -0.003, 7.5); apron.receiveShadow = true;
    scene.add(apron);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: '#1c2340', roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.01, 7);
    scene.add(ground);
  }

  function buildHoop(scene) {
    const dark = new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.4, metalness: 0.6 });
    const pad = new THREE.MeshStandardMaterial({ color: '#1e40af', roughness: 0.8 });
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; scene.add(m); return m; };

    add(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 16), dark, 0, 1.8, -1.0);
    add(new THREE.BoxGeometry(1.0, 0.9, 1.3), pad, 0, 0.45, -1.6);
    add(new THREE.BoxGeometry(0.14, 0.14, 2.2), dark, 0, 3.45, 0.1);

    // tavla av glas med vit ram och skjutruta
    const c = document.createElement('canvas'); c.width = 360; c.height = 210;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(220,235,255,0.22)'; g.fillRect(0, 0, 360, 210);
    g.strokeStyle = '#fff'; g.lineWidth = 12; g.strokeRect(6, 6, 348, 198);
    g.lineWidth = 8; g.strokeRect(121, 90, 118, 90);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.05), new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.1, metalness: 0.2 }));
    board.position.set(0, 3.425, BOARD_Z);
    scene.add(board);

    const rimMat = new THREE.MeshStandardMaterial({ color: '#ff5a1f', roughness: 0.35, metalness: 0.5, emissive: '#3a0a00' });
    const rim = add(new THREE.TorusGeometry(RIM_R, 0.012, 10, 40), rimMat, HOOP.x, HOOP.y, HOOP.z);
    rim.rotation.x = Math.PI / 2;
    const bl = HOOP.z - RIM_R - BOARD_Z;
    add(new THREE.BoxGeometry(0.12, 0.03, bl), rimMat, 0, HOOP.y, BOARD_Z + bl / 2);

    const netGeo = new THREE.CylinderGeometry(0.14, RIM_R, 0.42, 16, 4, true);
    netGeo.translate(0, -0.21, 0);
    const net = new THREE.Mesh(netGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.85 }));
    net.position.copy(HOOP);
    scene.add(net);
    return net;
  }

  function buildCrowd(scene) {
    const standMat = new THREE.MeshStandardMaterial({ color: '#232838', roughness: 0.9 });
    const seats = [];
    for (let r = 0; r < 8; r++) {
      const h = 0.45 * (r + 1);
      const bz = -3.2 - r * 0.9;
      const back = new THREE.Mesh(new THREE.BoxGeometry(28, h, 0.9), standMat);
      back.position.set(0, h / 2, bz); scene.add(back);
      for (let x = -13.5; x <= 13.5; x += 0.75) seats.push([x + (Math.random() - 0.5) * 0.15, h, bz]);
      for (const s of [-1, 1]) {
        const sx = s * (9.6 + r * 0.9);
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 21), standMat);
        side.position.set(sx, h / 2, 7.3); scene.add(side);
        for (let z = -2.6; z <= 17.5; z += 0.75) seats.push([sx, h, z + (Math.random() - 0.5) * 0.15]);
      }
    }
    const filled = seats.filter(() => Math.random() > 0.1);
    const N = filled.length;
    const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.62, 0.28), new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
    const shirts = ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#ffd23f', '#6a1b9a', '#2a9d8f', '#f4a261', '#ff6b81', '#1e88e5', '#ffffff', '#111111', '#ffd23f', '#6a1b9a'];
    const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#5c3a21'];
    const col = new THREE.Color();
    const data = filled.map((s, i) => {
      bodies.setColorAt(i, col.set(pick(shirts)));
      heads.setColorAt(i, col.set(pick(skins)));
      return { x: s[0], y: s[1], z: s[2], ph: Math.random() * 6.28, sp: 2 + Math.random() * 3 };
    });
    scene.add(bodies, heads);
    const dummy = new THREE.Object3D();
    return function update(t, excite) {
      for (let i = 0; i < N; i++) {
        const d = data[i];
        const jump = excite > 0.03 ? Math.max(0, Math.sin(t * d.sp * 2.2 + d.ph)) * excite * 0.45 : 0;
        const y = d.y + 0.31 + Math.sin(t * d.sp + d.ph) * 0.02 + jump;
        dummy.position.set(d.x, y, d.z); dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix);
        dummy.position.y = y + 0.44; dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
      }
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
    };
  }

  function buildAdBoards(scene) {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 96;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 96);
    grad.addColorStop(0, '#2a0f4a'); grad.addColorStop(1, '#12052a');
    g.fillStyle = grad; g.fillRect(0, 0, 2048, 96);
    g.font = 'bold 54px "Arial Black", Arial, sans-serif'; g.textBaseline = 'middle';
    const parts = [['SWISH BASKET', '#ffd23f'], ['  ★  ', '#ff6b81'], ['JAKTEN PÅ GULDBOLLEN', '#7df9ff'], ['  ★  ', '#ff6b81']];
    let x = 20;
    while (x < 2048) for (const [txt, color] of parts) { g.fillStyle = color; g.fillText(txt, x, 50); x += g.measureText(txt).width; }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const base = new THREE.Mesh(new THREE.PlaneGeometry(22, 0.9), mat);
    base.position.set(0, 0.45, -2.6); scene.add(base);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(18, 0.9), mat);
      side.position.set(s * 8.7, 0.45, 7); side.rotation.y = -s * Math.PI / 2; scene.add(side);
    }
    return tex;
  }

  function buildJumbotron(scene) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 400;
    const g = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    const grp = new THREE.Group();
    grp.position.set(0, 8.4, -5.5);
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(6.8, 2.9, 0.5), new THREE.MeshStandardMaterial({ color: '#111522', metalness: 0.6, roughness: 0.4 })));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.5), new THREE.MeshBasicMaterial({ map: tex }));
    screen.position.z = 0.26; grp.add(screen);
    for (const s of [-1, 1]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#333' }));
      cable.position.set(s * 2.8, 5.4, 0); grp.add(cable);
    }
    scene.add(grp);

    let last = '';
    return function draw(info) {
      // info = { cols: [[rubrik, värde, färg, storlek?] x3], footer: [text, färg] }
      const key = JSON.stringify(info);
      if (key === last) return;
      last = key;
      g.fillStyle = '#05070d'; g.fillRect(0, 0, 1024, 400);
      g.fillStyle = 'rgba(255,255,255,0.035)';
      for (let y = 0; y < 400; y += 6) g.fillRect(0, y, 1024, 2);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 34px "Arial Black", Arial, sans-serif'; g.fillStyle = '#7df9ff';
      g.fillText('SWISH BASKET ARENA', 512, 40);
      const col = (x, title, value, color, size = 120) => {
        g.font = 'bold 30px Arial, sans-serif'; g.fillStyle = '#9aa3c7'; g.fillText(title, x, 110);
        g.font = `bold ${size}px "Courier New", monospace`; g.fillStyle = color;
        g.shadowColor = color; g.shadowBlur = 24; g.fillText(value, x, 230); g.shadowBlur = 0;
      };
      info.cols.forEach(([title, value, color, size], i) => col([190, 512, 834][i], title, value, color, size));
      if (info.footer) {
        g.font = 'bold 44px Arial, sans-serif'; g.fillStyle = info.footer[1];
        g.fillText(info.footer[0], 512, 350);
      }
      tex.needsUpdate = true;
    };
  }

  function buildLights(scene, renderer) {
    scene.background = new THREE.Color('#0b1020');
    scene.fog = new THREE.Fog('#0b1020', 30, 65);
    scene.add(new THREE.HemisphereLight('#cfe0ff', '#4a3520', 0.55));
    const sun = new THREE.DirectionalLight('#ffffff', 0.75);
    sun.position.set(5, 16, 12); sun.target.position.set(0, 0, 6);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 45 });
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);
    const spot = new THREE.SpotLight('#fff3d6', 0.6, 30, 0.6, 0.5);
    spot.position.set(0, 12, 4); spot.target.position.copy(HOOP);
    scene.add(spot, spot.target);

    const lampMat = new THREE.MeshBasicMaterial({ color: '#fffbe8' });
    for (let x = -8; x <= 8; x += 4) for (let z = -2; z <= 16; z += 6) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.6), lampMat);
      l.position.set(x, 15, z); scene.add(l);
    }

    // enkel miljökarta så att silver- och guldbollen får något att spegla
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color('#1a1f30');
    const panel = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.2), panel);
      p.position.set(-6 + i * 2.4, 6, -2 + (i % 2) * 4); p.rotation.x = Math.PI / 2; env.add(p);
    }
    const warm = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: '#8a5a2a', side: THREE.DoubleSide }));
    warm.rotation.x = -Math.PI / 2; warm.position.y = -2; env.add(warm);
    scene.environment = pmrem.fromScene(env, 0.04).texture;
  }

  function build(scene, renderer) {
    buildLights(scene, renderer);
    buildCourt(scene, renderer);
    const net = buildHoop(scene);
    const updateCrowd = buildCrowd(scene);
    const adTex = buildAdBoards(scene);
    const drawJumbotron = buildJumbotron(scene);
    let excite = 0, netWobble = 0;
    return {
      drawJumbotron,
      cheer(v) { excite = Math.max(excite, v); },
      wobbleNet(v) { netWobble = Math.max(netWobble, v); },
      update(dt, t) {
        excite = Math.max(0, excite - dt * 0.35);
        updateCrowd(t, excite);
        netWobble *= Math.exp(-dt * 3);
        net.scale.y = 1 + Math.sin(t * 28) * 0.22 * netWobble + 0.15 * netWobble;
        net.scale.x = net.scale.z = 1 - 0.12 * netWobble;
        adTex.offset.x = (adTex.offset.x + dt * 0.04) % 1;
      },
    };
  }

  return { HOOP, RIM_R, BOARD_Z, ZONES, zoneFor, build };
})();
