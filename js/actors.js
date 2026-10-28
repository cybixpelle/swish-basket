// Swish Basket – spelarfigurer och bollens elva utseenden (skrutig → guld)
const Actors = (() => {
  const BALL_R = 0.12;

  const BALL_LEVELS = [
    { name: 'Skrutig boll',      color: '#7d6650', line: '#2b2118', rough: 1,    dirt: 1,    tape: true, squash: 0.9 },
    { name: 'Sliten gympaboll',  color: '#a8653a', line: '#2a1a10', rough: 0.95, dirt: 0.55, squash: 0.95 },
    { name: 'Gatuboll',          color: '#c8682a', line: '#1a120c', rough: 0.85, dirt: 0.25 },
    { name: 'Klubbboll',         color: '#dc6b22', line: '#120c08', rough: 0.75, dirt: 0.08 },
    { name: 'Matchboll',         color: '#ee7420', line: '#0d0906', rough: 0.6,  logo: true },
    { name: 'Blixtboll',         color: '#2a7bff', line: '#ffffff', rough: 0.45, emissive: '#0a2a80', ei: 0.5, logo: true },
    { name: 'Eldboll',           color: '#ff4a1a', line: '#3a0800', rough: 0.5,  emissive: '#ff3300', ei: 0.55, logo: true },
    { name: 'Neonboll',          color: '#33ff99', line: '#06240f', rough: 0.35, emissive: '#00ff66', ei: 0.6, logo: true },
    { name: 'Kristallboll',      color: '#bdeeff', line: '#5ab8ff', rough: 0.05, metal: 0.2, opacity: 0.72, emissive: '#3aa0ff', ei: 0.25 },
    { name: 'Silverboll',        color: '#e6ebf0', line: '#5c636b', rough: 0.18, metal: 1, logo: true },
    { name: 'GULDBOLLEN',        color: '#ffcf40', line: '#7a5200', rough: 0.15, metal: 1, emissive: '#6b4300', ei: 0.35, logo: true, glow: true },
  ];

  function ballTexture(lv) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = lv.color; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
      g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
    }
    if (lv.dirt) {
      for (let i = 0; i < 40 * lv.dirt; i++) {
        g.fillStyle = `rgba(50,35,20,${0.15 + Math.random() * 0.3 * lv.dirt})`;
        g.beginPath();
        g.ellipse(Math.random() * 512, Math.random() * 256, 8 + Math.random() * 30, 5 + Math.random() * 16, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(230,220,200,0.35)'; g.lineWidth = 1.5;
      for (let i = 0; i < 30 * lv.dirt; i++) {
        const x = Math.random() * 512, y = Math.random() * 256;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 20); g.stroke();
      }
    }
    if (lv.tape) {
      g.save(); g.translate(300, 90); g.rotate(0.3);
      g.fillStyle = '#9ea3a8'; g.fillRect(-36, -22, 72, 44);
      g.fillStyle = 'rgba(255,255,255,0.2)';
      for (let x = -36; x < 36; x += 8) g.fillRect(x, -22, 3, 44);
      g.restore();
    }
    if (lv.logo) {
      g.font = 'bold 40px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = lv.line; g.globalAlpha = 0.8; g.fillText('SB', 192, 70); g.fillText('SB', 448, 186); g.globalAlpha = 1;
    }
    // sömmar
    g.strokeStyle = lv.line; g.lineWidth = 7; g.lineCap = 'round';
    const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    line(0, 128, 512, 128); line(128, 0, 128, 256); line(384, 0, 384, 256);
    for (const cx of [0, 256, 512]) for (const s of [-1, 1]) {
      g.beginPath();
      for (let y = 0; y <= 256; y += 4) {
        const x = cx + s * 70 * Math.sin(Math.PI * y / 256);
        y ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    return new THREE.CanvasTexture(c);
  }

  const ballMats = BALL_LEVELS.map(lv => {
    const map = ballTexture(lv);
    const m = new THREE.MeshStandardMaterial({ map, roughness: lv.rough, metalness: lv.metal || 0, envMapIntensity: lv.metal ? 1.5 : 0.5 });
    if (lv.emissive) { m.emissive = new THREE.Color(lv.emissive); m.emissiveIntensity = lv.ei; m.emissiveMap = map; }
    if (lv.opacity) { m.transparent = true; m.opacity = lv.opacity; }
    return m;
  });

  function makeBall() {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 24), ballMats[0]);
    mesh.castShadow = true;
    mesh.add(new THREE.PointLight('#ffcc55', 0, 5));
    setBallLevel(mesh, 0);
    return mesh;
  }

  function setBallLevel(mesh, level) {
    const lv = BALL_LEVELS[level];
    mesh.material = ballMats[level];
    mesh.scale.set(1.03, lv.squash || 1, 0.98);
    mesh.children[0].intensity = lv.glow ? 1.4 : 0;
  }

  function numberTexture(num, bg, fg, trim) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
    g.fillStyle = trim; g.fillRect(0, 0, 128, 10);
    g.font = 'bold 76px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = trim; g.strokeText(num, 64, 72);
    g.fillStyle = fg; g.fillText(num, 64, 72);
    return new THREE.CanvasTexture(c);
  }

  function makeLabelSprite(text, color) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = 'bold 84px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#000'; g.strokeText(text, 64, 68);
    g.fillStyle = color; g.fillText(text, 64, 68);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.scale.set(0.6, 0.6, 1);
    return s;
  }

  // En figur som tittar mot -z. Armar och ben hänger i pivotgrupper så de kan svänga.
  function makePerson(o) {
    const group = new THREE.Group();
    const mat = (color, rough = 0.75) => new THREE.MeshStandardMaterial({ color, roughness: rough });
    const skin = mat(o.skin, 0.6), jersey = mat(o.jersey), shorts = mat(o.shorts);
    const shoe = mat(o.shoes || '#f5f5f5', 0.5), sock = mat('#ffffff'), hair = mat(o.hair || '#1a1a1a', 0.9);
    const numMat = new THREE.MeshStandardMaterial({ map: numberTexture(o.number, o.jersey, o.numberColor || '#fff', o.trim), roughness: 0.75 });
    const add = (parent, geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh);
      return mesh;
    };

    const torso = add(group, new THREE.BoxGeometry(0.52, 0.66, 0.28), [jersey, jersey, jersey, jersey, numMat, numMat], 0, 1.3, 0);
    add(group, new THREE.BoxGeometry(0.54, 0.3, 0.3), shorts, 0, 0.9, 0);
    add(group, new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skin, 0, 1.67, 0);

    const head = new THREE.Group();
    head.position.set(0, 1.83, 0); group.add(head);
    add(head, new THREE.SphereGeometry(0.15, 20, 16), skin, 0, 0, 0);
    add(head, new THREE.SphereGeometry(0.156, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, 0, 0.01, 0.01);
    const eye = mat('#111', 0.3);
    add(head, new THREE.SphereGeometry(0.022, 8, 6), eye, -0.055, 0.02, -0.135);
    add(head, new THREE.SphereGeometry(0.022, 8, 6), eye, 0.055, 0.02, -0.135);
    if (o.headband) add(head, new THREE.CylinderGeometry(0.16, 0.16, 0.05, 20, 1, true), mat(o.headband), 0, 0.06, 0);

    const arm = side => {
      const p = new THREE.Group(); p.position.set(side * 0.34, 1.58, 0); group.add(p);
      add(p, new THREE.BoxGeometry(0.15, 0.12, 0.2), jersey, 0, -0.02, 0);
      add(p, new THREE.BoxGeometry(0.13, 0.62, 0.14), skin, 0, -0.31, 0);
      add(p, new THREE.SphereGeometry(0.075, 10, 8), skin, 0, -0.66, 0);
      return p;
    };
    const leg = side => {
      const p = new THREE.Group(); p.position.set(side * 0.14, 0.82, 0); group.add(p);
      add(p, new THREE.BoxGeometry(0.17, 0.7, 0.18), skin, 0, -0.35, 0);
      add(p, new THREE.BoxGeometry(0.19, 0.1, 0.19), sock, 0, -0.63, 0);
      add(p, new THREE.BoxGeometry(0.2, 0.12, 0.32), shoe, 0, -0.74, -0.05);
      return p;
    };
    return { group, torso, head, armL: arm(-1), armR: arm(1), legL: leg(-1), legR: leg(1) };
  }

  // walk = gångfas, amt = 0..1 hur mycket benen svänger. armL/armR överstyr armarnas vinkel framåt.
  function pose(p, walk, amt, armL, armR, spread = 0) {
    const s = Math.sin(walk) * 0.75 * amt;
    p.legL.rotation.x = s;
    p.legR.rotation.x = -s;
    p.armL.rotation.x = armL ?? -s * 0.8;
    p.armR.rotation.x = armR ?? s * 0.8;
    p.armL.rotation.z = -spread;
    p.armR.rotation.z = spread;
  }

  return { BALL_R, BALL_LEVELS, makeBall, setBallLevel, makePerson, makeLabelSprite, pose };
})();
